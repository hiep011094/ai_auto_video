#!/usr/bin/env python3
"""
word_splitter.py — Splits narration text into scenes at an exact, hard-coded
word count per scene.

PURPOSE
  Word counting must never be delegated to an LLM's "eyeballing" of the text.
  This tool tokenizes on whitespace and counts words with 100% precision, so
  every `voiceover` / `sub` it produces matches the fixed rule defined in
  .agents/04_scene_splitting_rules.md exactly.

BASIC USAGE (short video, or a long video with only one chapter):
  python3 word_splitter.py --input <file.txt> --type short|long --lang vi --output <file.json>

  Text can also be piped in via stdin:
  cat chapter_text.txt | python3 word_splitter.py --type long --lang vi --output chapter_01.json

MULTI-CHAPTER LONG VIDEOS — REQUIRED to keep `sentence_id` / `scene` continuous
across separate `chapter_0X.json` files belonging to the SAME video (see
01_workflow.md, Step 7):
  1. Extract the chapter's text into its own .txt file (or stdin). There is
     NO "--chapter-range" flag to auto-slice chapters inside this tool — the
     agent must cut the chapter's text out of master_script.txt itself before
     calling this tool.
  2. Call the tool with --scene-start and --sentence-start set to the
     NEXT_SCENE_START / NEXT_SENTENCE_START values printed by the previous
     call (the first chapter uses the defaults --scene-start 1
     --sentence-start 1):

     python3 word_splitter.py \
       --input data/.../_chapter_02_raw.txt \
       --type long --lang vi \
       --scene-start 9 --sentence-start 5 \
       --output data/.../chapter_02.json

  The tool prints a final line "NEXT_SCENE_START=<n> NEXT_SENTENCE_START=<n>"
  — the agent MUST save these two values and pass them into the call for the
  next chapter. Never compute or guess these values by hand.

HARD WORD-COUNT RULE (do not change):
  short + vi -> 14 words/scene
  long  + vi -> 20 words/scene

OUTPUT
  A JSON file containing an array of objects, each with:
  scene, voiceover, sub, context_ref, sentence_id, part
  (The agent adds continuity_ref, shot_type, veo_prompt in a later step —
  see .agents/06_veo_prompt_guide.md)

KNOWN BEHAVIOR — NOT A BUG, NO DATA IS LOST:
  Grouping N words per scene runs continuously across the whole text and does
  NOT stop at sentence boundaries (see 04_scene_splitting_rules.md §4, step
  3). Consequence: a very short sentence (e.g. "Indeed.") may end up with no
  scene carrying its own `sentence_id`, because all of its words get
  "absorbed" into a group whose majority of words belong to the sentence
  before or after it. Every word of that short sentence is still fully
  present inside the `voiceover` / `sub` / `context_ref` of the scene that
  contains it — nothing is dropped — it simply doesn't surface as its own
  independent `sentence_id` in the output. The agent must NOT treat this as
  something to "fix" by inserting an extra scene outside the rule; it is an
  unavoidable trade-off of enforcing the hard word-count rule. During QA
  (07_qa_checklist.md, section C) it is enough to confirm the total word
  count matches (the tool already checks this at the end) — every original
  sentence is not required to have at least one scene of its own.

NUMBER HANDLING (sentence-boundary safety):
  Two more false-positive sentence-boundary patterns are also guarded against,
  since a science/space script is full of figures:
  - A period sitting between two digits once surrounding whitespace is
    ignored (e.g. "gấp 8. 3 lần" typed with a stray space) is treated as a
    decimal/thousands separator, never a sentence end.
  - A period immediately preceded by a bare integer (e.g. the "1." in
    "Có 3 giả thuyết: 1. Vụ va chạm thiên thạch...") is treated as a
    numbered-list marker, never a sentence end, and gets merged onto the
    following text.
  Trade-off (same spirit as the short-sentence trade-off documented above):
  a sentence that *genuinely* ends on a bare integer with nothing else
  ("Chúng ta đã tìm thấy 12.") will now merge with the next sentence too,
  since a period after a lone number cannot be told apart from a list
  marker using local context alone. This is intentional — false merges are
  far cheaper than shredding a measurement or a numbered list into
  meaningless one-token fake sentences, and no text is ever lost either way.

ABBREVIATION HANDLING (sentence-boundary safety):
  A period immediately followed by whitespace is normally treated as the end
  of a sentence. This tool additionally recognizes a configurable list of
  common abbreviations (titles such as "Dr.", "Mr.", "Prof.", Vietnamese
  academic titles such as "TS.", "GS.", "ThS.", "PGS.", and generic
  abbreviations like "e.g.", "i.e.", "etc.", "vs.") and does NOT split a
  sentence at those points, since doing so would fracture a person's name
  or a phrase across two fake "sentences" and corrupt `sentence_id` /
  `context_ref`. See ABBREVIATIONS below — extend this list if the channel's
  scripts regularly use an abbreviation that is not yet covered; do not work
  around a missed abbreviation by hand-editing tool output.
"""

