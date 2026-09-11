# 04 — Scene Splitting Rules

## 1. Hard rule table — DO NOT CHANGE

| `videoType` | `language` | Words / scene |
|---|---|---|
| `short` | `vi` | 14 |
| `short` | `en` | 10 |
| `long` | `vi` | 20 |
| `long` | `en` | 15 |

This is an **absolute, hard** number. Never round, never approximate, never
"close enough." Only the final scene of a chapter/text block may have **fewer**
words than the rule specifies (the remaining tokens), but never **more**. A
sentence boundary by itself does not create a short scene: splitting continues
across sentence boundaries until the hard scene word target is reached.

## 2. Why a tool is required instead of counting by hand

An LLM counting words by eye or by linguistic inference is prone to being
off by ±1–2 words, especially in Vietnamese (compound-word boundaries easily
blur the line between "syllable" and "word"). This error compounds across
dozens of scenes and breaks TTS/subtitle synchronization. For this reason:
**always use `tools/word_splitter.py`** to do the splitting — never hand-write
`voiceover`/`sub`.

> Word-counting convention: a "word" = one run of characters separated by
> whitespace (whitespace tokenization). This is the single counting unit
> used for both Vietnamese and English across the whole system, and matches
> exactly how `word_splitter.py` processes text.

## 3. How to use `tools/word_splitter.py`

```bash
python3 .agents/tools/word_splitter.py \
  --input <path-to-the-text-to-split> \
  --type short|long \
  --lang vi|en \
  --output <path-to-the-output-json-file>
```

### 3.1. Multi-chapter Long videos — REQUIRED: carry `sentence_id`/`scene` forward across chapters

`sentence_id` must equal the "original sentence's ordinal position in the
master narration" — meaning across the **entire** `master_script.txt`, not
just the text of a single chapter. Since `word_splitter.py` only accepts one
block of text per call, the agent must hand off the running numbers itself
via `--scene-start`/`--sentence-start`:

1. Chapter 1: extract chapter 1's text into a temporary file (e.g.
   `data/.agent_runtime/_chapter_01_raw.txt`), call the tool **without** passing
   `--scene-start`/`--sentence-start` (both default to 1).
2. The tool prints a final line of the form
   `NEXT_SCENE_START=<n> NEXT_SENTENCE_START=<n>` — save these two numbers.
3. Chapter 2: extract chapter 2's text, call the tool with
   `--scene-start <the previous call's NEXT_SCENE_START>` and
   `--sentence-start <the previous call's NEXT_SENTENCE_START>`.
4. Repeat for every remaining chapter, always using the
   `NEXT_SCENE_START`/`NEXT_SENTENCE_START` printed by the call immediately
   before it — never compute or guess these numbers by hand.
5. **CLEANUP**: Delete all `_chapter_*_raw.txt` temporary files after all
   chapters have been successfully processed and validated.

**There is no `--chapter-range` parameter** in this tool — the agent must cut
the text corresponding to each chapter's boundary (as determined in Step 5
of `01_workflow.md`) into its own file/text block before calling `--input`.

Input: a plain-text file (or the text of a single chapter, extracted from
`master_script.txt`).
Output: a JSON file that is an **array of objects**, each already containing:
`scene`, `voiceover`, `sub` (same as `voiceover`, punctuation can be tuned
for TTS if needed), `context_ref`, `sentence_id`, `part`.

The agent only needs to **add** the 3 remaining fields (`continuity_ref`,
`shot_type`, `veo_prompt`) to each object, after the tool has generated the
first 6 fields.

## 4. Algorithm logic (reference — already implemented in the tool)

1. Split `master_script.txt`/the text block into sentences (based on `.`,
   `!`, `?`, `…`), numbering `sentence_id` sequentially from 1. A configured
   list of common abbreviations (e.g. "Dr.", "Prof.", Vietnamese titles like
   "TS.", "GS.") is excluded from splitting, so a scientist's name or title
   is never fractured into a fake extra sentence — see §7 below.
2. For each sentence, split it into a list of words (whitespace
   tokenization).
3. Group words **continuously across the whole text** into chunks of
   exactly N words (per the table in Section 1) — this grouping does **not**
   stop at sentence boundaries; a scene may contain the tail of one sentence
   plus the start of the next if that's where the cut falls.
4. For each N-word group, determine which sentence(s) it belongs to → assign
   `sentence_id` (if a group straddles 2 sentences, assign the sentence that
   contributes the **majority** of words in that group, and `context_ref`
   must join both related sentences).
