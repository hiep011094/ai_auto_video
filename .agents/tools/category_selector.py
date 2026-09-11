#!/usr/bin/env python3
"""
Category Selector - chọn thể loại tiếp theo dựa trên lịch sử.

Production rule (strict 2-category alternation):
- Có 2 category ACTIVE trong category_keywords.CATEGORY_ORDER.
- Category đã xuất hiện trong video ACTIVE gần nhất sẽ bị khóa.
- Vì có đúng 2 category ACTIVE, mọi cửa sổ 2 video hợp lệ đều chứa đủ 2
  category; hai phiên ACTIVE liên tiếp bắt buộc khác thể loại.
- Entry lịch sử mang category đã nghỉ/không hợp lệ được giữ nguyên trong file
  nhưng bị bỏ qua khi tính rotation ACTIVE.

Không thêm state/schema mới: trạng thái rotation được suy ra hoàn toàn từ
`database/history.json`, nên hoạt động ổn định qua từng phiên làm việc.
"""

import json
import sys
import argparse
from pathlib import Path
from collections import Counter

# Single source of truth for categories/keywords — see category_keywords.py.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from category_keywords import ALL_CATEGORIES, CATEGORY_ORDER, auto_classify_category  # noqa: E402

# With N active categories, locking the previous N-1 guarantees a strict full cycle; with N=2 this is strict alternation.
ROTATION_LOCK_WINDOW = max(0, len(CATEGORY_ORDER) - 1)


