#!/usr/bin/env python3
"""Production-safe runtime URL/source verifier.

V9 goals (no project-schema changes):
- reject placeholder/reserved URLs AND private/internal network targets (SSRF hardening)
- validate redirects/final targets, not only the first hostname
- verify public YouTube IDs via oEmbed
- cache only successful checks
- verify independent URLs concurrently so network latency is bounded
- expose compact page text for a separate semantic-support gate

Reachability is necessary but NOT sufficient evidence. Use evidence_semantic_verifier.py
(or --verify-content on the topic/claim gates) to prove that the retrieved page actually
supports the research note/claim.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import html
import ipaddress
import json
import re
import socket
import ssl
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, HTTPRedirectHandler, HTTPSHandler, build_opener

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

VN_TZ = timezone(timedelta(hours=7))
PLACEHOLDER_HOSTS = {
    "example.com", "example.org", "example.net", "localhost", "invalid",
    "test", "test.local", "localhost.localdomain",
}
PLACEHOLDER_TOKENS = re.compile(
    r"(?:^|[/?=&._-])(fake|dummy|placeholder|example|sample|test)(?:$|[/?=&._-])", re.I
)
USER_AGENT = "Mozilla/5.0 (compatible; vutru-ai-source-verifier/9.0; +source-validation)"
ALLOWED_PORTS = {None, 80, 443}
MAX_FETCH_BYTES = 524288


def _host(url: str) -> str:
    p = urlparse(str(url).strip())
    return (p.hostname or "").casefold().removeprefix("www.")


def _public_ip(ip_text: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_text.split("%", 1)[0])
    except ValueError:
        return False
    # is_global is intentionally stricter than checking only private/loopback:
    # it also rejects link-local, multicast, unspecified, reserved/documentation.
    return bool(ip.is_global)


def _resolve_public_host(host: str, port: int = 443) -> Tuple[bool, str, List[str]]:
    if not host:
        return False, "missing hostname", []
    # Literal IPs do not need DNS.
    try:
        ip = ipaddress.ip_address(host.split("%", 1)[0])
        if not ip.is_global:
            return False, f"non-public IP is forbidden: {host}", [str(ip)]
        return True, "ok", [str(ip)]
    except ValueError:
        pass
    try:
        rows = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        return False, f"DNS resolution failed: {exc}", []
    ips = sorted({row[4][0].split("%", 1)[0] for row in rows if row and row[4]})
    if not ips:
        return False, "DNS returned no addresses", []
    bad = [ip for ip in ips if not _public_ip(ip)]
    if bad:
        return False, f"hostname resolves to non-public address(es): {', '.join(bad)}", ips
    return True, "ok", ips


def syntactically_valid(url: str, resolve_dns: bool = True) -> Tuple[bool, str]:
    try:
        p = urlparse(str(url).strip())
    except Exception:
        return False, "malformed URL"
    if p.scheme not in {"http", "https"} or not p.netloc:
        return False, "URL must be absolute http/https"
    if p.username is not None or p.password is not None:
        return False, "URL user-info/credentials are forbidden"
    try:
        port = p.port
    except ValueError:
        return False, "invalid URL port"
    if port not in ALLOWED_PORTS:
        return False, f"non-standard source port is forbidden: {port}"
    host = _host(url)
    if not host:
        return False, "missing hostname"
    if host in PLACEHOLDER_HOSTS or any(host.endswith("." + x) for x in PLACEHOLDER_HOSTS):
        return False, f"placeholder/test host is forbidden: {host}"
    if host.endswith((".invalid", ".test", ".example", ".localhost", ".local", ".internal")):
        return False, f"reserved/non-public host is forbidden: {host}"
    # Literal private/reserved IPs are forbidden even when DNS resolution is
    # disabled for cheap structural validation.
    try:
        literal_ip = ipaddress.ip_address(host.split("%", 1)[0])
        if not literal_ip.is_global:
            return False, f"non-public IP is forbidden: {host}"
    except ValueError:
        pass
    parsed_path = (p.path or "") + "?" + (p.query or "")
    if PLACEHOLDER_TOKENS.search(parsed_path):
        return False, "URL contains placeholder/fake/test token"
    if resolve_dns:
        ok, reason, _ = _resolve_public_host(host, port or (443 if p.scheme == "https" else 80))
        if not ok:
            return False, reason
    return True, "ok"


def _youtube_id(url: str) -> str | None:
    p = urlparse(url)
    host = _host(url)
    if host == "youtu.be":
        return p.path.strip("/").split("/")[0] or None
    if host.endswith("youtube.com"):
        if p.path == "/watch":
            return (parse_qs(p.query).get("v") or [None])[0]
        m = re.match(r"/(?:shorts|embed|live)/([^/?#]+)", p.path)
        if m:
            return m.group(1)
    return None


class _SafeRedirectHandler(HTTPRedirectHandler):
    """Validate every redirect target BEFORE urllib opens it."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        ok, reason = syntactically_valid(newurl, resolve_dns=True)
        if not ok:
            raise ValueError(f"unsafe redirect blocked before request: {reason}")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _read_url(url: str, timeout: float, max_bytes: int = MAX_FETCH_BYTES) -> Tuple[int, str, str, str]:
    # Validate before opening; post-redirect validation below prevents redirects
    # to loopback/link-local/metadata endpoints.
    ok, reason = syntactically_valid(url, resolve_dns=True)
    if not ok:
        raise ValueError(reason)
    req = Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5",
    })
    handlers = [_SafeRedirectHandler()]
    try:
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
        handlers.append(HTTPSHandler(context=ctx))
    except Exception:
        pass
    opener = build_opener(*handlers)
    with opener.open(req, timeout=timeout) as resp:
        status = int(getattr(resp, "status", 200) or 200)
        final_url = str(resp.geturl())
        final_ok, final_reason = syntactically_valid(final_url, resolve_dns=True)
        if not final_ok:
            raise ValueError(f"unsafe redirect/final URL: {final_reason}")
        raw = resp.read(max_bytes)
        ctype = str(resp.headers.get("Content-Type", ""))
    text = raw.decode("utf-8", errors="ignore") if raw else ""
    return status, final_url, ctype, text


