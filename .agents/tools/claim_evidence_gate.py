#!/usr/bin/env python3
"""Runtime-only claim/source gate for factual documentary scripts.

This gate validates ledger quality and, when --script is supplied, performs a
conservative deterministic coverage check for material high-risk script claims
(numbers/dates/causation/absence/institutional assertions). Production V9 can
also verify both public URL reachability and semantic support from retrieved
source content without changing the project output schema.
"""
import argparse
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

from source_verifier import verify_urls, syntactically_valid
from evidence_semantic_verifier import verify_rows as verify_content_rows, summarize as summarize_content, write_receipt as write_content_receipt
from urllib.parse import urlparse
from difflib import SequenceMatcher

if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if sys.stderr.encoding != "utf-8":
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

STRONG = {"primary", "authoritative", "peer_reviewed"}
HIGH_RISK = {"number", "date", "institution", "causation", "absence", "historical_reconstruction"}

UNIT_NUMBER_RE = re.compile(
    r"\b\d+(?:[.,]\d+)?\s*(?:%|percent|phần\s*trăm|km|kilometers?|kilometres?|m|meters?|metres?|cm|mm|kg|g|tons?|tonnes?|"
    r"°\s*[cf]|degrees?\s*[cf]|độ\s*[cf]|years?|năm|million|billion|trillion|triệu|tỷ|nghìn|thousand)\b",
    re.I,
)
YEAR_RE = re.compile(r"\b(?:1[5-9]\d{2}|20\d{2}|2100)\b")
CAUSATION_RE = re.compile(r"\b(?:causes?|caused|because|therefore|leads? to|results? in|due to|gây ra|khiến|dẫn đến|bởi vì|do đó)\b", re.I)
ABSENCE_RE = re.compile(r"\b(?:no evidence|no anomaly|none detected|nothing detected|không có bằng chứng|chưa có bằng chứng|không phát hiện|chưa phát hiện)\b", re.I)
INSTITUTION_RE = re.compile(r"\b(?:NASA|ESA|UNESCO|IUGS|NOAA|CERN|WHO|university|institute|observatory|agency|cơ quan|viện|đại học)\b", re.I)

STRONG_CERTAINTY_RE = re.compile(
    r"\b(?:đã\s+chứng\s+minh(?:\s+rằng)?|chứng\s+minh\s+hoàn\s+toàn|giải\s+mã\s+trọn\s+vẹn|giải\s+thích\s+hoàn\s+toàn|"
    r"hoàn\s+toàn\s+chắc\s+chắn|không\s+còn\s+nghi\s+ngờ|has\s+proven\s+that|proved\s+that|proves\s+that|"
    r"definitively\s+proves|conclusively\s+proves|fully\s+explained|completely\s+explained|without\s+any\s+doubt)\b",
    re.I,
)
UNCERTAIN_CERTAINTIES = {"preliminary", "disputed", "hypothetical", "unknown"}
UNCERTAIN_DECISIONS = {"qualified", "speculative"}
QUALIFIER_RE = re.compile(
    r"\b(?:có\s+thể|có\s+khả\s+năng|dường\s+như|gợi\s+ý|liên\s+quan|được\s+cho\s+là|may|might|could|appears?\s+to|suggests?|associated\s+with|linked\s+to)\b",
    re.I,
)

STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "that", "this", "is", "are", "was", "were",
    "và", "là", "của", "trong", "một", "những", "các", "được", "với", "cho", "này", "đó", "khi", "từ", "đến",
}


def fail(msg):
    print(f"❌ {msg}", file=sys.stderr)


def good_url(u):
    # Backward-compatible structural check. Production safety/reachability is
    # enforced only when --verify-sources/--verify-content is requested.
    try:
        x = urlparse(str(u))
        return x.scheme in {"http", "https"} and bool(x.netloc)
    except Exception:
        return False


OBVIOUS_SECONDARY_HOSTS = {
    "reddit.com", "medium.com", "substack.com", "blogspot.com", "wordpress.com",
    "facebook.com", "instagram.com", "tiktok.com", "x.com", "twitter.com",
}


def source_type_sane(source):
    host = (urlparse(str(source.get("url", ""))).hostname or "").casefold().removeprefix("www.")
    typ = source.get("source_type")
    if typ in STRONG and any(host == h or host.endswith("." + h) for h in OBVIOUS_SECONDARY_HOSTS):
        return False, f"source_type={typ} is implausible for obvious secondary/community host {host}"
    if typ == "peer_reviewed" and (host.endswith("arxiv.org") or host.endswith("biorxiv.org") or host.endswith("medrxiv.org")):
        return False, f"preprint host {host} cannot be labeled peer_reviewed"
    return True, ""


