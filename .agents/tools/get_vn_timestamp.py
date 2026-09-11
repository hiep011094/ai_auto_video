#!/usr/bin/env python3
"""
get_vn_timestamp.py — Prints the current time in Vietnam time (UTC+7),
ISO-8601 formatted, for use in `date`, `created_at`, `capcut_created_at`,
and any other timestamp field (see AGENTS.md §2 hard rule: "Every timestamp
written anywhere ... is in Vietnam time (UTC+7)").

No tool previously enforced or generated this automatically — every
timestamp depended on the agent computing UTC+7 correctly by hand.

Usage:
    python3 .agents/tools/get_vn_timestamp.py
    # -> 2026-08-14T21:05:32+07:00
"""

import sys
from datetime import datetime, timezone, timedelta

VN_TZ = timezone(timedelta(hours=7))


def vn_now_iso() -> str:
    return datetime.now(VN_TZ).isoformat(timespec="seconds")


def main():
    print(vn_now_iso())
    return 0


if __name__ == "__main__":
    sys.exit(main())
