#!/usr/bin/env python3
"""
Category Balance Checker - kiểm tra cân bằng + strict 2-category alternation.
"""

import json
import sys
import argparse
from collections import Counter
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from category_keywords import ALL_CATEGORIES, CATEGORY_ORDER, CATEGORY_NAMES_VI, auto_classify_category  # noqa: E402
from category_selector import ROTATION_LOCK_WINDOW, select_next_category  # noqa: E402


def load_history(history_path):
    """Load history.json."""
    try:
        with open(history_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and isinstance(data.get('topics'), list):
                return data['topics']
            raise ValueError(
                f"Unexpected history root in {history_path}: expected a JSON array or legacy topics wrapper"
            )
    except FileNotFoundError:
        print(f"❌ Error: File not found: {history_path}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Error parsing JSON: {e}", file=sys.stderr)
        sys.exit(1)


def get_categories_with_metadata(topics):
    """Extract categories with full metadata, newest first."""
    results = []
    for topic in topics:
        category = topic.get('category')
        if not category:
            category = auto_classify_category(
                topic.get('title', ''),
                topic.get('main_video_content', '')
            )
        elif category not in ALL_CATEGORIES:
            # Keep retired/invalid history entries untouched but exclude them
            # from ACTIVE rotation/balance calculations.
            continue

        results.append({
            'category': category,
            'title': topic.get('title', ''),
            'date': topic.get('date', ''),
            'created_at': topic.get('created_at', ''),
            'type': topic.get('type', ''),
            'language': topic.get('language', '')
        })

    results.sort(key=lambda x: x.get('created_at') or x.get('date', ''), reverse=True)
    return results


def find_rotation_violations(categorized):
    """
    Find repeats inside the strict lock window.

    A category is invalid if it appears again within the previous N-1 videos.
    With 2 ACTIVE categories, every compliant 2-video window contains both
    exactly once. `categorized` is newest-first.
    """
    violations = []
    for i, current in enumerate(categorized):
        max_j = min(len(categorized), i + ROTATION_LOCK_WINDOW + 1)
        for j in range(i + 1, max_j):
            older = categorized[j]
            if current['category'] == older['category']:
                violations.append({
                    'position': i + 1,
                    'other_position': j + 1,
                    'distance': j - i,
                    'category': current['category'],
                    'video1': current['title'],
                    'video2': older['title']
                })
                # One violation per current item is enough for actionable output.
                break
    return violations


def check_balance(topics, window=20):
    """Check category balance and strict-cycle compliance in last N videos."""
    categorized = get_categories_with_metadata(topics)

    if not categorized:
        return {
            'total_videos': 0,
            'window_size': window,
            'distribution': {},
            'recent_videos': [],
            'violations': [],
            'recommendation': None,
            'rotation_mode': 'strict_full_cycle',
            'rotation_lock_window': ROTATION_LOCK_WINDOW
        }

    recent = categorized[:window]
    category_counts = Counter(item['category'] for item in recent)
    total = len(recent)

    distribution = {}
    target_pct = 100.0 / len(CATEGORY_ORDER)
    tolerance = 5.0
    for cat in CATEGORY_ORDER:
        count = category_counts.get(cat, 0)
        pct = (count / total * 100) if total > 0 else 0
        distribution[cat] = {
            'count': count,
            'percentage': pct,
            'target': target_pct,
            'deviation': pct - target_pct,
            'status': 'balanced' if (target_pct - tolerance) <= pct <= (target_pct + tolerance) else 'unbalanced'
        }

    violations = find_rotation_violations(categorized)
    next_pick = select_next_category(topics)
    last_category = categorized[0]['category'] if categorized else None

    return {
        'total_videos': len(categorized),
        'window_size': min(window, len(recent)),
        'distribution': distribution,
        'recent_videos': recent[:5],
        'violations': violations[:20],
        'last_category': last_category,
        'recommendation': next_pick['selected_category'],
        'rotation_mode': 'strict_full_cycle',
        'rotation_lock_window': ROTATION_LOCK_WINDOW,
        'locked_categories': next_pick.get('locked_categories', []),
        'available_categories': next_pick.get('available_categories', [])
    }


def print_report(result, verbose=False):
    """Print human-readable report."""
    print()
    print("=" * 70)
    print("CATEGORY BALANCE CHECKER — STRICT 2-CATEGORY ALTERNATION")
    print("=" * 70)
    print()

    print(f"Total Videos: {result['total_videos']}")
    print(f"Analysis Window: Last {result['window_size']} videos")
    print(f"Rotation Lock: previous {result.get('rotation_lock_window', ROTATION_LOCK_WINDOW)} videos")
    print()

    if result['recent_videos']:
        print("Last 5 Videos:")
        for i, video in enumerate(result['recent_videos'], 1):
            print(f"  #{i}: {video['category']:18s} - {video['title']}")
        print()

    if result['distribution']:
        print(f"Balance (Last {result['window_size']} videos):")
        print()

        for cat in CATEGORY_ORDER:
            dist = result['distribution'][cat]
            cat_name = CATEGORY_NAMES_VI.get(cat, cat)
            count = dist['count']
            pct = dist['percentage']
            dev = dist['deviation']
            status_icon = '✅' if dist['status'] == 'balanced' else '⚠️'
            bar = '█' * int(pct / 2.5)

            if dist['status'] == 'balanced':
                status_text = 'Balanced'
            elif pct < dist['target']:
                status_text = 'Under-represented'
            else:
                status_text = 'Over-represented'

            print(f"  {status_icon} {cat_name:20s} ({cat:18s})")
            print(f"     {count:2d} videos ({pct:5.1f}%) {bar}")
            print(f"     Target: {dist['target']:.1f}% ± 5%  |  Deviation: {dev:+.1f}%  |  {status_text}")
            print()

    if result['violations']:
        print(f"⚠️  ROTATION VIOLATIONS (category repeated within previous {ROTATION_LOCK_WINDOW} videos):")
        print()
        for violation in result['violations']:
            print(f"  Positions #{violation['position']} and #{violation['other_position']}:")
            print(f"    Category: {violation['category']}  |  Distance: {violation['distance']} video(s)")
            print(f"    Video 1: {violation['video1']}")
            print(f"    Video 2: {violation['video2']}")
            print()
    else:
        print("✅ ROTATION COMPLIANCE: the previous ACTIVE category is locked, so the next session must use the other ACTIVE category")
        print()

    if result['recommendation']:
        rec_cat = result['recommendation']
        rec_name = CATEGORY_NAMES_VI.get(rec_cat, rec_cat)
        print("🎯 RECOMMENDATION:")
        print(f"   Next video should be: {rec_name} ({rec_cat})")
        if result.get('locked_categories'):
            print(f"   Locked now: {', '.join(result['locked_categories'])}")
        print()

    print("=" * 70)
    print()


def main():
    parser = argparse.ArgumentParser(
        description='Check category balance and strict 2-category alternation in history'
    )
    parser.add_argument('--history', required=True, help='Path to history.json')
    parser.add_argument('--window', type=int, default=20, help='Number of recent videos to analyze (default: 20)')
    parser.add_argument('--output-json', action='store_true', help='Output JSON instead of human-readable')
    parser.add_argument('--verbose', action='store_true', help='Verbose output')
    args = parser.parse_args()

    try:
        topics = load_history(args.history)
    except ValueError as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 3

    result = check_balance(topics, window=args.window)

    if args.output_json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print_report(result, verbose=args.verbose)

    # 0 = balanced + compliant, 1 = distribution warning, 2 = rotation violation
    if result['violations']:
        return 2

    if result['distribution']:
        unbalanced = any(dist['status'] == 'unbalanced' for dist in result['distribution'].values())
        if unbalanced:
            return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
