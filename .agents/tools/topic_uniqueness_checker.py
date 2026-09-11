#!/usr/bin/env python3
"""
Topic Uniqueness Checker
Kiểm tra xem chủ đề mới có trùng lặp với các video đã làm không

Usage:
    python topic_uniqueness_checker.py --new-topic "Chủ đề mới" --history database/history.json
    
Returns:
    Exit 0: Topic is unique (can proceed)
    Exit 1: Topic is duplicate (need new angle)
    Prints similarity score and suggestions
"""

import json
import sys
import argparse
from typing import List, Dict, Tuple
import re

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def normalize_text(text: str) -> str:
    """Chuẩn hóa text để so sánh"""
    # Lowercase
    text = text.lower()
    
    # Remove diacritics (Vietnamese)
    replacements = {
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
    for vn, en in replacements.items():
        text = text.replace(vn, en)
    
    # Remove special characters, keep only alphanumeric and spaces
    text = re.sub(r'[^a-z0-9\s]', ' ', text)
    
    # Remove extra spaces
    text = ' '.join(text.split())
    
    return text


def extract_keywords(text: str) -> set:
    """Trích xuất keywords từ text"""
    # Normalize first
    normalized = normalize_text(text)
    
    # Split into words
    words = normalized.split()
    
    # Remove common stopwords (Vietnamese + English)
    # NOTE: Carefully curated to avoid removing domain-significant words.
    # Removed from original list:
    #   'bang' → collision with 'băng' (ice/glacier), critical in science domain
    #   'bi'   → collision with 'bí' (mystery/secret)
    #   'do'   → collision with 'đỏ' (red) and 'độ' (degree)
    stopwords = {
        # Vietnamese function words (safe to remove)
        'va', 'cua', 'la', 'co', 'mot', 'trong', 'nay', 'den', 'thi',
        'nhu', 'duoc', 'se', 'da', 'cac', 'cho', 'voi', 'tren',
        'nhat', 'hon', 'hay', 'ma', 'khi', 'neu',
        # English
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
        'has', 'have', 'had', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
    }
    
    # Filter stopwords — keep words with len >= 2 (not > 2)
    # Vietnamese words like 'hồ'→'ho' (lake), 'bí'→'bi' (mystery) are only
    # 2 chars after diacritics removal but are domain-significant
    keywords = {w for w in words if len(w) >= 2 and w not in stopwords}
    
    return keywords


def calculate_similarity(topic1: str, topic2: str) -> float:
    """
    Tính độ tương đồng giữa 2 topics (0.0 - 1.0)
    
    Method: Jaccard similarity on keywords
    """
    kw1 = extract_keywords(topic1)
    kw2 = extract_keywords(topic2)
    
    if not kw1 or not kw2:
        return 0.0
    
    # Jaccard similarity: |A ∩ B| / |A ∪ B|
    intersection = len(kw1 & kw2)
    union = len(kw1 | kw2)
    
    similarity = intersection / union if union > 0 else 0.0
    
    return similarity


def check_topic_uniqueness(
    new_topic: str,
    history_path: str,
    threshold: float = 0.5,
    language: str = None,
    video_type: str = None
) -> Tuple[bool, List[Dict], float]:
    """
    Kiểm tra topic có unique không
    
    Args:
        new_topic: Chủ đề mới cần kiểm tra
        history_path: Path to history.json
        threshold: Ngưỡng similarity (0.5 = 50%)
        language: Optional lane filter ('vi' or 'en')
        video_type: Optional lane filter ('short' or 'long')
    
    Returns:
        (is_unique, similar_topics, max_similarity)
        - is_unique: True nếu topic đủ unique
        - similar_topics: List các topics tương tự
        - max_similarity: Similarity cao nhất tìm thấy
    """
    # Load history
    try:
        with open(history_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        # No history yet, all topics are unique
        return True, [], 0.0
    except json.JSONDecodeError:
        print(f"ERROR: Cannot parse {history_path}", file=sys.stderr)
        return False, [], 0.0
    
    # Extract topics from history.
    # database/history.json is a top-level ARRAY of entries (see
    # .agents/03_data_schemas.md §1) — NOT an object with a "topics" key.
    # Support the array form (correct/expected) and, defensively, an
    # {"topics": [...]} wrapper in case an older/alternate export is passed.
    if isinstance(data, list):
        topics = data
    elif isinstance(data, dict):
        topics = data.get('topics', [])
    else:
        print(f"ERROR: unexpected root type in {history_path} (expected a JSON array)", file=sys.stderr)
        topics = []
    
    # Lane filter: only compare within the same (language, type) lane
    if language or video_type:
        filtered = []
        for t in topics:
            if language and t.get('language') != language:
                continue
            if video_type and t.get('type') != video_type:
                continue
            filtered.append(t)
        topics = filtered
    
    # Calculate similarities
    similar_topics = []
    max_similarity = 0.0
    
    for entry in topics:
        # Check both title and main_video_content
        title = entry.get('title', '')
        content = entry.get('main_video_content', '')
        
        # Calculate similarity with both
        sim_title = calculate_similarity(new_topic, title)
        sim_content = calculate_similarity(new_topic, content)
        sim = max(sim_title, sim_content)
        
        if sim > max_similarity:
            max_similarity = sim
        
        # If above threshold, add to similar list
        if sim >= threshold:
            similar_topics.append({
                'id': entry.get('id', 'unknown'),
                'title': title,
                'main_video_content': content,
                'similarity': sim,
                'date': entry.get('date', ''),
                'type': entry.get('type', 'short'),
                'language': entry.get('language', 'vi')
            })
    
    # Sort by similarity descending
    similar_topics.sort(key=lambda x: x['similarity'], reverse=True)
    
    # Topic is unique if no similar topics found
    is_unique = len(similar_topics) == 0
    
    return is_unique, similar_topics, max_similarity


def suggest_alternative_angle(new_topic: str, similar_topics: List[Dict]) -> str:
    """Gợi ý góc nhìn mới cho topic"""
    
    if not similar_topics:
        return "Topic is unique, no alternative needed."
    
    # Extract keywords from similar topics
    used_keywords = set()
    for topic in similar_topics:
        kw = extract_keywords(topic['title'])
        used_keywords.update(kw)
    
    # Suggest different angles
    suggestions = [
        "\n🎯 SUGGESTIONS FOR NEW ANGLE:",
        "",
        f"Similar topics found: {len(similar_topics)} videos",
        "",
        "Consider these different approaches:",
        "1. Focus on a SPECIFIC ASPECT (not covered in past videos)",
        "2. Use a DIFFERENT TIME PERIOD (recent discovery vs historical)",
        "3. Change PERSPECTIVE (from observer to participant)",
        "4. Add COMPARISON (vs other phenomena)",
        "5. Focus on IMPLICATIONS (what this means for humanity)",
        "",
        "Example transformations:",
    ]
    
    # Show example transformations
    if similar_topics:
        first = similar_topics[0]
        original = first['title']
        
        suggestions.extend([
            f"  Original: {original}",
            "  → Angle 1: [Specific aspect] + original topic",
            "  → Angle 2: [Recent update 2026] + original topic",
            "  → Angle 3: [What scientists don't tell you about] + original topic",
            "  → Angle 4: [Comparison with similar phenomenon]",
            "  → Angle 5: [Impact on Earth/humanity]",
        ])
    
    return "\n".join(suggestions)


def main():
    parser = argparse.ArgumentParser(
        description='Check if a topic is unique compared to history'
    )
    parser.add_argument(
        '--new-topic',
        required=True,
        help='New topic to check'
    )
    parser.add_argument(
        '--history',
        default='database/history.json',
        help='Path to history.json (default: database/history.json)'
    )
    parser.add_argument(
        '--threshold',
        type=float,
        default=0.5,
        help='Similarity threshold 0.0-1.0 (default: 0.5 = 50%%)'
    )
    parser.add_argument(
        '--language',
        choices=['vi', 'en'],
        help='Lane filter: only compare within same language'
    )
    parser.add_argument(
        '--video-type',
        choices=['short', 'long'],
        help='Lane filter: only compare within same video type'
    )
    parser.add_argument(
        '--json-output',
        action='store_true',
        help='Output results as JSON'
    )
    
    args = parser.parse_args()
    
    # Check uniqueness
    is_unique, similar_topics, max_similarity = check_topic_uniqueness(
        args.new_topic,
        args.history,
        args.threshold,
        language=args.language,
        video_type=args.video_type
    )
    
    # JSON output (for programmatic use)
    if args.json_output:
        result = {
            'is_unique': is_unique,
            'max_similarity': round(max_similarity, 3),
            'threshold': args.threshold,
            'similar_count': len(similar_topics),
            'similar_topics': similar_topics[:3]  # Top 3 only
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(0 if is_unique else 1)
    
    # Human-readable output
    print("=" * 70)
    print("TOPIC UNIQUENESS CHECK")
    print("=" * 70)
    print(f"\nNew topic: {args.new_topic}")
    print(f"Threshold: {args.threshold * 100}%")
    print(f"Max similarity found: {max_similarity * 100:.1f}%")
    print()
    
    if is_unique:
        print("✅ RESULT: UNIQUE - Can proceed")
        print()
        print("This topic has not been covered before.")
        sys.exit(0)
    else:
        print("⚠️  RESULT: DUPLICATE - Need different angle")
        print()
        print(f"Found {len(similar_topics)} similar topic(s):")
        print()
        
        # Show top 3 similar topics
        for i, topic in enumerate(similar_topics[:3], 1):
            print(f"{i}. [{topic['similarity'] * 100:.1f}%] {topic['title']}")
            print(f"   Content: {topic['main_video_content']}")
            print(f"   Date: {topic['date']} | Type: {topic['type']} | Lang: {topic['language']}")
            print()
        
        # Show suggestions
        suggestions = suggest_alternative_angle(args.new_topic, similar_topics)
        print(suggestions)
        print()
        
        sys.exit(1)


if __name__ == '__main__':
    main()
