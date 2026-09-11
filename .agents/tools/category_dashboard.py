#!/usr/bin/env python3
"""
category_dashboard.py — Human-readable one-screen summary of the category
rotation system's current state: total videos, the last 5 videos with their
category, the 20-video balance distribution, strict ACTIVE-category alternation compliance,
and the recommended next category.

This is a read-only reporting tool for a human operator (or an agent
checking in on channel health) — it does not select or write anything.
It re-uses the exact same logic as `category_selector.py` (next-category
pick) and `category_balance_checker.py` (distribution/violations) rather
than re-implementing it, so the dashboard can never disagree with what
those two tools would actually do.

USAGE:
  python3 category_dashboard.py --history database/history.json [--window 20]

EXIT CODES:
  0 = report printed successfully (regardless of whether rotation issues
      were found — those are reported, not treated as a tool failure)
  1 = history file invalid / not a JSON array
  2 = system error (file not found, malformed JSON)
"""

import argparse
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from category_keywords import CATEGORY_ORDER  # noqa: E402
from category_selector import load_history, select_next_category  # noqa: E402
from category_balance_checker import get_categories_with_metadata, check_balance  # noqa: E402


def print_dashboard(topics, window):
    categorized = get_categories_with_metadata(topics)
    total = len(categorized)

    print("=" * 63)
    print("CATEGORY ROTATION DASHBOARD")
    print("=" * 63)
    print()
    print(f"Total videos: {total}")
    print()

    if total == 0:
        print("No history yet — nothing to report.")
        print("=" * 63)
        return

    print(f"Last {min(5, total)} videos:")
    for i, item in enumerate(categorized[:5], 1):
        title = item["title"] or "(untitled)"
        print(f"  #{i}: {item['category']:16s} - {title}")
    print()

    balance = check_balance(topics, window=window)
    print(f"Balance (last {window} videos):")
    for cat in CATEGORY_ORDER:
        dist = balance["distribution"].get(cat, {"count": 0, "percentage": 0.0, "status": "unbalanced"})
        pct = dist["percentage"]
        bar = "█" * int(pct / 5)
        mark = "OK" if dist["status"] == "balanced" else "!!"
        print(f"  [{mark}] {cat:16s}: {dist['count']:3d} videos ({pct:5.1f}%) {bar}")
    print()

    violations = balance.get("violations", [])
    print("Rotation compliance:")
    if not violations:
        print(f"  OK — strict 2-category alternation is compliant (no active category repeats within the previous {balance.get('rotation_lock_window', 2)} active videos).")
    else:
        print(f"  WARNING — {len(violations)} strict-cycle violation(s) found:")
        for v in violations[:10]:
            print(f"    positions {v['position']} and {v.get('other_position', v['position'] + 1)}: \"{v['video1']}\" / \"{v['video2']}\" (both {v['category']})")
        if len(violations) > 10:
            print(f"    ... and {len(violations) - 10} more")
    print()

    next_pick = select_next_category(topics)
    print(f"Recommendation: next video should be \"{next_pick['selected_category']}\"")
    print(f"  Reason: {next_pick['reason']}")
    print("=" * 63)


def main():
    parser = argparse.ArgumentParser(
        description="Print a one-screen summary of category rotation health."
    )
    parser.add_argument("--history", required=True, help="Path to database/history.json")
    parser.add_argument(
        "--window", type=int, default=20, help="Window size (videos) for the balance report (default 20)"
    )
    args = parser.parse_args()

    topics = load_history(args.history)
    if not isinstance(topics, list):
        print(f"ERROR: could not load a valid history array from {args.history}", file=sys.stderr)
        sys.exit(1)

    print_dashboard(topics, args.window)
    sys.exit(0)


if __name__ == "__main__":
    main()
