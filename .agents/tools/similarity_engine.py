#!/usr/bin/env python3
"""
Similarity Engine — Fast multi-signal topic similarity scanner with lane/global scope.

Designed to scale to 10,000+ history entries. All methods are pure Python,
no external dependencies.

Architecture:
  Tier 1 (this module): Scan entries in the requested lane or global scope using 4 signals,
  return top-k most similar candidates for Tier 2 (AI deep semantic check).

Signals:
  ① Improved Keyword Jaccard (Vietnamese-aware)
  ② Character Trigram similarity (language-agnostic paraphrase detection)
  ③ Named Entity matching bonus (proper nouns like Vostok, J1407b)
  ④ TF-IDF weighted bonus (rare words weigh more)
  ⑤ VI↔EN canonical concept similarity for cross-language retrieval

Scope:
  Default CLI mode compares within the same (language, video_type) lane; V8 primary duplicate gate uses global scope:
    - vi_short, vi_long, en_short, en_long
"""

import json
import math
import re
import sys
from collections import Counter
from functools import lru_cache
from typing import Dict, List, Set, Tuple

try:
    from semantic_concepts import concepts as semantic_concepts, similarity as concept_similarity
except ImportError:  # package-style imports in unit tests
    from .semantic_concepts import concepts as semantic_concepts, similarity as concept_similarity

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


# ── Vietnamese diacritics removal table ──────────────────────────────────────

_VN_DIACRITICS = {
    'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
    'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
    'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
    'đ': 'd',
    'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
    'ê': 'e', 'ề': 'e', 'ế': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
    'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
    'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
    'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
    'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
    'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
    'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
    'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
}

# Stopwords — carefully curated to avoid removing domain-significant words.
# Removed from the original list:
#   'bang' → collision with 'băng' (ice/glacier), critical in science domain
#   'bi'   → collision with 'bí' (mystery/secret)
#   'do'   → collision with 'đỏ' (red) and 'độ' (degree)
#   'an'   → collision with 'ẩn' (hidden)
# These are kept because their domain meaning is more important than their
# function-word meaning in this science/space context.
STOPWORDS: Set[str] = {
    # Vietnamese function words (safe to remove)
    'va', 'cua', 'la', 'co', 'mot', 'trong', 'nay', 'den', 'thi',
    'nhu', 'duoc', 'se', 'da', 'cac', 'cho', 'voi', 'tren',
    'nhat', 'hon', 'hay', 'ma', 'khi', 'neu', 'roi', 'rat',
    'nhung', 'tai', 'sao', 'vi', 'bao', 'gio', 'nao',
    # English function words
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be',
    'been', 'has', 'have', 'had', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'can', 'this', 'that',
    'these', 'those', 'its', 'not', 'no', 'how', 'what', 'why',
    'who', 'when', 'where', 'which', 'than',
}


# Precomputed once at import time: str.translate() strips all diacritics in a
# single pass instead of looping through ~90 .replace() calls per invocation.
_VN_DIACRITICS_TABLE = str.maketrans(_VN_DIACRITICS)
_NON_ALNUM_SPACE_RE = re.compile(r'[^a-z0-9\s]')


@lru_cache(maxsize=8192)
def normalize_text(text: str) -> str:
    """Normalize text for comparison: lowercase, remove diacritics, clean.

    Cached: the same title/content strings are normalized repeatedly across
    the several similarity signals computed per history entry (and across
    repeated scans), so memoizing this pure function avoids redundant work
    without changing any output.
    """
    text = text.lower().translate(_VN_DIACRITICS_TABLE)
    # Keep only alphanumeric and spaces
    text = _NON_ALNUM_SPACE_RE.sub(' ', text)
    return ' '.join(text.split())


@lru_cache(maxsize=8192)
def extract_keywords(text: str) -> Set[str]:
    """Vietnamese-aware keyword extraction.

    Key fix: keeps words with len >= 2 (not > 2), so Vietnamese words like
    'ho' (hồ/lake), 'bi' (bí/mystery), 'an' (ẩn/hidden) are preserved.

    Cached (pure function of text): the same title/content is re-extracted
    by multiple independent signal functions (keyword_jaccard, tfidf_bonus,
    content_divergence) per entry per scan.
    """
    normalized = normalize_text(text)
    words = normalized.split()
    return {w for w in words if len(w) >= 2 and w not in STOPWORDS}


