#!/usr/bin/env python3
"""Deterministic editorial guard for the runtime message lock + master script.

This is intentionally conservative. It validates structural/message coverage
and spoken-language risk signals, but does not pretend to replace semantic
editorial judgment or source verification.
"""
import argparse
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

try:
    from jsonschema import Draft7Validator
except Exception:  # pragma: no cover
    Draft7Validator = None

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "schemas" / "editorial_message_lock.schema.json"

VI_STOP = {
    "và","là","của","trong","một","những","các","được","với","cho","này","đó","khi","từ","đến","ở","về","có",
    "nhưng","thì","mà","như","để","trên","dưới","ra","vào","theo","sẽ","đang","đã","chính","cũng","lại","không",
}
EN_STOP = {
    "the","a","an","and","or","of","to","in","on","for","with","that","this","is","are","was","were","be",
    "as","at","by","from","it","its","into","but","not","we","they","you","can","could","would","should",
}

VI_HYPE = [
    "vô cùng","kinh hoàng","khổng lồ","chấn động","ma mị","mãnh liệt","cực kỳ","sững sờ","độc nhất vô nhị",
    "mở toang","dấu hỏi to đùng","ngàn năm có một","xé toạc","khủng khiếp","choáng váng","không tưởng",
    "ngoạn mục","rùng mình","điên rồ","cực mạnh","kinh ngạc",
]
EN_HYPE = [
    "terrifying","shocking","mind-blowing","massive","enormous","staggering","unbelievable","breathtaking",
    "astonishing","incredible","insane","jaw-dropping","unprecedentedly","earth-shattering","mysterious",
]

VI_FILLER = ["và đó chưa phải là tất cả", "nhưng câu chuyện chưa dừng lại ở đó", "điều thú vị là", "đáng kinh ngạc hơn"]
EN_FILLER = ["and that's not all", "but the story doesn't end there", "here's where it gets interesting", "even more astonishing"]

VI_ABSOLUTE = [
    "đã chứng minh rằng", "chứng minh rằng", "chứng minh hoàn toàn", "giải mã trọn vẹn", "giải thích hoàn toàn",
    "không còn nghi ngờ", "chắc chắn rằng", "hoàn toàn chắc chắn", "đã được chứng minh", "đã xác lập chắc chắn",
]
EN_ABSOLUTE = [
    "has proven that", "proved that", "proves that", "fully explained", "completely explained", "without any doubt",
    "definitively proves", "conclusively proves", "is unquestionably",
]
LONG_MIN_CHARS_EXCLUSIVE = 60000
LONG_RECOMMENDED_CHARS = 65000


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s)).casefold()
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^\w\s]", " ", s, flags=re.UNICODE)
    return " ".join(s.split())


def toks(s, language):
    stop = VI_STOP if language == "vi" else EN_STOP
    return [t for t in norm(s).split() if len(t) > 2 and t not in stop]


def overlap(needle, haystack, language):
    a = set(toks(needle, language))
    b = set(toks(haystack, language))
    if not a:
        return 1.0
    return len(a & b) / len(a)


def split_sentences(text):
    return [x.strip() for x in re.split(r"(?<=[.!?。！？])\s+|\n+", text) if x.strip()]


def count_phrase(text, phrase):
    return len(re.findall(re.escape(norm(phrase)), norm(text)))


def schema_errors(data):
    if Draft7Validator is None:
        return []
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    return [e.message for e in Draft7Validator(schema).iter_errors(data)]


