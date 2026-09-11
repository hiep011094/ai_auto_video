#!/usr/bin/env python3
"""
Comprehensive Topic Duplicate Checker

Always checks the candidate against the WHOLE channel history first. When
--category is supplied, it additionally performs a stricter same-category
keyword pass; category is never used as a loophole that hides a semantic
repeat from global history.

Usage:
  python3 .agents/tools/check_topic_duplicate.py \
    --new-topic "Topic" --history database/history.json --category buddhist_wisdom --ai-model agy

Exit codes:
  0 = unique / proceed
  1 = duplicate / reject
  2 = warning or AI semantic check unavailable; manual review required
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict, Optional, Tuple

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from category_keywords import ALL_CATEGORIES, auto_classify_category  # noqa: E402


def load_history_array(history_path: str) -> list:
    try:
        with open(history_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return data.get("topics", [])
        return []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def filter_history_by_category(history_path: str, category: str) -> Optional[str]:
    """Create a temporary same-category history file for the DEEP pass only."""
    if category not in ALL_CATEGORIES:
        print(f"ERROR: unknown --category '{category}' (expected one of {sorted(ALL_CATEGORIES)})", file=sys.stderr)
        return None
    entries = load_history_array(history_path)
    filtered = []
    for entry in entries:
        entry_category = entry.get("category") or auto_classify_category(
            entry.get("title", ""), entry.get("main_video_content", "")
        )
        if entry_category == category:
            filtered.append(entry)
    fd, tmp_path = tempfile.mkstemp(suffix=".json", prefix="history_category_")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(filtered, f, ensure_ascii=False)
    return tmp_path


def run_keyword_check(new_topic: str, history_path: str, threshold: float,
                      language: str = None, video_type: str = None) -> Dict:
    try:
        cmd = [
            sys.executable,
            str(SCRIPT_DIR / "topic_uniqueness_checker.py"),
            "--new-topic", new_topic,
            "--history", history_path,
            "--threshold", str(threshold),
            "--json-output",
        ]
        if language:
            cmd.extend(["--language", language])
        if video_type:
            cmd.extend(["--video-type", video_type])
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=30,
        )
        if result.stdout.strip():
            return json.loads(result.stdout)
        return {"is_unique": True, "max_similarity": 0.0, "error": result.stderr.strip() or "No output"}
    except Exception as exc:
        return {"is_unique": True, "max_similarity": 0.0, "error": str(exc)}


def run_ai_semantic_check(new_topic: str, history_path: str, ai_model: str) -> Dict:
    try:
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT_DIR / "ai_semantic_checker.py"),
                "--new-topic", new_topic,
                "--history", history_path,
                "--ai-model", ai_model,
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=120,
        )
        if not result.stdout.strip():
            return {
                "is_duplicate": False,
                "confidence": 0.0,
                "reasoning": result.stderr.strip() or "AI semantic check produced no output",
                "recommendation": "MANUAL_REVIEW",
                "ai_check_failed": True,
            }
        data = json.loads(result.stdout)
        analysis = data.get("ai_analysis", {}) if isinstance(data, dict) else {}
        if not isinstance(analysis, dict):
            analysis = {}
        if result.returncode not in (0, 1) or analysis.get("recommendation") == "MANUAL_REVIEW":
            analysis["ai_check_failed"] = True
        return analysis
    except Exception as exc:
        return {
            "is_duplicate": False,
            "confidence": 0.0,
            "reasoning": f"AI check error: {exc}",
            "recommendation": "MANUAL_REVIEW",
            "ai_check_failed": True,
        }


def combine_global(keyword_result: Dict, ai_result: Dict, tier1_result: Dict = None) -> Tuple[bool, str, Dict]:
    keyword_unique = keyword_result.get("is_unique", True)
    keyword_sim = float(keyword_result.get("max_similarity", 0.0) or 0.0)
    ai_duplicate = bool(ai_result.get("is_duplicate", False))
    ai_confidence = float(ai_result.get("confidence", 0.0) or 0.0)
    ai_recommendation = ai_result.get("recommendation", "MANUAL_REVIEW")
    ai_failed = bool(ai_result.get("ai_check_failed"))

    if ai_failed:
        if keyword_unique:
            return True, "WARNING", {
                "verdict": "AI_CHECK_DID_NOT_RUN",
                "keyword_similarity": keyword_sim,
                "ai_confidence": ai_confidence,
                "reasoning": ai_result.get("reasoning", "AI semantic check unavailable"),
                "action": "Keyword check passed, but semantic uniqueness is unconfirmed. Manual review required.",
            }
        
        # New logic: Even if keyword check failed, if Tier 1 tells us they
        # have DIFFERENT CONTENT (high divergence), we should WARN instead of REJECT.
        has_diff_content = tier1_result and tier1_result.get('has_same_keyword_diff_content', False)
        if has_diff_content:
            return True, "WARNING", {
                "verdict": "SAME_KEYWORD_DIFF_CONTENT_AI_UNAVAILABLE",
                "keyword_similarity": keyword_sim,
                "ai_confidence": ai_confidence,
                "reasoning": "Keyword duplicate detected, BUT content divergence is high (different angle/content). AI check unavailable.",
                "action": "Proceed with caution. Ensure the script truly focuses on the different angle.",
            }

        return False, "REJECT", {
            "verdict": "DUPLICATE_BY_GLOBAL_KEYWORDS_AI_UNAVAILABLE",
            "keyword_similarity": keyword_sim,
            "ai_confidence": ai_confidence,
            "reasoning": "Global keyword duplication detected while semantic AI was unavailable.",
            "action": "Change the topic/angle; do not use category reassignment as a workaround.",
        }

    if not keyword_unique and ai_duplicate:
        return False, "REJECT", {
            "verdict": "GLOBAL_DUPLICATE",
            "keyword_similarity": keyword_sim,
            "ai_confidence": ai_confidence,
            "reasoning": "Both global keyword and AI semantic checks detected duplication.",
            "action": "Must change topic or apply a materially different angle.",
        }
    if ai_duplicate and ai_confidence >= 0.70:
        return False, "REJECT", {
            "verdict": "GLOBAL_SEMANTIC_DUPLICATE",
            "keyword_similarity": keyword_sim,
            "ai_confidence": ai_confidence,
            "reasoning": ai_result.get("reasoning", "AI detected semantic duplication"),
            "action": "Apply a materially different viewer experience/angle.",
        }
    if not keyword_unique and not ai_duplicate:
        return True, "WARNING", {
            "verdict": "GLOBAL_BORDERLINE",
            "keyword_similarity": keyword_sim,
            "ai_confidence": ai_confidence,
            "reasoning": "Global keywords are similar although AI considers the angle distinct.",
            "action": "Review viewer-experience overlap and strengthen differentiation.",
        }
    if ai_confidence < 0.5 or ai_recommendation == "MANUAL_REVIEW":
        return True, "WARNING", {
            "verdict": "GLOBAL_AI_INCONCLUSIVE",
            "keyword_similarity": keyword_sim,
            "ai_confidence": ai_confidence,
            "reasoning": ai_result.get("reasoning", "AI semantic confidence is low"),
            "action": "Manual semantic review required before proceeding.",
        }
    return True, "PROCEED", {
        "verdict": "GLOBAL_UNIQUE",
        "keyword_similarity": keyword_sim,
        "ai_confidence": ai_confidence,
        "reasoning": "Global keyword and AI semantic checks confirm sufficient uniqueness.",
        "action": "Proceed.",
    }


def apply_category_deep_pass(is_unique, recommendation, combined, category_result, category, threshold):
    """Tight same-category pass without weakening global protection."""
    if not category_result:
        return is_unique, recommendation, combined
    sim = float(category_result.get("max_similarity", 0.0) or 0.0)
    category_unique = category_result.get("is_unique", True)
    combined = dict(combined)
    combined["same_category"] = {
        "category": category,
        "threshold": threshold,
        "is_unique": category_unique,
        "max_similarity": sim,
        "similar_topics": category_result.get("similar_topics", [])[:3],
    }
    if not category_unique and is_unique:
        # A same-category keyword hit is a meaningful fatigue signal, but if
        # the global semantic model explicitly accepted the topic we keep it
        # as WARNING rather than blindly overriding with a lexical false hit.
        recommendation = "WARNING"
        combined["verdict"] = "SAME_CATEGORY_OVERLAP_WARNING"
        combined["reasoning"] = (
            f"Global check did not reject the topic, but same-category similarity is {sim:.0%}; "
            "review angle/viewer experience before proceeding."
        )
        combined["action"] = "Strengthen the angle or manually confirm it is materially different."
    return is_unique, recommendation, combined


def print_report(topic, is_unique, recommendation, global_kw, ai_result, combined, category_result=None):
    print("=" * 80)
    print("GLOBAL CROSS-LANGUAGE + CATEGORY-AWARE TOPIC DUPLICATE CHECK")
    print("=" * 80)
    print(f"New Topic: {topic}\n")
    print("1) GLOBAL HISTORY — KEYWORD")
    print(f"   unique={global_kw.get('is_unique', True)} max_similarity={float(global_kw.get('max_similarity',0))*100:.1f}%")
    print("2) GLOBAL HISTORY — AI SEMANTIC")
    print(f"   duplicate={ai_result.get('is_duplicate', False)} confidence={float(ai_result.get('confidence',0))*100:.1f}%")
    if ai_result.get("reasoning"):
        print(f"   {ai_result['reasoning']}")
    if category_result is not None:
        sc = combined.get("same_category", {})
        print("3) SAME CATEGORY — DEEP KEYWORD PASS")
        print(f"   category={sc.get('category')} unique={sc.get('is_unique')} max_similarity={float(sc.get('max_similarity',0))*100:.1f}%")
    print("-" * 80)
    print(f"FINAL: {'✅' if is_unique and recommendation == 'PROCEED' else '⚠️' if is_unique else '❌'} {combined.get('verdict')}")
    print(f"Reason: {combined.get('reasoning')}")
    print(f"Action: {combined.get('action')}")
    print("=" * 80)


def main():
    parser = argparse.ArgumentParser(description="Global cross-language + lane/category-aware topic duplicate checker")
    parser.add_argument("--new-topic", required=True)
    parser.add_argument("--history", default="database/history.json")
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--ai-model", default="agy", choices=["agy", "codex", "manual"])
    parser.add_argument("--json-output", action="store_true")
    parser.add_argument("--skip-ai", action="store_true")
    parser.add_argument(
        "--language", required=True, choices=["vi"],
        help="Video language (vi only); used for same-lane fatigue analysis while the primary duplicate pass scans global history.",
    )
    parser.add_argument(
        "--video-type", required=True, choices=["short", "long"],
        help="Video type; used for same-lane fatigue analysis while the primary duplicate pass scans global history.",
    )
    parser.add_argument(
        "--category", choices=sorted(ALL_CATEGORIES),
        help="Optional selected category. Adds a stricter same-category pass across history.",
    )
    args = parser.parse_args()

    # ── Tier 1: GLOBAL fast scan (all history, all languages/types) ───
    # V8 closes the old lane loophole: translating a topic or switching
    # short↔long must not make the same core subject appear "new".
    from similarity_engine import SimilarityEngine
    engine = SimilarityEngine.from_history_file(
        args.history, language=args.language, video_type=args.video_type, scope="global"
    )
    tier1_candidates = engine.scan_all(args.new_topic, top_k=30)
    tier1_result = engine.summarize_results(tier1_candidates, threshold=0.45)

    # Primary lexical pass is global too. A same-lane pass is retained as a
    # secondary fatigue signal, not as the boundary of duplicate protection.
    global_kw = run_keyword_check(args.new_topic, args.history, args.threshold)
    lane_kw = run_keyword_check(
        args.new_topic, args.history, max(0.40, args.threshold - 0.05),
        language=args.language, video_type=args.video_type
    )

    # Merge Tier 1 signal into keyword result: if Tier 1 found high-similarity
    # candidates that keyword checker missed, override the keyword result.
    if (tier1_result['max_similarity'] > float(global_kw.get('max_similarity', 0))
            and not tier1_result['is_unique']):
        global_kw['is_unique'] = False
        global_kw['max_similarity'] = tier1_result['max_similarity']
        global_kw['similar_topics'] = tier1_result.get('similar_topics', [])
        global_kw['similarity_engine_override'] = True

    # ── Tier 2: AI semantic check ────────────────────────────────────
    if args.skip_ai:
        ai_result = {
            "is_duplicate": False,
            "confidence": 0.0,
            "reasoning": "AI check explicitly skipped",
            "recommendation": "MANUAL_REVIEW",
            "ai_check_failed": True,
        }
    else:
        # Write pre-filtered candidates to a temp file for AI checker.
        # This ensures AI sees the MOST RELEVANT entries from the lane,
        # not just the most recent — solving the limit=50 problem.
        import tempfile
        candidate_entries = [entry for _, entry in tier1_candidates[:20]]
        fd, tmp_candidates = tempfile.mkstemp(suffix=".json", prefix="ai_candidates_")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(candidate_entries, f, ensure_ascii=False)
        try:
            ai_result = run_ai_semantic_check(args.new_topic, tmp_candidates, args.ai_model)
        finally:
            try:
                os.unlink(tmp_candidates)
            except OSError:
                pass

    is_unique, recommendation, combined = combine_global(global_kw, ai_result, tier1_result)

    # Add lane + tier1 info to combined analysis
    combined['lane'] = f"{args.language}_{args.video_type}"
    combined['global_history_size'] = tier1_result.get('lane_size', 0)
    combined['tier1_max_similarity'] = tier1_result['max_similarity']
    combined['same_lane_keyword'] = lane_kw

    # Additional category-deep keyword pass across history.
    category_result = None
    category_tmp = None
    category_threshold = max(0.35, args.threshold - 0.10)
    if args.category:
        category_tmp = filter_history_by_category(args.history, args.category)
        if category_tmp is None:
            sys.exit(2)
        try:
            category_result = run_keyword_check(
                args.new_topic, category_tmp, category_threshold
            )
        finally:
            try:
                os.unlink(category_tmp)
            except OSError:
                pass
        is_unique, recommendation, combined = apply_category_deep_pass(
            is_unique, recommendation, combined, category_result, args.category, category_threshold
        )

    output = {
        "is_unique": is_unique,
        "recommendation": recommendation,
        "lane": f"{args.language}_{args.video_type}",
        "tier1_scan": tier1_result,
        "global_keyword_check": global_kw,
        "same_lane_keyword_check": lane_kw,
        "global_ai_check": ai_result,
        "same_category_check": category_result,
        "combined_analysis": combined,
    }
    if args.json_output:
        print(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        print_report(args.new_topic, is_unique, recommendation, global_kw, ai_result, combined, category_result)

    if not is_unique:
        sys.exit(1)
    if recommendation != "PROCEED":
        sys.exit(2)
    sys.exit(0)


if __name__ == "__main__":
    main()