import argparse
import json
import re
import sys

WORDS_PER_SCENE = {
    ("short", "vi"): 14,
    ("long", "vi"): 20,
}

# Common abbreviations that end in a period but do NOT mark a sentence
# boundary. Matched case-sensitively against the token immediately
# preceding the period (diacritics-aware for Vietnamese). Extend this set
# if new abbreviations show up regularly in scripts — do not patch around
# a miss by hand-editing the tool's JSON output.
ABBREVIATIONS = {
    # English titles / generic
    "Dr", "Mr", "Mrs", "Ms", "Prof", "Sr", "Jr", "St", "vs",
    "e.g", "i.e", "etc", "approx", "vol", "Vol",
    # Vietnamese academic / honorific titles
    "TS", "GS", "PGS", "ThS", "BS", "KS", "CN", "TT", "ĐH",
    # NOTE: "no"/"No" (as an abbreviation for "number") were deliberately
    # removed from this set. Unlike the other entries, "no" is also an
    # ordinary standalone English word — a sentence that genuinely ends
    # with "...said no." would have been incorrectly merged with the next
    # sentence. If the channel's scripts need "No." as a numbering
    # abbreviation (e.g. "No. 5"), prefer rephrasing to avoid the bare
    # word, rather than re-adding this ambiguous entry.
}

# Sentence-ending punctuation followed by whitespace — candidate split point.
SENTENCE_END_RE = re.compile(r"(?<=[\.\!\?…])\s+")

# Captures the token immediately before a trailing period, so we can check
# it against ABBREVIATIONS. Matches a run of non-space characters ending in
# "." right at the end of the string.
TRAILING_TOKEN_RE = re.compile(r"(\S+)\.$")

# A candidate fragment that is nothing but a bare integer (a numbered-list
# marker like "1." or "12.") — never a real sentence end.
NUMERIC_TOKEN_RE = re.compile(r"^\d+$")


def _ends_with_abbreviation(fragment: str) -> bool:
    """True if `fragment` ends with a period that belongs to a known
    abbreviation rather than a real sentence end."""
    if not fragment.endswith("."):
        return False
    match = TRAILING_TOKEN_RE.search(fragment)
    if not match:
        return False
    token = match.group(1)  # token without the trailing period
    return token in ABBREVIATIONS


def _ends_with_standalone_number(fragment: str) -> bool:
    """True if the token immediately before the trailing period is a bare
    number — e.g. the "1" in a numbered-list marker like "1." inside
    "Có 3 giả thuyết: 1. Vụ va chạm thiên thạch...". Without this check the
    marker gets split off as its own fake one-token "sentence", eating a
    `sentence_id` slot that carries no real visual/narration meaning.
    Checks the trailing token only (like `_ends_with_abbreviation`), not
    the whole fragment, so it also catches a marker that follows a colon
    or other non-terminal punctuation earlier in the same fragment."""
    if not fragment.endswith("."):
        return False
    match = TRAILING_TOKEN_RE.search(fragment)
    if not match:
        return False
    token = match.group(1)
    return NUMERIC_TOKEN_RE.match(token) is not None