def norm(text):
    text = unicodedata.normalize("NFKC", str(text)).casefold()
    text = text.replace(",", ".")
    text = re.sub(r"[^\w.%°\s-]", " ", text, flags=re.UNICODE)
    return " ".join(text.split())


def tokens(text):
    return {t for t in re.findall(r"[\w.%°-]+", norm(text), flags=re.UNICODE) if len(t) > 1 and t not in STOPWORDS}


def sentence_split(text):
    return [x.strip() for x in re.split(r"(?<=[.!?。！？])\s+|\n+", str(text)) if x.strip()]


def material_sentence(sentence):
    return bool(UNIT_NUMBER_RE.search(sentence) or YEAR_RE.search(sentence) or CAUSATION_RE.search(sentence) or ABSENCE_RE.search(sentence) or INSTITUTION_RE.search(sentence))


def matching_claim(sentence, claims):
    """Return the best sufficiently related non-rejected claim or None."""
    s_norm = norm(sentence)
    s_tok = tokens(sentence)
    if not s_tok:
        return None
    best = None
    best_score = 0.0
    for c in claims:
        if c.get("decision") == "reject":
            continue
        corpus = f"{c.get('statement','')} {c.get('allowed_wording','')}"
        c_norm = norm(corpus)
        c_tok = tokens(corpus)
        if not c_tok:
            continue
        inter = len(s_tok & c_tok)
        union = len(s_tok | c_tok)
        jaccard = inter / union if union else 0.0
        seq = SequenceMatcher(None, s_norm, c_norm).ratio()
        literals = [norm(x) for x in UNIT_NUMBER_RE.findall(sentence)] + [norm(x) for x in YEAR_RE.findall(sentence)]
        literals_ok = all(lit in c_norm for lit in literals) if literals else True
        qualifies = literals_ok and (jaccard >= 0.20 or seq >= 0.43 or inter >= 4)
        score = max(jaccard, seq, min(1.0, inter / 6.0))
        if qualifies and score > best_score:
            best, best_score = c, score
    return best


def covered_by_claim(sentence, claims):
    return matching_claim(sentence, claims) is not None


def rejected_claim_leaks(script, claims):
    leaks = []
    script_n = norm(script)
    for c in claims:
        if c.get("decision") != "reject":
            continue
        statement = norm(c.get("statement", ""))
        if len(statement) >= 24 and statement in script_n:
            leaks.append(str(c.get("claim_id", "<unknown>")))
    return leaks