@lru_cache(maxsize=8192)
def make_trigrams(text: str) -> Set[str]:
    """Generate character-level trigrams for paraphrase detection.

    Character trigrams catch similarity even when wording is completely
    different, because shared substrings (like 'vostok') produce many
    overlapping trigrams. Cached for the same reason as extract_keywords.
    """
    t = normalize_text(text)
    if len(t) < 3:
        return {t} if t else set()
    return {t[i:i + 3] for i in range(len(t) - 2)}


@lru_cache(maxsize=8192)
def extract_entities(text: str) -> Set[str]:
    """Extract likely proper nouns and science identifiers.

    Heuristic: words that start with uppercase in the original text,
    contain digits, or match known scientific patterns (e.g., FRB, QSO,
    WASP-xxx, J1407b).

    These are normalized to lowercase for comparison.
    """
    entities: Set[str] = set()
    # Split on whitespace, preserving original casing
    words = text.split()
    for w in words:
        clean = w.strip('?!.,;:()[]"\'–—')
        if len(clean) < 3:
            continue
        lower = clean.lower()
        if lower in STOPWORDS:
            continue
        # Proper noun: starts with uppercase (and is not the first word
        # of a sentence — we can't easily detect sentence boundaries here,
        # so we accept some noise)
        is_proper = clean[0].isupper() and not clean.isupper()
        # All-caps short identifier (e.g., CERN, LIGO, JWST)
        is_acronym = clean.isupper() and 2 <= len(clean) <= 6
        # Contains digits (e.g., J1407b, FRB 121102, TON 618)
        has_digits = any(c.isdigit() for c in clean)
        # Science pattern: uppercase + digits or hyphenated identifiers
        is_science_id = bool(re.match(r'^[A-Z]{1,5}[\-\s]?\d', clean))

        if is_proper or is_acronym or has_digits or is_science_id:
            entities.add(lower)
    return entities