def _is_mid_number_period(text: str, period_pos: int) -> bool:
    """True if the period at `period_pos` in `text` sits between two digits
    once surrounding whitespace is ignored — e.g. "nặng gấp 8. 3 lần" (a
    decimal typed with a stray space after the point). A period used as a
    thousands/decimal separator should never be read as a sentence end,
    which matters a lot for a channel whose scripts include numeric references
    ("3.5 tỷ năm", "108 hạt", "2.500 năm trước")."""
    if text[period_pos] != ".":
        return False
    before = text[:period_pos].rstrip()
    after = text[period_pos + 1:].lstrip()
    return bool(before) and bool(after) and before[-1].isdigit() and after[0].isdigit()


def split_sentences(text: str):
    """Split text into a list of sentences, keeping the terminal punctuation
    on each sentence. Skips split points that fall right after a known
    abbreviation (see ABBREVIATIONS)."""
    text = text.strip()
    if not text:
        return []
    # Normalize "..." (3+ dots) to a single "…" so it isn't split 3 times.
    normalized = re.sub(r"\.{3,}", "…", text)

    sentences = []
    pos = 0
    for m in SENTENCE_END_RE.finditer(normalized):
        candidate = normalized[pos:m.start()]
        period_pos = m.start() - 1  # index of the punctuation char itself
        if _ends_with_abbreviation(candidate):
            continue  # not a real sentence boundary — keep accumulating
        if _ends_with_standalone_number(candidate):
            continue  # bare list-marker number ("1.", "2.") — keep accumulating
        if _is_mid_number_period(normalized, period_pos):
            continue  # decimal/thousands separator, not a sentence end
        sentences.append(candidate.strip())
        pos = m.end()
    tail = normalized[pos:].strip()
    if tail:
        sentences.append(tail)

    return [s for s in sentences if s]


def tokenize(sentence: str):
    """Whitespace tokenization — one "word" is one run of non-space
    characters between whitespace."""
    return sentence.split()


def build_scenes(text: str, words_per_scene: int, scene_start: int = 1, sentence_start: int = 1):
    sentences = split_sentences(text)
    if not sentences:
        return [], scene_start, sentence_start

    # Assign each word to the sentence_id it belongs to, preserving the
    # original order of the whole text. sentence_id starts at
    # sentence_start (not always 1) so it stays continuous across the full
    # master_script.txt when this chapter is not the first one.
    word_stream = []  # list of (word, sentence_id)
    sentence_texts = {}
    for offset, sent in enumerate(sentences):
        idx = sentence_start + offset
        sentence_texts[idx] = sent
        for w in tokenize(sent):
            word_stream.append((w, idx))

    total_words = len(word_stream)
    scenes = []
    scene_no = scene_start
    i = 0

    # Step 1: group N words at a time, continuously across the whole text.
    raw_groups = []
    while i < total_words:
        chunk = word_stream[i:i + words_per_scene]
        raw_groups.append(chunk)
        i += words_per_scene

    # Step 2: for each group, determine the majority sentence_id +
    # context_ref, and compute part = this group's position among all
    # groups that share the same majority sentence_id (if one sentence is
    # split across several consecutive groups, part counts them in order).
    group_majority_sid = []
    for chunk in raw_groups:
        sid_counts = {}
        for _, sid in chunk:
            sid_counts[sid] = sid_counts.get(sid, 0) + 1
        majority_sid = max(sid_counts.items(), key=lambda kv: kv[1])[0]
        group_majority_sid.append(majority_sid)

    # INVARIANT the "part = x/N" numbering below relies on: groups sharing
    # the same majority sentence_id must be CONTIGUOUS, i.e.
    # group_majority_sid is non-decreasing. This holds today only because
    # word_stream is built by scanning the text strictly left-to-right, so
    # each chunk's majority sentence_id can only stay the same or advance
    # relative to the previous chunk. This was previously assumed but never
    # checked — if a future change (e.g. splitting/processing paragraphs in
    # parallel, or reordering sentences) breaks this ordering, sid_running_index
    # below would silently produce wrong "part" values instead of erroring.
    for _prev_idx in range(1, len(group_majority_sid)):
        prev_sid, cur_sid = group_majority_sid[_prev_idx - 1], group_majority_sid[_prev_idx]
        assert cur_sid >= prev_sid, (
            f"word_splitter internal invariant broken: sentence_id must be "
            f"non-decreasing across scene groups (got {prev_sid} -> {cur_sid} "
            f"at group index {_prev_idx}). The 'part' (x/N) numbering assumes "
            f"same-sentence groups are contiguous; this ordering changed, so "
            f"part numbering can no longer be trusted without fixing this "
            f"function first."
        )

    # Total number of groups per sentence_id (by majority), used as the "N"
    # in "x/N".
    sid_total_groups = {}
    for sid in group_majority_sid:
        sid_total_groups[sid] = sid_total_groups.get(sid, 0) + 1

    sid_running_index = {}
    for chunk, majority_sid in zip(raw_groups, group_majority_sid):
        words_in_chunk = [w for w, _ in chunk]
        sids_in_chunk = sorted(set(sid for _, sid in chunk))

        sid_running_index[majority_sid] = sid_running_index.get(majority_sid, 0) + 1
        part_str = f"{sid_running_index[majority_sid]}/{sid_total_groups[majority_sid]}"

        if len(sids_in_chunk) == 1:
            context_ref = sentence_texts[sids_in_chunk[0]]
        else:
            # Group straddles a sentence boundary -> join the related
            # sentences to form context_ref.
            context_ref = " ".join(sentence_texts[s] for s in sids_in_chunk)

        voiceover = " ".join(words_in_chunk)

        scenes.append({
            "scene": scene_no,
            "voiceover": voiceover,
            "sub": voiceover,
            "context_ref": context_ref,
            "sentence_id": majority_sid,
            "part": part_str,
        })
        scene_no += 1

    next_scene_start = scene_no
    next_sentence_start = max(sentence_texts.keys()) + 1
    return scenes, next_scene_start, next_sentence_start