5. Determine `part` = this group's position among the total number of
   groups that share the same `sentence_id` (e.g. a sentence split across 3
   scenes → `1/3`, `2/3`, `3/3`).
6. `context_ref` = the verbatim original sentence (or 2 sentences, if the
   group straddles a sentence boundary).

## 5. Checks to run after running the tool

After getting the JSON file from `word_splitter.py`, confirm:
- The sum of the word counts of every `voiceover` equals the total word
  count of the source text (no words lost or duplicated) — the tool checks
  this itself and fails (exit code 2) on a mismatch; the agent does not need
  to recount by hand.
- No scene exceeds the required word count.
- The `sentence_id` values that do appear in the output increase in a
  sensible order matching the source text, with no gaps **among the
  `sentence_id`s that do appear** (see the note in Section 6 — not every
  original `sentence_id` is guaranteed to appear).
- The `part` values for scenes sharing a `sentence_id` are sequential and in
  the right order (`1/3` → `2/3` → `3/3`, with no gaps **among the parts
  actually assigned** to that `sentence_id`).

## 6. Known behavior: a short sentence may not get its own `sentence_id` *(read carefully — this is not lost data)*

Because grouping N words per scene runs continuously through the text and
**does not stop at sentence boundaries** (Section 4, step 3), a very short
sentence (e.g. Vietnamese: "Thật vậy." — 2 words) can end up entirely inside
a group where the majority of words belong to the sentence before or after
it. When that happens:

- That short sentence **has no scene carrying its own `sentence_id`** in
  `chapter_0X.json`.
- But **every word of that sentence is still fully intact** inside the
  `voiceover`/`sub`/`context_ref` of the scene that contains it — nothing is
  deleted or skipped.

→ This is an unavoidable trade-off of strictly enforcing the word-count-per-
scene rule (Section 1), **not a bug to fix**. The agent must never:
- Add an extra scene outside the rule just so that short sentence gets its
  own `sentence_id` (this violates the hard word-count rule).
- Treat this as a sign the source text is broken and rewrite
  `master_script.txt` on its own.

When writing `veo_prompt` (see `06_veo_prompt_guide.md`), if a scene's
`context_ref` merges 2 sentences (e.g. a short sentence plus its neighbor),
treat the joined text as the **semantic envelope**, but use the actual
`voiceover` words as the current timing beat. Do not invent an extra scene
for the short sentence, and do not visualize every detail from both full
sentences at once. The current shot should depict the meaning active in this
chunk while preserving the joined context needed to resolve references.

## 7. Known behavior: abbreviations never end a sentence

Titles and abbreviations that are followed by a period — English ones like
"Dr.", "Mr.", "Prof.", "e.g.", "i.e.", "etc.", and Vietnamese academic
titles like "TS.", "GS.", "ThS.", "PGS." — are recognized by the tool and
never treated as the end of a sentence, so a scientist's name (e.g. "TS.
Nguyễn Văn A", "Dr. Elias Voss" — both fictional example names, per the
"no real named person" rule in `12_veo_policy_compliance.md §2.1`) is never
fractured into a nonsensical one-word "sentence." If the channel's scripts regularly use an abbreviation
that is not yet recognized, extend the `ABBREVIATIONS` set at the top of
`tools/word_splitter.py` — never work around a miss by hand-editing the
tool's JSON output, since that would silently break the "generated only by
the tool" guarantee this whole rule set depends on.

## 8. Known behavior: numbers never end a sentence either

Because this channel's scripts (Buddhist dharma/history/philosophy) are dense with
figures, the tool also protects two number-related patterns from being
misread as a sentence end:

- A period between two digits, ignoring surrounding whitespace (e.g. "gấp
  8. 3 lần" typed with a stray space) — treated as a decimal/thousands
  separator.
- A period right after a bare integer (e.g. "1." in "Có 3 giả thuyết: 1.
  Vụ va chạm thiên thạch...") — treated as a numbered-list marker and
  merged onto the following text.

**Trade-off, same spirit as Section 6:** a sentence that genuinely ends on
a bare integer with nothing else ("Chúng ta đã tìm thấy 12.") will now
merge with whatever follows, since a period after a lone number can't be
told apart from a list marker using local context alone. This is
intentional. No text is ever lost — the number and everything after it are
still fully present inside the merged scene's `voiceover`/`sub`/
`context_ref`. Prefer phrasing that doesn't end a sentence on a bare
number in `master_script.txt` if this distinction matters for a specific
scene.