def main():
    ap = argparse.ArgumentParser(description="Validate runtime Claim Evidence Lock ledger")
    ap.add_argument("--file", required=True)
    ap.add_argument("--mode", choices=["1", "2"])
    ap.add_argument("--script", help="Optional master_script.txt for deterministic material-claim coverage checking")
    ap.add_argument("--verify-sources", action="store_true", help="Production mode: resolve evidence URLs online and fail closed on unsafe/unavailable sources")
    ap.add_argument("--verify-content", action="store_true", help="Production V9: verify retrieved source content actually supports each ledger support note/claim")
    ap.add_argument("--ai-model", default="manual", choices=["agy", "codex", "manual"], help="Used only for ambiguous evidence-content adjudication")
    ap.add_argument("--verification-cache", help="Optional runtime source-verification cache path")
    ap.add_argument("--content-receipt", help="Optional runtime content-support receipt path written during --verify-content")
    ap.add_argument("--require-content-receipt", help="Validate an existing PASS content receipt against the current ledger without re-fetching sources")
    a = ap.parse_args()
    p = Path(a.file)
    if not p.exists():
        fail(f"claim ledger not found: {p}")
        return 2
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        fail(f"invalid JSON: {e}")
        return 2

    mode = a.mode or str(d.get("mode", ""))
    if mode not in {"1", "2"}:
        fail("mode must be 1 or 2 (argument or ledger.mode)")
        return 2
    if str(d.get("mode", "")) not in {"", mode}:
        fail(f"mode mismatch: CLI mode={mode}, ledger.mode={d.get('mode')}")
        return 1

    issues = []
    ids = set()
    claims = d.get("claims", [])
    if not isinstance(claims, list) or not claims:
        issues.append("claims must not be empty")
        claims = []

    for c in claims:
        cid = str(c.get("claim_id", "")).strip()
        typ = c.get("claim_type")
        dec = c.get("decision")
        cert = c.get("certainty")
        if not cid:
            issues.append("claim missing claim_id")
        elif cid in ids:
            issues.append(f"duplicate claim_id {cid}")
        ids.add(cid)

        src = c.get("sources", []) or []
        valid = [s for s in src if isinstance(s, dict) and good_url(s.get("url", ""))]
        strong = [s for s in valid if s.get("source_type") in STRONG]
        for source in src:
            if not isinstance(source, dict):
                continue
            sane, reason = source_type_sane(source)
            if not sane:
                issues.append(f"{cid}: {reason}")
            if source.get("url") and not good_url(source.get("url")):
                issues.append(f"{cid}: invalid source URL: {source.get('url')}")
            if (a.verify_sources or a.verify_content) and source.get("url"):
                safe, safe_reason = syntactically_valid(str(source.get("url")), resolve_dns=False)
                if not safe:
                    issues.append(f"{cid}: unsafe production source URL: {source.get('url')} ({safe_reason})")

        # A rejected claim may stay in the ledger as an audit trail; script
        # leakage is checked below when --script is supplied.
        if dec != "reject":
            if mode == "2":
                if dec not in {"verified", "qualified"}:
                    issues.append(f"{cid}: mode=2 requires verified/qualified decision, got {dec}")
                if not valid:
                    issues.append(f"{cid}: mode=2 claim requires at least one valid source URL")
                if typ in HIGH_RISK and not strong:
                    issues.append(f"{cid}: {typ} claim requires a primary/authoritative/peer-reviewed source")
                if cert in {"hypothetical", "unknown"} and dec == "verified":
                    issues.append(f"{cid}: cannot mark {cert} claim as verified")
                for i, source in enumerate(valid, 1):
                    if len(str(source.get("supports", "")).strip()) < 8:
                        issues.append(f"{cid}: source {i} needs a concrete 'supports' note describing what the source supports")
            else:
                if typ != "hypothesis" and dec in {"verified", "qualified"} and not valid:
                    issues.append(f"{cid}: factual mode=1 claim marked {dec} requires a source")
                if typ == "hypothesis" and cert not in {"hypothetical", "preliminary", "disputed", "unknown", "supported"}:
                    issues.append(f"{cid}: hypothesis certainty is too absolute ({cert})")

        wording = str(c.get("allowed_wording", "")).strip().casefold()
        if not wording:
            issues.append(f"{cid}: allowed_wording missing")
        vr = str(c.get("visual_rule", "")).strip().casefold()
        if not vr:
            issues.append(f"{cid}: visual_rule missing")
        if typ == "absence" and any(x in wording for x in ["proves no", "proves that no", "definitively no", "zero evidence proves", "completely rules out"]):
            issues.append(f"{cid}: absence claim wording is absolute; describe survey scope/detection limits instead")

    if a.require_content_receipt:
        rp = Path(a.require_content_receipt)
        if not rp.exists():
            issues.append(f"required evidence content receipt not found: {rp}")
        else:
            try:
                receipt = json.loads(rp.read_text(encoding="utf-8"))
                expected_hash = hashlib.sha256(p.read_bytes()).hexdigest()
                if receipt.get("kind") != "claim":
                    issues.append("evidence content receipt kind mismatch")
                if receipt.get("ledger_sha256") != expected_hash:
                    issues.append("evidence content receipt is stale: claim ledger hash changed")
                if receipt.get("pass") is not True:
                    issues.append("evidence content receipt does not record PASS")
                if int(receipt.get("supported", 0)) != int(receipt.get("total", -1)):
                    issues.append("evidence content receipt has incomplete supported-source coverage")
            except Exception as exc:
                issues.append(f"invalid evidence content receipt: {exc}")

    # --verify-content already performs safe public-network validation + fetch.
    # Do not spend a second reachability request for the same URLs.
    if a.verify_sources and not a.verify_content:
        urls = []
        for c in claims:
            if c.get("decision") == "reject":
                continue
            urls.extend(s.get("url", "") for s in (c.get("sources", []) or []) if isinstance(s, dict))
        if urls:
            cache = Path(a.verification_cache) if a.verification_cache else None
            results = verify_urls(urls, cache_path=cache)
            for r in results:
                if not r.get("verified"):
                    issues.append(f"evidence source could not be verified online: {r.get('url')} ({r.get('reason')})")
        elif mode == "2":
            issues.append("mode=2 source verification requested but no evidence URLs were available")

    if a.verify_content:
        if not a.verify_sources:
            issues.append("--verify-content requires --verify-sources so content is never trusted from an unverified network target")
        else:
            rows = verify_content_rows(d, "claim", ai_model=a.ai_model)
            summary = summarize_content(rows)
            for r in summary.get("failed", []):
                issues.append(
                    f"{r.get('owner_id','<unknown>')}: source content does not substantiate its claim/support note: "
                    f"{r.get('url')} ({r.get('reason')})"
                )
            # High-risk mode=2 claims require at least one semantically supported
            # strong source, not merely a self-declared strong label in the ledger.
            by_owner = summary.get("by_owner", {})
            for c in claims:
                if c.get("decision") == "reject":
                    continue
                cid = str(c.get("claim_id", ""))
                bucket = by_owner.get(cid, {})
                if mode == "2" and int(bucket.get("supported", 0)) < 1:
                    issues.append(f"{cid}: mode=2 claim has no semantically supported source")
                if mode == "2" and c.get("claim_type") in HIGH_RISK and int(bucket.get("strong_supported", 0)) < 1:
                    issues.append(f"{cid}: high-risk claim has no semantically supported strong source")
            if a.content_receipt:
                write_content_receipt(Path(a.content_receipt), "claim", p, summary)

    if a.script:
        sp = Path(a.script)
        if not sp.exists():
            fail(f"script not found: {sp}")
            return 2
        script = sp.read_text(encoding="utf-8")
        leaks = rejected_claim_leaks(script, claims)
        for cid in leaks:
            issues.append(f"{cid}: rejected claim statement still appears verbatim in master script")

        material = [sent for sent in sentence_split(script) if material_sentence(sent)]
        uncovered = [sent for sent in material if not covered_by_claim(sent, claims)]
        # For verified-news mode this is a hard completeness contract. For
        # hypothesis mode, high-risk factual sentences are still expected to
        # be ledgered; speculative sentences without the material cues above
        # are intentionally outside this deterministic net.
        for sent in uncovered[:20]:
            preview = sent if len(sent) <= 180 else sent[:177] + "..."
            issues.append(f"material script claim lacks matching ledger coverage: {preview}")
        if len(uncovered) > 20:
            issues.append(f"... plus {len(uncovered) - 20} additional uncovered material script claims")


        # Epistemic-strength check: a covered but uncertain claim may not be
        # upgraded to absolute/proof language merely for dramatic narration.
        for sent in sentence_split(script):
            if not STRONG_CERTAINTY_RE.search(sent):
                continue
            match = matching_claim(sent, claims)
            if not match:
                # Cross-language ledgers can share only proper nouns/acronyms
                # with the narration. For strong-certainty wording, allow a
                # conservative fallback match on >=2 distinctive shared tokens
                # against uncertain claims rather than silently missing the
                # overstatement.
                s_tok = tokens(sent)
                candidates = []
                for c in claims:
                    if c.get("decision") == "reject":
                        continue
                    if not (c.get("decision") in UNCERTAIN_DECISIONS or c.get("certainty") in UNCERTAIN_CERTAINTIES):
                        continue
                    corpus_tok = tokens(f"{c.get('statement','')} {c.get('allowed_wording','')}")
                    shared = s_tok & corpus_tok
                    if len(shared) >= 2:
                        candidates.append((len(shared), c))
                if candidates:
                    match = max(candidates, key=lambda x: x[0])[1]
            if not match:
                continue
            if match.get("decision") in UNCERTAIN_DECISIONS or match.get("certainty") in UNCERTAIN_CERTAINTIES:
                preview = sent if len(sent) <= 180 else sent[:177] + "..."
                issues.append(
                    f"{match.get('claim_id','<unknown>')}: script uses absolute certainty stronger than "
                    f"ledger decision/certainty ({match.get('decision')}/{match.get('certainty')}): {preview}"
                )


        # A causation claim that is only qualified/speculative must keep an
        # audible qualifier near the causal wording; otherwise association can
        # silently become direct causation in narration.
        for sent in sentence_split(script):
            if not CAUSATION_RE.search(sent) or QUALIFIER_RE.search(sent):
                continue
            match = matching_claim(sent, claims)
            if not match or match.get("claim_type") != "causation":
                continue
            if match.get("decision") in UNCERTAIN_DECISIONS or match.get("certainty") in UNCERTAIN_CERTAINTIES:
                preview = sent if len(sent) <= 180 else sent[:177] + "..."
                issues.append(
                    f"{match.get('claim_id','<unknown>')}: qualified/speculative causation lost its uncertainty qualifier in script: {preview}"
                )

    if issues:
        fail(f"claim evidence gate failed ({len(issues)} issue(s))")
        for x in issues[:30]:
            print("  - " + x, file=sys.stderr)
        return 1

    coverage_suffix = ", script coverage checked" if a.script else ""
    print(f"✅ Claim evidence gate passed: {len(claims)} claims, mode={mode}{coverage_suffix}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