def main():
    parser = argparse.ArgumentParser(description="Split narration text into scenes at an exact word count.")
    parser.add_argument("--input", help="Path to the input text file. Reads from stdin if omitted.")
    parser.add_argument("--type", required=True, choices=["short", "long"], help="Video type")
    parser.add_argument("--lang", required=True, choices=["vi"], help="Language")
    parser.add_argument("--output", required=True, help="Path to the output JSON file")
    parser.add_argument(
        "--scene-start", type=int, default=1,
        help="Starting scene number (default 1). For chapter 2 onward of the "
             "same video, pass the NEXT_SCENE_START value printed by the call "
             "for the previous chapter.",
    )
    parser.add_argument(
        "--sentence-start", type=int, default=1,
        help="Starting original sentence number (default 1), so sentence_id "
             "stays correctly positioned within the full master_script.txt. "
             "For chapter 2 onward, pass the NEXT_SENTENCE_START value "
             "printed by the call for the previous chapter.",
    )
    args = parser.parse_args()

    if args.scene_start < 1 or args.sentence_start < 1:
        print("ERROR: --scene-start and --sentence-start must be >= 1.", file=sys.stderr)
        sys.exit(2)

    if args.input:
        with open(args.input, "r", encoding="utf-8") as f:
            text = f.read()
    else:
        text = sys.stdin.read()

    words_per_scene = WORDS_PER_SCENE[(args.type, args.lang)]
    scenes, next_scene_start, next_sentence_start = build_scenes(
        text, words_per_scene, scene_start=args.scene_start, sentence_start=args.sentence_start
    )

    if not scenes:
        print("ERROR: no content to split (empty input).", file=sys.stderr)
        sys.exit(1)

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(scenes, f, ensure_ascii=False, indent=2)

    # Automatic check: total output word count must match total input word count.
    total_input_words = sum(len(tokenize(s)) for s in split_sentences(text))
    total_output_words = sum(len(tokenize(s["voiceover"])) for s in scenes)
    if total_input_words != total_output_words:
        print(
            f"WARNING: word count mismatch — input={total_input_words}, output={total_output_words}. "
            "Re-check the input text.",
            file=sys.stderr,
        )
        sys.exit(2)

    print(f"OK: generated {len(scenes)} scene(s), written to {args.output}")
    print(f"NEXT_SCENE_START={next_scene_start} NEXT_SENTENCE_START={next_sentence_start}")


if __name__ == "__main__":
    main()
