#!/usr/bin/env python3
"""
migrate_add_category.py — One-time migration: add the `category` field to
history entries written before `category` existed (see
.agents/10_category_rotation.md and .agents/schemas/history.schema.json).

This is a maintenance tool, not part of the per-task pipeline in
01_workflow.md. Run it once against an existing database/history.json that
has entries missing `category`; new entries written by the current pipeline
already include `category` (Step 2.1 / Step 11) and do not need this.

USAGE:
  python3 migrate_add_category.py --history database/history.json \
      --backup database/history.backup.json

  --backup is optional but strongly recommended — the tool overwrites
  --history in place after migrating.

WHAT IT DOES:
  For every entry in the history array missing `category` (or with an
  empty/falsy value), classify it via category_keywords.auto_classify_category()
  using its `title` + `main_video_content`, and write the result back.
  Entries that already have a non-empty `category` are left untouched.

EXIT CODES:
  0 = success (including "nothing to migrate")
  1 = history file invalid / not a JSON array
  2 = system error (file not found, malformed JSON)
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from category_keywords import auto_classify_category  # noqa: E402


def load_history(history_path):
    """Load database/history.json. Must be a top-level JSON array (see
    03_data_schemas.md §1) — returns None (not []) on a wrong root type so
    the caller can tell "empty file" apart from "wrong shape"."""
    try:
        with open(history_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"ERROR: history file not found: {history_path}", file=sys.stderr)
        sys.exit(2)
    except json.JSONDecodeError as e:
        print(f"ERROR: could not parse {history_path}: {e}", file=sys.stderr)
        sys.exit(2)

    if isinstance(data, list):
        return data
    print(
        f"ERROR: {history_path} root must be a JSON array of entries "
        f"(got {type(data).__name__}) — refusing to migrate a file with an "
        "unexpected shape.",
        file=sys.stderr,
    )
    return None


def migrate_entries(entries):
    """Returns (modified_count, log_lines). Mutates `entries` in place."""
    modified = 0
    log_lines = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        existing = entry.get("category")
        if existing:
            continue
        category = auto_classify_category(
            entry.get("title", ""), entry.get("main_video_content", "")
        )
        entry["category"] = category
        modified += 1
        log_lines.append(f"  [{category}] {entry.get('title', 'Untitled')}")
    return modified, log_lines


def main():
    parser = argparse.ArgumentParser(
        description="Add the `category` field to history entries that predate it."
    )
    parser.add_argument("--history", required=True, help="Path to database/history.json")
    parser.add_argument(
        "--backup",
        default=None,
        help="Optional path to write an unmodified backup copy before migrating.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would change without writing any file.",
    )
    args = parser.parse_args()

    entries = load_history(args.history)
    if entries is None:
        sys.exit(1)

    if not entries:
        print("OK: history is empty — nothing to migrate.")
        sys.exit(0)

    if args.backup and not args.dry_run:
        with open(args.backup, "w", encoding="utf-8") as f:
            json.dump(entries, f, indent=2, ensure_ascii=False)
        print(f"Backup written: {args.backup}")

    modified, log_lines = migrate_entries(entries)

    if modified == 0:
        print("OK: every entry already has a `category` — nothing to migrate.")
        sys.exit(0)

    for line in log_lines:
        print(line)

    if args.dry_run:
        print(f"\nDRY RUN: {modified} entr{'y' if modified == 1 else 'ies'} would be updated. No file written.")
        sys.exit(0)

    with open(args.history, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2, ensure_ascii=False)

    print(f"\nOK: migration complete — {modified} entr{'y' if modified == 1 else 'ies'} updated in {args.history}")
    sys.exit(0)


if __name__ == "__main__":
    main()
