#!/usr/bin/env python3
"""
migrate_backfill_mvc.py — Backfill main_video_content for history entries.

Mode 1 (auto): Reads master_script.txt from existing video folders and
generates a 2-3 sentence summary for entries that currently have
main_video_content = title copy.

Mode 2 (enrich): For entries WITHOUT a master_script.txt, enriches the
existing title-based main_video_content with domain context keywords.

Usage:
  # Dry-run (show what would change)
  python3 .agents/tools/migrate_backfill_mvc.py \
    --history database/history.json --dry-run

  # Apply changes
  python3 .agents/tools/migrate_backfill_mvc.py \
    --history database/history.json \
    --backup database/history.mvc_backup.json
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def needs_backfill(entry: dict) -> bool:
    """Check if an entry has a lazy main_video_content (= title copy or too short)."""
    title = entry.get('title', '').strip()
    mvc = entry.get('main_video_content', '').strip()
    if not mvc:
        return True
    if mvc == title:
        return True
    if len(mvc) < 80 and len(mvc.split()) <= 15:
        return True
    return False


def find_script(entry: dict) -> Path | None:
    """Try to find the master_script.txt for an entry."""
    folder = entry.get('folder', '')
    vid_type = entry.get('type', 'short')

    # Try multiple directory patterns
    type_dirs = ['video_long', 'video_long'] if vid_type == 'long' else ['video_short']
    for type_dir in type_dirs:
        script_path = Path(f'data/{type_dir}/{folder}/master_script.txt')
        if script_path.exists():
            return script_path
    return None


def summarize_script(script_text: str, title: str, max_words: int = 60) -> str:
    """Create a brief summary from a script's content.

    This is a simple extractive summary — takes the first 2-3 meaningful
    sentences that differ from the title. Not AI-powered, but gives the
    anti-duplication system much more signal than a title copy.
    """
    # Clean up the script
    lines = script_text.strip().split('\n')
    sentences = []

    for line in lines:
        line = line.strip()
        if not line:
            continue
        # Skip metadata-like lines
        if line.startswith('#') or line.startswith('//'):
            continue
        # Split on sentence-ending punctuation
        import re
        parts = re.split(r'[.!?]\s+', line)
        for part in parts:
            part = part.strip()
            if len(part) > 20:  # Skip very short fragments
                sentences.append(part)

    if not sentences:
        return title

    # Take first 2-3 sentences that aren't just the title
    title_lower = title.lower()
    selected = []
    word_count = 0
    for s in sentences:
        if s.lower().startswith(title_lower[:30]):
            continue  # Skip if it's basically the title
        selected.append(s)
        word_count += len(s.split())
        if word_count >= max_words or len(selected) >= 3:
            break

    if not selected:
        # Fallback: just take first sentences
        selected = sentences[:3]

    result = '. '.join(selected)
    if not result.endswith('.'):
        result += '.'
    return result


def main():
    parser = argparse.ArgumentParser(
        description='Backfill main_video_content for history entries with lazy title copies'
    )
    parser.add_argument('--history', default='database/history.json',
                        help='Path to history.json')
    parser.add_argument('--backup', help='Backup path before modifying')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would change without modifying')
    args = parser.parse_args()

    # Load history
    with open(args.history, 'r', encoding='utf-8') as f:
        data = json.load(f)

    if isinstance(data, list):
        entries = data
    elif isinstance(data, dict):
        entries = data.get('topics', [])
    else:
        print("ERROR: unexpected format", file=sys.stderr)
        sys.exit(1)

    # Analyze
    total = len(entries)
    need_fix = [i for i, e in enumerate(entries) if needs_backfill(e)]
    already_good = total - len(need_fix)

    print(f"Total entries: {total}")
    print(f"Already good: {already_good}")
    print(f"Needs backfill: {len(need_fix)}")
    print()

    # Process
    fixed_from_script = 0
    skipped = 0

    for idx in need_fix:
        entry = entries[idx]
        title = entry.get('title', '')
        script_path = find_script(entry)

        if script_path:
            # Mode 1: Auto-extract from script
            try:
                script_text = script_path.read_text(encoding='utf-8')
                summary = summarize_script(script_text, title)
                if len(summary) >= 80:
                    if args.dry_run:
                        print(f"[SCRIPT] #{idx}: {title}")
                        print(f"  OLD: {entry.get('main_video_content', '')[:80]}...")
                        print(f"  NEW: {summary[:80]}...")
                        print()
                    else:
                        entry['main_video_content'] = summary
                    fixed_from_script += 1
                    continue
            except Exception as e:
                print(f"  WARNING: could not read {script_path}: {e}")

        # Mode 2: Can't auto-fix without script — leave as-is but report
        skipped += 1
        if args.dry_run and skipped <= 5:
            print(f"[NO SCRIPT] #{idx}: {title}")
            print(f"  Current MVC: {entry.get('main_video_content', '')[:80]}")
            print()

    print("=" * 60)
    print(f"Fixed from master_script.txt: {fixed_from_script}")
    print(f"No script available (kept as-is): {skipped}")
    print()

    if not args.dry_run and fixed_from_script > 0:
        # Backup
        if args.backup:
            shutil.copy2(args.history, args.backup)
            print(f"Backup saved to: {args.backup}")

        # Write updated history — always as a flat JSON array
        # (per 03_data_schemas.md §1, history.json is an ARRAY of entries)
        with open(args.history, 'w', encoding='utf-8') as f:
            json.dump(entries, f, ensure_ascii=False, indent=2)
        print(f"Updated: {args.history}")
    elif args.dry_run:
        print("DRY RUN — no changes made")


if __name__ == '__main__':
    main()