def load_history(history_path):
    """Load history.json."""
    try:
        with open(history_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # database/history.json is a top-level ARRAY of entries (see
            # .agents/03_data_schemas.md §1). Keep defensive support for the
            # historical {"topics": [...]} wrapper.
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and isinstance(data.get('topics'), list):
                return data['topics']
            raise ValueError(
                f"Unexpected history root in {history_path}: expected a JSON array or legacy topics wrapper"
            )
    except FileNotFoundError:
        return []
    except json.JSONDecodeError as e:
        raise ValueError(f"Error parsing history.json: {e}") from e


def get_categories_with_dates(topics):
    """
    Extract categories từ history, tự động classify nếu thiếu.
    Returns newest-first metadata records.
    """
    results = []
    for topic in topics:
        category = topic.get('category')
        if not category:
            # Legacy entry created before `category` existed: classify only
            # into ACTIVE categories.
            category = auto_classify_category(
                topic.get('title', ''),
                topic.get('main_video_content', '')
            )
        elif category not in ALL_CATEGORIES:
            # Explicit retired/invalid categories do not participate in the
            # current ACTIVE rotation. Keep the history entry untouched.
            continue

        results.append({
            'category': category,
            'date': topic.get('date', ''),
            'title': topic.get('title', ''),
            'created_at': topic.get('created_at', '')
        })

    # Newest first. Sorting is deterministic for identical timestamps because
    # Python's sort is stable and history order is preserved for ties.
    results.sort(key=lambda x: x.get('created_at') or x.get('date', ''), reverse=True)
    return results


def get_last_n_categories(topics, n=None):
    """Lấy n ACTIVE category gần nhất (newest first)."""
    if n is None:
        n = ROTATION_LOCK_WINDOW
    categorized = get_categories_with_dates(topics)
    return [item['category'] for item in categorized[:n]]


def count_categories_in_window(topics, window=10):
    """Đếm số lần xuất hiện của mỗi category trong N video gần nhất."""
    categorized = get_categories_with_dates(topics)
    recent = [item['category'] for item in categorized[:window]]
    return Counter(recent)


def calculate_balance_stats(topics, window=20):
    """Tính % phân bố của mỗi category trong window."""
    counts = count_categories_in_window(topics, window)
    total = sum(counts.values())

    if total == 0:
        return {}

    return {cat: counts.get(cat, 0) / total for cat in CATEGORY_ORDER}


def get_rotation_state(topics):
    """
    Derive strict-cycle state from history only; no persistent state is added.

    Categories present in the most recent N-1 videos are locked. Categories not
    in that window are eligible. With two ACTIVE categories this means the next session must select the other
    category, giving strict alternation across ACTIVE sessions.
    """
    recent = get_last_n_categories(topics, n=ROTATION_LOCK_WINDOW)
    locked_set = set(recent)
    available = [cat for cat in CATEGORY_ORDER if cat not in locked_set]

    # Legacy history may already contain repeats inside the lock window. In that
    # case multiple categories can remain available. The selector below uses
    # balance + canonical order to heal deterministically without breaking the
    # schema or refusing a valid run.
    return {
        'rotation_lock_window': ROTATION_LOCK_WINDOW,
        'locked_categories': [cat for cat in CATEGORY_ORDER if cat in locked_set],
        'recent_categories': recent,
        'available_categories': available,
    }


def select_next_category(topics, verbose=False):
    """
    Chọn category tiếp theo theo STRICT 2-CATEGORY ALTERNATION:

    1. HARD RULE: khóa ACTIVE category của video ACTIVE gần nhất.
       => Hai phiên ACTIVE liên tiếp không bao giờ cùng category.
    2. Nếu legacy history tạo ra >1 lựa chọn, ưu tiên category ít dùng nhất
       trong 10 video gần đây để tự cân bằng và tự phục hồi.
    3. Tie-break luôn theo CATEGORY_ORDER để kết quả deterministic.

    Không thêm field/state mới vào history/queue và không cần file state phụ.
    """
    if not topics:
        return {
            'selected_category': 'buddhist_life',
            'reason': 'First active-category video - starting strict 2-category alternation with buddhist_life',
            'last_3_categories': [],
            'balance_stats': {},
            'available_categories': list(CATEGORY_ORDER),
            'counts_last_10': {},
            'rotation_lock_window': ROTATION_LOCK_WINDOW,
            'locked_categories': [],
            'rotation_mode': 'strict_full_cycle'
        }

    state = get_rotation_state(topics)
    last_3 = state['recent_categories']
    available = state['available_categories']

    if not available:
        # This should be impossible with N categories and an N-1 lock window,
        # but keep a deterministic fail-safe rather than weakening silently.
        available = list(CATEGORY_ORDER)

    counts_10 = count_categories_in_window(topics, window=10)
    selected = min(
        available,
        key=lambda c: (counts_10.get(c, 0), CATEGORY_ORDER.index(c))
    )

    balance = calculate_balance_stats(topics, window=20)
    locked = state['locked_categories']

    if len(last_3) < ROTATION_LOCK_WINDOW:
        reason = (
            f"Strict cycle bootstrap - {selected} has not been used in the "
            f"last {len(last_3)} active video(s); the previous ACTIVE category remains locked so the 2-category alternation can start"
        )
    elif len(available) == 1:
        reason = (
            f"Strict 2-category alternation - {', '.join(last_3)} occupy the last "
            f"{ROTATION_LOCK_WINDOW} slots, so {selected} is the only eligible category"
        )
    else:
        # Healing path for legacy/non-compliant history.
        reason = (
            f"Strict cycle recovery - categories used in the last {ROTATION_LOCK_WINDOW} videos are locked; "
            f"selected least-used eligible category {selected}"
        )

    return {
        'selected_category': selected,
        'reason': reason,
        'last_3_categories': last_3,
        'balance_stats': balance,
        'available_categories': list(available),
        'counts_last_10': dict(counts_10),
        'rotation_lock_window': ROTATION_LOCK_WINDOW,
        'locked_categories': locked,
        'rotation_mode': 'strict_full_cycle'
    }


def print_human_readable(result):
    """In kết quả dạng human-readable."""
    print("=" * 70)
    print("CATEGORY SELECTOR — STRICT 2-CATEGORY ALTERNATION")
    print("=" * 70)
    print()
    print(f"✅ SELECTED: {result['selected_category']}")
    print(f"📝 Reason: {result['reason']}")
    print()

    if result['last_3_categories']:
        print(f"Rotation lock window (last {result.get('rotation_lock_window', ROTATION_LOCK_WINDOW)} videos):")
        for i, cat in enumerate(result['last_3_categories'], 1):
            print(f"  #{i}: {cat} — LOCKED")
        print()

    if result['balance_stats']:
        print("Balance (Last 20 videos):")
        for cat in CATEGORY_ORDER:
            pct = result['balance_stats'].get(cat, 0) * 100
            bar = '█' * int(pct / 5)
            target = 100.0 / len(CATEGORY_ORDER)
            status = '✅' if (target - 5.0) <= pct <= (target + 5.0) else '⚠️'
            print(f"  {status} {cat:18s}: {pct:5.1f}% {bar}")
        print()

    print(f"Locked categories: {', '.join(result.get('locked_categories', [])) or '(none)'}")
    print(f"Available categories: {', '.join(result['available_categories'])}")
    print("=" * 70)


def main():
    parser = argparse.ArgumentParser(
        description='Select next category using strict 2-category alternation'
    )
    parser.add_argument(
        '--history',
        required=True,
        help='Path to history.json'
    )
    parser.add_argument(
        '--output-json',
        action='store_true',
        help='Output JSON instead of human-readable'
    )
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Verbose output'
    )

    args = parser.parse_args()

    try:
        topics = load_history(args.history)
    except ValueError as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 2

    result = select_next_category(topics, verbose=args.verbose)

    if args.output_json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print_human_readable(result)

    return 0


if __name__ == '__main__':
    sys.exit(main())