def main():
    ap = argparse.ArgumentParser(description="Validate editorial message lock and optional master script")
    ap.add_argument("--lock", required=True)
    ap.add_argument("--script")
    ap.add_argument("--video-type", choices=["short", "long"], required=True)
    ap.add_argument("--language", choices=["vi"], required=True)
    ap.add_argument("--mode", choices=["1", "2"], required=True)
    a = ap.parse_args()

    lp = Path(a.lock)
    if not lp.exists():
        print(f"❌ editorial lock not found: {lp}", file=sys.stderr)
        return 2
    try:
        lock = json.loads(lp.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"❌ invalid editorial lock JSON: {e}", file=sys.stderr)
        return 2

    issues, warnings = [], []
    for err in schema_errors(lock):
        issues.append(f"schema: {err}")
    if lock.get("language") != a.language:
        issues.append(f"language mismatch: lock={lock.get('language')} cli={a.language}")
    if lock.get("video_type") != a.video_type:
        issues.append(f"video_type mismatch: lock={lock.get('video_type')} cli={a.video_type}")
    revs = lock.get("key_revelations", []) or []
    if a.video_type == "short" and not (2 <= len(revs) <= 4):
        issues.append("short requires 2–4 key_revelations")
    if a.video_type == "long" and not (4 <= len(revs) <= 8):
        issues.append("long requires 4–8 key_revelations")
    if norm(lock.get("core_message", "")) == norm(lock.get("ending_takeaway", "")):
        issues.append("ending_takeaway must restate/synthesize the core message in fresh wording, not duplicate it verbatim")

    if not a.script:
        if issues:
            print(f"❌ Editorial preflight failed ({len(issues)} issue(s))", file=sys.stderr)
            for x in issues: print("  - " + x, file=sys.stderr)
            return 1
        print(f"✅ Editorial message lock preflight passed ({len(revs)} revelations)")
        return 0

    sp = Path(a.script)
    if not sp.exists():
        print(f"❌ script not found: {sp}", file=sys.stderr)
        return 2
    script = sp.read_text(encoding="utf-8").strip()
    if not script:
        issues.append("master script is empty")

    chars = len(script)
    if a.video_type == "short":
        lo, hi = 900, 1200
        if not (lo <= chars <= hi):
            issues.append(f"script length {chars} outside canonical short range {lo}–{hi}")
    else:
        # LONG has a strict >60,000-character floor and no maximum. The floor
        # never overrides anti-padding/message/evidence/cadence quality gates.
        if not script.strip():
            issues.append("long script is empty")
        elif chars <= LONG_MIN_CHARS_EXCLUSIVE:
            issues.append(
                f"long script length {chars} is too short; require strictly > {LONG_MIN_CHARS_EXCLUSIVE} "
                f"Unicode characters (recommended >= {LONG_RECOMMENDED_CHARS}), with no maximum"
            )
        elif chars < LONG_RECOMMENDED_CHARS:
            warnings.append(
                f"long script length {chars} clears the >60000 hard floor but is below the recommended {LONG_RECOMMENDED_CHARS}-character production margin"
            )

    sentences = split_sentences(script)
    word_counts = [len(s.split()) for s in sentences] or [0]
    avg = sum(word_counts) / max(1, len(word_counts))
    over45 = sum(1 for n in word_counts if n > 45)
    over55 = sum(1 for n in word_counts if n > 55)
    max_words = max(word_counts)

    # Spoken cadence: block sustained article-like sentence packing, not an occasional useful long sentence.
    if avg > 34:
        issues.append(f"spoken cadence too dense: average {avg:.1f} words/sentence (>34)")
    if over55 > max(1, int(len(word_counts) * 0.05)):
        issues.append(f"too many 55+ word sentences: {over55}/{len(word_counts)} (max={max_words})")
    if len(word_counts) >= 8 and over45 / len(word_counts) > 0.20:
        issues.append(f"too many 45+ word sentences: {over45}/{len(word_counts)}")
    elif over45:
        warnings.append(f"review {over45} sentence(s) over 45 words; max={max_words}")

    # Message coverage. Token-overlap is intentionally a weak deterministic floor; semantic self-read remains mandatory.
    if overlap(lock.get("central_question", ""), script, a.language) < 0.30:
        issues.append("central_question has weak lexical coverage in script; verify the narration actually answers the declared question")
    if overlap(lock.get("core_message", ""), script, a.language) < 0.30:
        issues.append("core_message has weak coverage in script")
    for i, r in enumerate(revs, 1):
        if overlap(r, script, a.language) < 0.24:
            issues.append(f"key_revelation {i} has weak coverage in script")

    final_window = " ".join(sentences[max(0, int(len(sentences) * 0.75)):])
    if overlap(lock.get("ending_takeaway", ""), final_window, a.language) < 0.24:
        issues.append("ending_takeaway is not sufficiently represented in the final quarter of the narration")

    # V8 anti-padding / anti-formula checks. These work only on the script
    # text and do not add or alter any project data field.
    normalized_sentences = [norm(x) for x in sentences if len(x.split()) >= 6]
    sentence_counts = Counter(normalized_sentences)
    repeated_exact = [(sent, n) for sent, n in sentence_counts.items() if n >= 2]
    repeated_3x = [(sent, n) for sent, n in repeated_exact if n >= 3]
    if repeated_3x:
        previews = [f"{sent[:90]}… ×{n}" for sent, n in repeated_3x[:4]]
        issues.append("script padding/repetition detected: exact substantial sentence repeated 3+ times: " + " | ".join(previews))
    elif repeated_exact and a.video_type == "long":
        warnings.append(f"{len(repeated_exact)} substantial sentence(s) repeat verbatim; review for formulaic padding")

    # Consecutive near-duplicate sentences usually indicate an LLM restating
    # the same fact instead of advancing the explanation.
    near_pairs = 0
    for left, right in zip(sentences, sentences[1:]):
        la, rb = set(toks(left, a.language)), set(toks(right, a.language))
        if len(la) < 4 or len(rb) < 4:
            continue
        sim = len(la & rb) / max(1, len(la | rb))
        if sim >= 0.72:
            near_pairs += 1
    if near_pairs > max(2, int(len(sentences) * 0.08)):
        issues.append(f"too many consecutive near-restatements: {near_pairs}/{len(sentences)} sentence pairs")
    elif near_pairs:
        warnings.append(f"review {near_pairs} consecutive sentence pair(s) with high lexical overlap")

    # Repeating the same 2-token opening too often makes narration sound like
    # a template even when the facts differ.
    starts = Counter()
    for sent in sentences:
        st = toks(sent, a.language)[:2]
        if len(st) == 2:
            starts[" ".join(st)] += 1
    max_start = max(starts.values(), default=0)
    start_budget = 3 if a.video_type == "short" else max(5, int(len(sentences) * 0.10))
    if max_start > start_budget:
        phrase, n = max(starts.items(), key=lambda kv: kv[1])
        issues.append(f"formulaic sentence openings: '{phrase}' starts {n} sentences (budget {start_budget})")

    # Hype/repetition budget.
    hype = VI_HYPE if a.language == "vi" else EN_HYPE
    hype_hits = {p: count_phrase(script, p) for p in hype}
    hype_hits = {p: n for p, n in hype_hits.items() if n}
    total_hype = sum(hype_hits.values())
    words = max(1, len(script.split()))
    if a.video_type == "long" and total_hype / words * 1000 > 7.0:
        issues.append(f"hype density too high: {total_hype} markers / {words} words ({total_hype/words*1000:.1f} per 1000)")
    if a.video_type == "short" and total_hype > 5:
        issues.append(f"short uses too many hype markers: {total_hype} (target <=5)")
    repeated_hype = [f"{p}×{n}" for p, n in hype_hits.items() if n > 2]
    if repeated_hype:
        issues.append("repeated hype phrase(s): " + ", ".join(repeated_hype))

    filler = VI_FILLER if a.language == "vi" else EN_FILLER
    repeated_filler = [f"{p}×{count_phrase(script,p)}" for p in filler if count_phrase(script,p) > 1]
    if repeated_filler:
        issues.append("repeated filler bridge(s): " + ", ".join(repeated_filler))

    # Rhetorical-question density; questions are useful, but answers must dominate.
    q = script.count("?")
    if a.video_type == "short" and q > 4:
        issues.append(f"too many rhetorical/question beats for a short: {q}")
    if a.video_type == "long" and q > max(8, words // 250 + 3):
        issues.append(f"question density is high ({q} questions / {words} words); narration may be teasing more than explaining")

    # Common overstatement signatures. Mode 1 is strict; mode 2 is warning because a verified fact may legitimately use strong language.
    absolutes = VI_ABSOLUTE if a.language == "vi" else EN_ABSOLUTE
    abs_hits = [p for p in absolutes if count_phrase(script, p)]
    if abs_hits:
        msg = "strong-certainty wording requires direct evidence/Claim Evidence Lock support: " + ", ".join(abs_hits)
        if a.mode == "1":
            issues.append(msg)
        else:
            warnings.append(msg)

    # Optional explicit no-overclaim phrases from research/editorial planning must not leak verbatim.
    blocked = lock.get("do_not_overclaim", []) or []
    leaks = [x for x in blocked if len(norm(x)) >= 4 and norm(x) in norm(script)]
    if leaks:
        issues.append("do_not_overclaim wording leaked into script: " + " | ".join(leaks[:5]))

    if issues:
        print(f"❌ Editorial script gate failed ({len(issues)} issue(s), {len(warnings)} warning(s))", file=sys.stderr)
        for x in issues[:30]: print("  - " + x, file=sys.stderr)
        for x in warnings[:20]: print("  ⚠ " + x, file=sys.stderr)
        return 1

    print(f"✅ Editorial script gate passed: chars={chars}, sentences={len(sentences)}, avg_words={avg:.1f}, max_words={max_words}, hype={total_hype}")
    for x in warnings[:20]: print("  ⚠ " + x)
    return 0


if __name__ == "__main__":
    sys.exit(main())
