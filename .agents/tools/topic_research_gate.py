#!/usr/bin/env python3
"""QA gate for runtime-only auto-topic research ledger (Production V9)."""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from source_verifier import verify_urls, syntactically_valid  # noqa: E402
from evidence_semantic_verifier import verify_rows as verify_content_rows, summarize as summarize_content  # noqa: E402
from category_keywords import CATEGORY_KEYWORDS  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

STRONG_TYPES = {"primary", "authoritative"}
OBVIOUS_SECONDARY_HOSTS = {
    "reddit.com", "medium.com", "substack.com", "blogspot.com", "wordpress.com",
    "facebook.com", "instagram.com", "tiktok.com", "x.com", "twitter.com",
}


def fail(msg):
    print(f"❌ {msg}", file=sys.stderr)


def _parse_dt(value):
    if value is None or str(value).strip() == "":
        return None
    s = str(value).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        try:
            dt = datetime.strptime(s[:10], "%Y-%m-%d")
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone(timedelta(hours=7)))
    return dt


def _host(url):
    return (urlparse(str(url)).hostname or "").casefold().removeprefix("www.")


def _freshness_days(window):
    return {"7d": 7, "30d": 30, "90d": 90}.get(window)


def _source_strength_floor(sources):
    domains = {_host(s.get("url", "")) for s in sources if _host(s.get("url", ""))}
    strong = [s for s in sources if s.get("source_type") in STRONG_TYPES]
    if len(domains) >= 2 and len(strong) >= 2:
        return 5
    if len(domains) >= 2 and strong:
        return 4
    if len(domains) >= 2:
        return 3
    if sources:
        return 2
    return 1


