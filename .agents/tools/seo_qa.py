#!/usr/bin/env python3
"""Deterministic QA for seo_optimized.json.

This gate validates project-owned structural/platform constraints only. It does
not claim to score ranking potential or re-verify factual claims on the web.
Those remain editorial/semantic responsibilities of OptimizeSEO.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

AGENTS = Path(__file__).resolve().parents[1]
CONFIG_PATH = AGENTS / "seo_agent" / "channels_config.json"
VI_DIACRITICS = re.compile(r"[ăâđêôơưĂÂĐÊÔƠƯàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]", re.I)
ASCII_VI = re.compile(r"\b(?:mot|nhung|khong|nguoi|chung|duoc|trong|voi|cua|nay|do|tai|sao|khi|va|la)\b", re.I)
URL_RE = re.compile(r"https?://[^\s<>()]+", re.I)
HASHTAG_RE = re.compile(r"(?<!\w)#([\w]+)", re.UNICODE)
STAMP_LINE_RE = re.compile(r"(?m)^\s*(\d{1,3}:\d{2}(?::\d{2})?)\s+(.+?)\s*$")


def fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)


def warn(msg: str) -> None:
    print(f"WARN: {msg}", file=sys.stderr)


def infer_video_type(folder: Path) -> str | None:
    parts = {p.casefold() for p in folder.parts}
    if "video_short" in parts:
        return "short"
    if "video_long" in parts:
        return "long"
    return None


def youtube_tag_budget(tags: list[str]) -> int:
    # YouTube API documentation notes that commas count and tags containing
    # spaces count as if surrounded by quotation marks.
    if not tags:
        return 0
    return sum(len(t) + (2 if " " in t else 0) for t in tags) + (len(tags) - 1)


def stamp_to_seconds(stamp: str) -> int:
    parts = [int(x) for x in stamp.split(":")]
    if len(parts) == 2:
        mm, ss = parts
        if ss >= 60:
            raise ValueError(stamp)
        return mm * 60 + ss
    if len(parts) == 3:
        hh, mm, ss = parts
        if mm >= 60 or ss >= 60:
            raise ValueError(stamp)
        return hh * 3600 + mm * 60 + ss
    raise ValueError(stamp)


def expected_chapter_starts(folder: Path) -> list[set[int]] | None:
    chapters = sorted(folder.glob("chapter_*.json"))
    if not chapters:
        return None
    out: list[set[int]] = []
    for cp in chapters:
        try:
            scenes = json.loads(cp.read_text(encoding="utf-8"))
            if not scenes:
                return None
            start = scenes[0].get("timeline", {}).get("start")
            if not isinstance(start, (int, float)) or not math.isfinite(float(start)):
                return None
            s = float(start)
            out.append({int(s), int(round(s))})
        except Exception:
            return None
    return out


def validate(folder: Path, lang: str, video_type: str | None = None) -> bool:
    cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    path = folder / "seo_optimized.json"
    if not path.exists():
        fail(f"Missing {path}")
        return False
    try:
        root = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"Invalid JSON: {exc}")
        return False

    inferred = infer_video_type(folder)
    vt = video_type or inferred
    if vt not in {"short", "long"}:
        fail("Cannot resolve video type; pass --video-type short|long or use canonical video_short/video_long folder")
        return False
    if inferred and video_type and inferred != video_type:
        fail(f"--video-type={video_type} conflicts with canonical folder type {inferred}")
        return False

    errors: list[str] = []
    if not isinstance(root, dict) or set(root) != {vt}:
        errors.append(f"root must contain exactly one key '{vt}'")
        payload = {}
    else:
        payload = root[vt]
    if not isinstance(payload, dict) or set(payload) != {"title", "description", "keywords"}:
        errors.append("SEO payload must contain exactly title, description, keywords")
        payload = payload if isinstance(payload, dict) else {}

    title = payload.get("title", "")
    desc = payload.get("description", "")
    tags = payload.get("keywords", [])
    if not isinstance(title, str) or not title.strip():
        errors.append("title must be a non-empty string")
        title = ""
    if len(title) > 100:
        errors.append(f"title exceeds YouTube cap: {len(title)} > 100 characters")
    if "\n" in title or "\r" in title:
        errors.append("title must be a single line")
    if vt == "long" and re.search(r"#shorts?\b", title, re.I):
        errors.append("Long title must not contain #short or #shorts")

    if not isinstance(desc, str) or not desc.strip():
        errors.append("description must be a non-empty string")
        desc = ""
    desc_bytes = len(desc.encode("utf-8"))
    if desc_bytes > 5000:
        errors.append(f"description exceeds YouTube API cap: {desc_bytes} > 5000 UTF-8 bytes")

    hashtags = ["#" + x for x in HASHTAG_RE.findall(desc)]
    hcf = [x.casefold() for x in hashtags]
    if not 3 <= len(hashtags) <= 5:
        errors.append(f"description must contain 3-5 hashtags; found {len(hashtags)}")
    if len(set(hcf)) != len(hcf):
        errors.append("description hashtags must be unique")
    spam = {x.casefold() for x in cfg.get("spam_hashtags", [])}
    bad_spam = sorted(set(hcf) & spam)
    if bad_spam:
        errors.append("project-forbidden spam hashtags: " + ", ".join(bad_spam))
    nonempty_lines = [line.strip() for line in desc.splitlines() if line.strip()]
    if hashtags and nonempty_lines:
        tail_tags = ["#" + x for x in HASHTAG_RE.findall(nonempty_lines[-1])]
        tail_residue = HASHTAG_RE.sub("", nonempty_lines[-1]).strip()
        if len(tail_tags) != len(hashtags) or tail_residue:
            errors.append("all description hashtags must be grouped on the final non-empty line")

    allowed_urls = {str(ch.get("url", "")).rstrip("/>)].,;") for ch in cfg.get("channels", {}).values() if ch.get("url")}
    for raw in URL_RE.findall(desc):
        clean = raw.rstrip("/>)].,;")
        if clean not in allowed_urls:
            errors.append(f"external URL is outside project allow-list: {raw}")

    if not isinstance(tags, list) or not all(isinstance(x, str) and x.strip() for x in tags):
        errors.append("keywords must be an array of non-empty strings")
        tags = []
    if not 15 <= len(tags) <= 20:
        errors.append(f"keywords must contain 15-20 tags; found {len(tags)}")
    norm = [" ".join(x.split()) for x in tags]
    if len({x.casefold() for x in norm}) != len(norm):
        errors.append("keywords contain duplicate tags after case/whitespace normalization")
    invalid = [x for x in norm if not all(ch.isalnum() or ch.isspace() for ch in x)]
    if invalid:
        errors.append("keywords violate project sanitizer (letters/numbers/spaces only): " + repr(invalid[:5]))
    budget = youtube_tag_budget(norm)
    if budget > 500:
        errors.append(f"YouTube combined tag budget exceeded: {budget} > 500")
    elif budget > 400:
        warn(f"tag budget is {budget}; project prefers <=400 for margin")

    combined = " ".join([title, desc, *norm])
    if lang == "en":
        if VI_DIACRITICS.search(combined) or len(ASCII_VI.findall(combined.casefold())) >= 3:
            errors.append("English SEO package appears to contain Vietnamese prose")

    # Timestamps are optional, but if present for Long they must be derived
    # from actual chapter timeline starts rather than invented.
    stamp_lines = STAMP_LINE_RE.findall(desc)
    if vt == "short" and stamp_lines:
        errors.append("Short description must not contain a chapter timestamp block")
    if vt == "long" and stamp_lines:
        try:
            actual = [stamp_to_seconds(x[0]) for x in stamp_lines]
        except ValueError as exc:
            errors.append(f"invalid chapter timestamp: {exc}")
            actual = []
        expected = expected_chapter_starts(folder)
        if expected is None:
            errors.append("chapter timestamps are present but canonical chapter timelines are unavailable/incomplete")
        elif actual:
            if len(actual) != len(expected):
                errors.append(f"chapter timestamp count {len(actual)} does not match chapter count {len(expected)}")
            elif not all(a in e for a, e in zip(actual, expected)):
                errors.append(f"chapter timestamps do not match timeline starts: got {actual}, expected {[sorted(e) for e in expected]}")
            if actual and actual[0] != 0:
                errors.append("first chapter timestamp must be 00:00")
            if any(b <= a for a, b in zip(actual, actual[1:])):
                errors.append("chapter timestamps must increase strictly")

    if errors:
        for item in errors:
            fail(item)
        return False
    print(f"PASS: SEO QA ({vt}/{lang}) — title={len(title)} chars, description={desc_bytes} bytes, tags={len(tags)}, tag_budget={budget}")
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description="Deterministic QA for seo_optimized.json")
    ap.add_argument("--folder", "-f", required=True)
    ap.add_argument("--lang", choices=["vi"], required=True)
    ap.add_argument("--video-type", choices=["short", "long"])
    args = ap.parse_args()
    folder = Path(args.folder).resolve()
    return 0 if validate(folder, args.lang, args.video_type) else 1


if __name__ == "__main__":
    raise SystemExit(main())