def _compact_text(ctype: str, body: str) -> str:
    if not body:
        return ""
    text = body
    # Remove script/style/nav noise before tags.
    text = re.sub(r"(?is)<(script|style|noscript|svg|template)[^>]*>.*?</\1>", " ", text)
    text = re.sub(r"(?is)<!--.*?-->", " ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:180000]


def fetch_source_document(url: str, timeout: float = 7.0) -> Dict:
    """Fetch a public source and return compact text for semantic verification.

    Public YouTube video pages are checked through oEmbed because watch-page HTML
    is large, dynamic and frequently omits usable title metadata for bots.
    """
    ok, reason = syntactically_valid(url, resolve_dns=True)
    if not ok:
        return {"url": url, "ok": False, "reason": reason, "text": ""}
    target = url
    yid = _youtube_id(url)
    if yid:
        canonical = f"https://www.youtube.com/watch?v={quote(yid)}"
        target = f"https://www.youtube.com/oembed?url={quote(canonical, safe=':/?=&')}&format=json"
    try:
        status, final_url, ctype, body = _read_url(target, timeout)
        if not (200 <= status < 400):
            return {"url": url, "ok": False, "reason": f"HTTP {status}", "text": ""}
        compact = _compact_text(ctype, body)
        lower = compact.casefold()
        if any(x in lower for x in (
            "404 not found", "page not found", "video unavailable",
            "this video isn't available", "this video is unavailable",
        )):
            return {"url": url, "ok": False, "reason": "soft-404/unavailable page", "text": ""}
        if len(compact) < 80:
            return {"url": url, "ok": False, "reason": "retrieved page has too little readable content", "text": compact}
        return {
            "url": url,
            "ok": True,
            "reason": f"HTTP {status}",
            "final_url": final_url,
            "content_type": ctype,
            "text": compact,
            "content_sha256": hashlib.sha256(compact.encode("utf-8")).hexdigest(),
        }
    except (HTTPError, URLError, TimeoutError, socket.timeout, OSError, ValueError) as exc:
        return {"url": url, "ok": False, "reason": str(exc), "text": ""}


def verify_url(url: str, timeout: float = 7.0, retries: int = 1) -> Dict:
    ok, reason = syntactically_valid(url, resolve_dns=True)
    base = {"url": url, "verified": False, "reason": reason, "checked_at": datetime.now(VN_TZ).isoformat()}
    if not ok:
        return base

    yid = _youtube_id(url)
    if yid:
        canonical = f"https://www.youtube.com/watch?v={quote(yid)}"
        targets = [("youtube_oembed", f"https://www.youtube.com/oembed?url={quote(canonical, safe=':/?=&')}&format=json")]
    else:
        targets = [("url", url)]

    last_error = "verification did not run"
    for label, target in targets:
        for attempt in range(1, max(1, retries) + 1):
            try:
                status, final_url, ctype, body = _read_url(target, timeout, max_bytes=262144)
                if 200 <= status < 400:
                    compact = _compact_text(ctype, body)
                    lower = compact.casefold()
                    soft_fail = any(x in lower for x in [
                        "404 not found", "page not found", "video unavailable",
                        "this video isn't available", "this video is unavailable",
                    ])
                    if not soft_fail:
                        base.update({
                            "verified": True,
                            "reason": f"{label} resolved with HTTP {status}",
                            "http_status": status,
                            "final_url": final_url,
                            "content_sha256": hashlib.sha256(compact.encode("utf-8")).hexdigest() if compact else None,
                        })
                        return base
                    last_error = "source resolved to an unavailable/soft-404 page"
                else:
                    last_error = f"HTTP {status}"
            except HTTPError as exc:
                last_error = f"HTTP {exc.code}"
                if exc.code in {400, 401, 403, 404, 410, 451}:
                    break
            except (URLError, TimeoutError, socket.timeout, OSError, ValueError) as exc:
                last_error = f"network/security error: {exc}"
            if attempt < retries:
                time.sleep(min(1.0, 0.35 * attempt))
    base["reason"] = last_error
    return base


def _load_cache(path: Path) -> Dict:
    if not path.exists():
        return {"version": 2, "entries": {}}
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(d, dict) or not isinstance(d.get("entries"), dict):
            raise ValueError("invalid cache structure")
        return d
    except Exception:
        return {"version": 2, "entries": {}}


def _fresh(entry: Dict, ttl_hours: int) -> bool:
    if not entry.get("verified"):
        return False
    try:
        checked = datetime.fromisoformat(str(entry.get("checked_at")))
        if checked.tzinfo is None:
            checked = checked.replace(tzinfo=VN_TZ)
        return (datetime.now(VN_TZ) - checked.astimezone(VN_TZ)).total_seconds() <= ttl_hours * 3600
    except Exception:
        return False


def verify_urls(urls: Iterable[str], cache_path: Path | None = None, ttl_hours: int = 24,
                timeout: float = 7.0, retries: int = 1, workers: int = 4) -> List[Dict]:
    """Verify unique URLs concurrently while preserving input order."""
    unique = list(dict.fromkeys(str(u).strip() for u in urls if str(u).strip()))
    cache = _load_cache(cache_path) if cache_path else {"version": 2, "entries": {}}
    entries = cache.setdefault("entries", {})
    by_url: Dict[str, Dict] = {}
    pending: List[str] = []
    for url in unique:
        cached = entries.get(url)
        if isinstance(cached, dict) and _fresh(cached, ttl_hours):
            row = dict(cached)
            row["cached"] = True
            by_url[url] = row
        else:
            pending.append(url)

    if pending:
        max_workers = max(1, min(int(workers or 1), 8, len(pending)))
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = {pool.submit(verify_url, url, timeout, retries): url for url in pending}
            for fut in concurrent.futures.as_completed(futures):
                url = futures[fut]
                try:
                    row = fut.result()
                except Exception as exc:  # fail closed; worker errors are not evidence
                    row = {"url": url, "verified": False, "reason": f"verification worker error: {exc}", "checked_at": datetime.now(VN_TZ).isoformat()}
                row["cached"] = False
                by_url[url] = row
                entries[url] = {k: v for k, v in row.items() if k != "cached"}

    results = [by_url[url] for url in unique]
    if cache_path:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache["version"] = 2
        cache["updated_at"] = datetime.now(VN_TZ).isoformat()
        cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return results


def urls_from_ledger(data: Dict, kind: str, mode: str | None = None) -> List[str]:
    if kind == "topic":
        selected = [c for c in data.get("candidates", []) if c.get("decision") == "selected"]
        return [s.get("url", "") for c in selected for s in (c.get("sources", []) or [])]
    urls: List[str] = []
    for c in data.get("claims", []) or []:
        if c.get("decision") == "reject":
            continue
        urls.extend(s.get("url", "") for s in (c.get("sources", []) or []))
    return urls


def main() -> int:
    ap = argparse.ArgumentParser(description="Verify public evidence URLs without changing project schemas")
    ap.add_argument("--file", required=True, help="topic or claim runtime ledger JSON")
    ap.add_argument("--kind", required=True, choices=["topic", "claim"])
    ap.add_argument("--mode", choices=["1", "2"])
    ap.add_argument("--cache", help="optional persistent runtime verification cache")
    ap.add_argument("--ttl-hours", type=int, default=24)
    ap.add_argument("--timeout", type=float, default=7.0)
    ap.add_argument("--retries", type=int, default=1)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--json-output", action="store_true")
    args = ap.parse_args()

    p = Path(args.file)
    if not p.exists():
        print(f"❌ source ledger not found: {p}", file=sys.stderr)
        return 2
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"❌ invalid JSON: {exc}", file=sys.stderr)
        return 2
    urls = urls_from_ledger(data, args.kind, args.mode)
    if not urls:
        print("❌ no evidence URLs found for verification", file=sys.stderr)
        return 1
    cache = Path(args.cache) if args.cache else None
    results = verify_urls(urls, cache, args.ttl_hours, args.timeout, args.retries, args.workers)
    failed = [r for r in results if not r.get("verified")]
    out = {"pass": not failed, "kind": args.kind, "verified": len(results) - len(failed), "total": len(results), "results": results}
    if args.json_output:
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        for r in results:
            mark = "✅" if r.get("verified") else "❌"
            cache_note = " [cache]" if r.get("cached") else ""
            print(f"{mark} {r['url']} — {r.get('reason')}{cache_note}")
        print(f"{'✅' if not failed else '❌'} Source verification: {len(results)-len(failed)}/{len(results)} verified")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