def main():
    ap = argparse.ArgumentParser(description="QA gate for auto-topic trend/source evidence")
    ap.add_argument("--file", required=True)
    ap.add_argument("--verify-sources", action="store_true", help="Resolve selected evidence URLs online; blocks unsafe/private/unreachable URLs")
    ap.add_argument("--verify-content", action="store_true", help="Verify fetched source content actually supports the selected topic/source note")
    ap.add_argument("--ai-model", default="manual", choices=["agy", "codex", "manual"], help="Used only to adjudicate ambiguous content-support rows")
    ap.add_argument("--verification-cache", help="Optional runtime source-verification cache path")
    ap.add_argument("--content-receipt", help="Optional runtime evidence-content receipt path")
    args = ap.parse_args()
    p = Path(args.file)
    if not p.exists():
        fail(f"research ledger not found: {p}")
        sys.exit(2)
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"invalid JSON: {exc}")
        sys.exit(2)

    candidates = data.get("candidates", [])
    issues = []
    if not 8 <= len(candidates) <= 12:
        issues.append(f"candidate pool must contain 8-12 angles, got {len(candidates)}")
    selected = [c for c in candidates if c.get("decision") == "selected"]
    if len(selected) != 1:
        issues.append(f"exactly one candidate must be selected, got {len(selected)}")

    angles = [" ".join(str(c.get("angle", "")).casefold().split()) for c in candidates]
    if len(set(angles)) != len(angles):
        issues.append("candidate pool contains duplicate angle text")

    checked_at = _parse_dt(data.get("checked_at"))
    if checked_at is None:
        issues.append("checked_at must be a parseable ISO/date timestamp")

    if selected:
        c = selected[0]
        sources = c.get("sources", []) or []
        if len(sources) < 2:
            issues.append("selected topic requires at least 2 independent evidence sources/signals")
        domains = {_host(s.get("url", "")) for s in sources if _host(s.get("url", ""))}
        if len(domains) < 2 and len(sources) >= 2:
            issues.append("selected topic sources must span at least 2 independent domains")

        # Prevent self-reported source_strength from exceeding what the evidence
        # structure can plausibly justify. This does not replace editorial ranking.
        inferred_strength = _source_strength_floor(sources)
        reported_strength = int(c.get("source_strength", 0) or 0)
        if reported_strength > inferred_strength + 1:
            issues.append(
                f"selected source_strength={reported_strength}/5 is not supported by evidence structure (plausible ceiling about {inferred_strength}/5)"
            )

        for s in sources:
            url = str(s.get("url", ""))
            ok, reason = syntactically_valid(url, resolve_dns=False)
            if not ok:
                issues.append(f"invalid/unsafe selected source URL: {url} ({reason})")
            host = _host(url)
            if s.get("source_type") in STRONG_TYPES and any(host == h or host.endswith("." + h) for h in OBVIOUS_SECONDARY_HOSTS):
                issues.append(f"source_type={s.get('source_type')} is implausible for obvious secondary/community host: {host}")
            if len(str(s.get("supports", "")).strip()) < 12:
                issues.append(f"selected source needs a concrete supports note (>=12 chars): {url}")

        if data.get("mode") == "2":
            strong = [s for s in sources if s.get("source_type") in STRONG_TYPES]
            if not strong:
                issues.append("mode=2 selected topic requires at least one primary/authoritative source")

        # category_fit is a planning score, not trusted as proof. Catch only
        # obvious opposite-pillar mismatches deterministically; ambiguous named
        # topics are left to editorial judgment rather than forced by keywords.
        selected_category = data.get("selected_category")
        corpus = " ".join([str(c.get("angle", "")), str(c.get("reason", "")), str(c.get("momentum_signal", ""))] + [str(s.get("supports", "")) for s in sources]).casefold()
        cat_scores = {cat: sum(1 for kw in kws if kw.casefold() in corpus) for cat, kws in CATEGORY_KEYWORDS.items()}
        if selected_category in cat_scores:
            other_scores = [v for k, v in cat_scores.items() if k != selected_category]
            if cat_scores[selected_category] == 0 and other_scores and max(other_scores) >= 2:
                issues.append(f"selected topic has strong deterministic signals for the opposite active category (scores={cat_scores}) despite category_fit={c.get('category_fit')}")

        window = c.get("freshness_window")
        if window == "evergreen":
            reason = str(c.get("reason", "")).casefold()
            momentum = str(c.get("momentum_signal", "")).casefold()
            if not any(k in reason + " " + momentum for k in ["fresh", "new angle", "catalyst", "evergreen", "mới", "góc mới"]):
                issues.append("evergreen selection must explicitly state its fresh angle/catalyst instead of being presented as 'hot now'")
        else:
            days = _freshness_days(window)
            dated = []
            if checked_at is not None and days is not None:
                for s in sources:
                    dt = _parse_dt(s.get("published_at"))
                    if dt is None:
                        continue
                    dated.append(dt)
                    delta = checked_at - dt.astimezone(checked_at.tzinfo)
                    if delta < timedelta(days=-1):
                        issues.append(f"source published_at is in the future relative to checked_at: {s.get('url')}")
                if not dated:
                    issues.append(f"freshness_window={window} requires at least one parseable source published_at")
                elif not any(timedelta(days=-1) <= checked_at - dt.astimezone(checked_at.tzinfo) <= timedelta(days=days + 1) for dt in dated):
                    issues.append(f"freshness_window={window} is not supported by any dated source within ~{days} days of checked_at")

        if reported_strength < 3:
            issues.append("selected topic source_strength must be at least 3/5")
        if int(c.get("visual_richness", 0) or 0) < 3:
            issues.append("selected topic visual_richness must be at least 3/5 for a Veo-first workflow")
        if int(c.get("novelty", 0) or 0) < 3:
            issues.append("selected topic novelty must be at least 3/5 (final novelty is still decided by the duplicate gate)")

        # Content verification already performs public-network validation and a
        # safe GET with redirect re-checks. Avoid a redundant HEAD/GET pass when
        # --verify-content is active; --verify-sources remains the explicit
        # production intent flag. Reachability-only mode still uses the cached
        # concurrent verifier below.
        if args.verify_sources and sources and not args.verify_content:
            cache = Path(args.verification_cache) if args.verification_cache else None
            results = verify_urls([s.get("url", "") for s in sources], cache_path=cache)
            for r in results:
                if not r.get("verified"):
                    issues.append(f"selected source could not be verified online: {r.get('url')} ({r.get('reason')})")

        if args.verify_content and sources:
            rows = verify_content_rows(data, "topic", ai_model=args.ai_model)
            summary = summarize_content(rows)
            for r in summary.get("failed", []):
                issues.append(f"selected source content does not substantiate its topic/support note: {r.get('url')} ({r.get('reason')})")
            if args.content_receipt:
                from evidence_semantic_verifier import write_receipt
                write_receipt(Path(args.content_receipt), "topic", p, summary)

    if args.verify_content and not args.verify_sources:
        issues.append("--verify-content requires --verify-sources in production so semantic support is never checked on an unverified target")

    if issues:
        fail(f"topic research gate failed ({len(issues)} issue(s))")
        for issue in issues:
            print(f"  - {issue}", file=sys.stderr)
        sys.exit(1)
    print(f"✅ Topic research gate passed: {len(candidates)} candidates, one source-grounded selection")
    sys.exit(0)


if __name__ == "__main__":
    main()