class SimilarityEngine:
    """Fast multi-signal topic similarity scanner with lane-based filtering.

    Usage:
        engine = SimilarityEngine.from_history_file(
            'database/history.json', language='vi', video_type='long'
        )
        candidates = engine.scan_all('Hồ Vostok Nam Cực', top_k=20)
        # candidates = [(score, entry), ...] sorted by score DESC
    """

    def __init__(self, history: List[Dict], language: str, video_type: str, scope: str = "lane"):
        """Initialize with lane-filtered or global history.

        Args:
            history: Full history array (all entries).
            language: 'vi' or 'en' — lane filter.
            video_type: 'short' or 'long' — lane filter.
        """
        self.language = language
        self.video_type = video_type
        self.scope = scope

        # V8 supports two scopes without changing history schema:
        # - lane: backward-compatible (language + video type)
        # - global: all languages/types, used by the primary duplicate gate so
        #   translation or format changes cannot hide a repeated core topic.
        if scope == 'global':
            self.lane_entries = list(history)
        else:
            self.lane_entries = [
                e for e in history
                if e.get('language') == language and e.get('type') == video_type
            ]

        # Build IDF cache from lane entries (computed once, reused per scan)
        self._idf: Dict[str, float] = {}
        self._build_idf()

    @classmethod
    def from_history_file(cls, history_path: str, language: str,
                          video_type: str, scope: str = 'lane') -> 'SimilarityEngine':
        """Create engine from a history.json file path."""
        try:
            with open(history_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            data = []

        if isinstance(data, list):
            entries = data
        elif isinstance(data, dict):
            entries = data.get('topics', [])
        else:
            entries = []

        return cls(entries, language, video_type, scope=scope)

    # ── IDF computation ──────────────────────────────────────────────────

    def _build_idf(self) -> None:
        """Build inverse document frequency from lane entries.

        IDF(word) = log(N / df(word)) where df = number of entries
        containing that word. Rare words get higher IDF.
        """
        n = len(self.lane_entries)
        if n == 0:
            return

        # Document frequency: how many entries contain each keyword
        df: Counter = Counter()
        for entry in self.lane_entries:
            # Combine title + main_video_content for keyword extraction
            combined = (entry.get('title', '') + ' ' +
                        entry.get('main_video_content', ''))
            kws = extract_keywords(combined)
            for kw in kws:
                df[kw] += 1

        # IDF = log(N / df). Words appearing in ALL docs get IDF ≈ 0.
        for word, freq in df.items():
            self._idf[word] = math.log(n / freq) if freq > 0 else 0.0

    # ── Signal ① — Keyword Jaccard ───────────────────────────────────────

    def keyword_jaccard(self, text_a: str, text_b: str) -> float:
        """Improved Jaccard similarity on keywords (Vietnamese-aware)."""
        kw_a = extract_keywords(text_a)
        kw_b = extract_keywords(text_b)
        if not kw_a or not kw_b:
            return 0.0
        intersection = len(kw_a & kw_b)
        union = len(kw_a | kw_b)
        return intersection / union if union > 0 else 0.0

    # ── Signal ② — Character Trigram ─────────────────────────────────────

    def trigram_similarity(self, text_a: str, text_b: str) -> float:
        """Character-level trigram Jaccard similarity."""
        tri_a = make_trigrams(text_a)
        tri_b = make_trigrams(text_b)
        if not tri_a or not tri_b:
            return 0.0
        intersection = len(tri_a & tri_b)
        union = len(tri_a | tri_b)
        return intersection / union if union > 0 else 0.0

    # ── Signal ③ — Named Entity Bonus ────────────────────────────────────

    def entity_bonus(self, text_a: str, text_b: str) -> float:
        """Bonus when texts share proper nouns / science identifiers.

        Any shared entity (like 'Vostok', 'J1407b', 'Movile') gives a
        significant bonus because in this domain, sharing a proper noun
        almost certainly means the same core subject.
        """
        ents_a = extract_entities(text_a)
        ents_b = extract_entities(text_b)
        shared = ents_a & ents_b
        if not shared:
            return 0.0
        # More shared entities = higher bonus (capped at 0.35)
        return min(0.35, len(shared) * 0.15)

    # ── Signal ④ — TF-IDF Bonus ──────────────────────────────────────────

    def tfidf_bonus(self, text_a: str, text_b: str) -> float:
        """Bonus based on shared rare keywords (high IDF).

        A word like 'Vostok' that appears in only 1/100 entries has very
        high IDF. Sharing it almost guarantees same topic.
        """
        kw_a = extract_keywords(text_a)
        kw_b = extract_keywords(text_b)
        shared = kw_a & kw_b
        if not shared:
            return 0.0

        # Sum IDF of shared keywords, normalize by count
        total_idf = sum(self._idf.get(w, 0.0) for w in shared)
        avg_idf = total_idf / len(shared)

        # Scale: avg_idf of ~3 (very rare) → bonus ~0.20
        # avg_idf of ~1 (somewhat common) → bonus ~0.07
        return min(0.20, avg_idf * 0.065)

    # ── Signal ⑤ — Cross-language concept similarity ───────────────────

    def concept_similarity(self, text_a: str, text_b: str) -> float:
        """Canonical VI↔EN concept similarity for the two active topic domains."""
        return concept_similarity(text_a, text_b)

    # ── Combined score ───────────────────────────────────────────────────

    def _combined_score(self, new_topic: str, existing_text: str) -> float:
        """Combine lexical, character, entity, rarity and bilingual concepts."""
        if not existing_text or not existing_text.strip():
            return 0.0

        kw = self.keyword_jaccard(new_topic, existing_text)
        tri = self.trigram_similarity(new_topic, existing_text)
        ent = self.entity_bonus(new_topic, existing_text)
        tfidf = self.tfidf_bonus(new_topic, existing_text)
        concept = self.concept_similarity(new_topic, existing_text)

        # Concept similarity is a retrieval signal, not a final verdict. It is
        # intentionally strong enough to pull translations into top-k for AI.
        return min(1.25, max(kw, tri, concept * 0.96) + ent + tfidf)

    def content_divergence(self, new_topic: str, entry: Dict) -> float:
        """Measure how DIFFERENT the content is despite surface similarity.

        High divergence = shared keywords but different core content.
        This helps distinguish:
          - Same keyword, same content (low divergence → DUPLICATE)
          - Same keyword, different content (high divergence → ALLOW)

        Returns a value from 0.0 (identical content) to 1.0 (completely different).
        """
        title = entry.get('title', '')
        content = entry.get('main_video_content', '')

        # Use the richer source for comparison
        existing_text = content if (content and content != title and len(content) > len(title)) else title

        # Extract keywords from both
        kw_new = extract_keywords(new_topic)
        kw_existing = extract_keywords(existing_text)

        if not kw_new or not kw_existing:
            return 1.0  # Can't compare → assume different

        # Shared vs unique keywords
        shared = kw_new & kw_existing
        only_new = kw_new - kw_existing
        only_existing = kw_existing - kw_new

        concept_sim = self.concept_similarity(new_topic, existing_text)
        if not shared:
            # Cross-language translations may share zero surface words while
            # expressing the same concept bundle. Do not call them divergent.
            if concept_sim >= 0.45:
                return max(0.0, 1.0 - concept_sim)
            return 1.0  # Nothing in common lexically or conceptually

        # Divergence = ratio of unique keywords to total keywords
        # If most keywords are unique (not shared), content is different
        total_unique = len(only_new) + len(only_existing)
        total_all = len(kw_new | kw_existing)
        keyword_divergence = total_unique / total_all if total_all > 0 else 1.0

        # Character trigrams are monolingual; bilingual concept similarity
        # prevents translated duplicates from being misclassified as divergent.
        tri_sim = self.trigram_similarity(new_topic, existing_text)
        semantic_divergence = 1.0 - max(tri_sim, concept_sim)

        # When bilingual concepts strongly match, they dominate the divergence
        # estimate. Otherwise keep lexical angle-difference sensitivity.
        if concept_sim >= 0.65:
            return semantic_divergence * 0.75 + keyword_divergence * 0.25
        return keyword_divergence * 0.6 + semantic_divergence * 0.4

    # ── Main scan ────────────────────────────────────────────────────────

    def scan_all(self, new_topic: str, top_k: int = 20) -> List[Tuple[float, Dict]]:
        """Scan all entries in the lane, return top-k most similar.

        Compares against BOTH title AND main_video_content for each entry,
        taking the higher score. Also computes content_divergence to detect
        'same keyword, different content' cases.

        Returns:
            List of (score, entry) tuples. Each entry is augmented with
            '_scan_detail' containing signal breakdown and divergence.
        """
        if not self.lane_entries:
            return []

        scored: List[Tuple[float, Dict]] = []

        for entry in self.lane_entries:
            title = entry.get('title', '')
            content = entry.get('main_video_content', '')

            # Score against both title and content, take the max
            score_title = self._combined_score(new_topic, title)
            score_content = self._combined_score(new_topic, content)
            score = max(score_title, score_content)

            # Compute content divergence
            divergence = self.content_divergence(new_topic, entry)

            # Augment entry with scan detail (non-destructive copy)
            augmented = dict(entry)
            augmented['_scan_detail'] = {
                'similarity': round(score, 3),
                'content_divergence': round(divergence, 3),
                'title_sim': round(score_title, 3),
                'content_sim': round(score_content, 3),
                'concept_sim': round(max(self.concept_similarity(new_topic, title), self.concept_similarity(new_topic, content)), 3),
                'new_topic_concepts': sorted(semantic_concepts(new_topic))[:20],
                # Classification for combine_global to use:
                # - 'near_identical': high similarity, low divergence → almost certainly duplicate
                # - 'same_keyword_diff_content': high similarity but high divergence → different angle
                # - 'similar': moderate similarity → needs AI to decide
                'classification': self._classify(score, divergence),
            }

            scored.append((score, augmented))

        # Sort by score descending
        scored.sort(key=lambda x: -x[0])
        return scored[:top_k]

    @staticmethod
    def _classify(similarity: float, divergence: float) -> str:
        """Classify a candidate based on similarity + divergence.

        This classification helps combine_global() make better decisions
        even when AI is unavailable.
        """
        if similarity >= 0.70 and divergence < 0.50:
            return 'near_identical'  # Very likely same content
        if similarity >= 0.45 and divergence >= 0.60:
            return 'same_keyword_diff_content'  # Shared keyword, different angle
        if similarity >= 0.45:
            return 'similar'  # Needs AI to decide
        return 'distinct'  # Probably different

    def summarize_results(self, candidates: List[Tuple[float, Dict]],
                          threshold: float = 0.35) -> Dict:
        """Summarize scan results."""
        if not candidates:
            return {
                'is_unique': True,
                'max_similarity': 0.0,
                'threshold': threshold,
                'similar_count': 0,
                'similar_topics': [],
                'lane': ('global' if self.scope == 'global' else f'{self.language}_{self.video_type}'),
                'lane_size': len(self.lane_entries),
                'has_near_identical': False,
                'has_same_keyword_diff_content': False,
            }

        max_sim = candidates[0][0] if candidates else 0.0
        similar = []
        has_near_identical = False
        has_same_keyword_diff_content = False

        for score, entry in candidates:
            detail = entry.get('_scan_detail', {})
            classification = detail.get('classification', 'distinct')

            if classification == 'near_identical':
                has_near_identical = True
            if classification == 'same_keyword_diff_content':
                has_same_keyword_diff_content = True

            if score >= threshold:
                similar.append({
                    'id': entry.get('id', 'unknown'),
                    'title': entry.get('title', ''),
                    'main_video_content': entry.get('main_video_content', ''),
                    'similarity': round(score, 3),
                    'content_divergence': detail.get('content_divergence', 0),
                    'classification': classification,
                    'date': entry.get('date', ''),
                    'type': entry.get('type', ''),
                    'language': entry.get('language', ''),
                })

        return {
            'is_unique': len(similar) == 0,
            'max_similarity': round(max_sim, 3),
            'threshold': threshold,
            'similar_count': len(similar),
            'similar_topics': similar[:5],
            'lane': ('global' if self.scope == 'global' else f'{self.language}_{self.video_type}'),
            'lane_size': len(self.lane_entries),
            'has_near_identical': has_near_identical,
            'has_same_keyword_diff_content': has_same_keyword_diff_content,
        }


# ── CLI interface ────────────────────────────────────────────────────────────

def main():
    """CLI: scan history for similar topics within a lane."""
    import argparse

    parser = argparse.ArgumentParser(
        description='Fast multi-signal topic similarity scanner with lane/global scope'
    )
    parser.add_argument('--new-topic', required=True,
                        help='New topic to check')
    parser.add_argument('--history', default='database/history.json',
                        help='Path to history.json')
    parser.add_argument('--language', required=True, choices=['vi', 'en'],
                        help='Video language (lane filter)')
    parser.add_argument('--video-type', required=True, choices=['short', 'long'],
                        help='Video type (lane filter)')
    parser.add_argument('--top-k', type=int, default=20,
                        help='Number of top candidates to return (default: 20)')
    parser.add_argument('--threshold', type=float, default=0.35,
                        help='Similarity threshold (default: 0.35)')
    parser.add_argument('--json-output', action='store_true',
                        help='Output as JSON')
    parser.add_argument('--scope', choices=['lane','global'], default='lane',
                        help='Comparison scope: lane (default) or global cross-language/cross-format history')
    args = parser.parse_args()

    engine = SimilarityEngine.from_history_file(
        args.history, args.language, args.video_type, scope=args.scope
    )
    candidates = engine.scan_all(args.new_topic, top_k=args.top_k)
    result = engine.summarize_results(candidates, args.threshold)

    if args.json_output:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print("=" * 70)
        print("SIMILARITY ENGINE — MULTI-SIGNAL SCAN")
        print("=" * 70)
        print(f"New topic: {args.new_topic}")
        print(f"Lane: {result['lane']} ({result['lane_size']} entries)")
        print(f"Threshold: {args.threshold:.0%}")
        print(f"Max similarity: {result['max_similarity']:.0%}")
        print()

        if result['is_unique']:
            print("✅ UNIQUE — No similar topics found in this lane")
        else:
            print(f"⚠️  SIMILAR — Found {result['similar_count']} similar topic(s):")
            print()
            for i, t in enumerate(result['similar_topics'], 1):
                print(f"  {i}. [{t['similarity']:.0%}] {t['title']}")
                mvc = t.get('main_video_content', '')
                if mvc and mvc != t['title']:
                    print(f"     Content: {mvc[:100]}...")
                print(f"     Date: {t['date'][:10]}")
                print()

    sys.exit(0 if result['is_unique'] else 1)


if __name__ == '__main__':
    main()
