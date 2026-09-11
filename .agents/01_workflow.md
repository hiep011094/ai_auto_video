# 01 — Task Processing Workflow

Execute the steps below in order — do not reorder, do not skip any step.
After each step, confirm the output file has been written to the correct
location before moving to the next step.

## Step 1 — Read `queue.json`

Read it and validate the **6 required base parameters** plus conditional/optional fields exactly as defined by `schemas/queue.schema.json`:

| Parameter | Valid values |
|---|---|
| `videoType` | `short` \| `long` |
| `generationMethod` | `auto` \| `manual` |
| `topic` | text string; required only when `generationMethod=manual` |
| `language` | `vi` |
| `mode` | `1` (Chiêm nghiệm/Suy ngẫm) \| `2` (Kiến thức/Lịch sử) |
| `voiceStyle` | `contemplative` (paired with `language=vi`) |
| `aiModel` | `agy` \| `codex` |
| `category` | optional manual override: `buddhist_life` \| `buddhist_wisdom`; auto mode normally leaves it unset |

Validate the file against `schemas/queue.schema.json` with
`tools/schema_validator.py` before proceeding. If any parameter is missing
or has the wrong type/value → stop and handle it per Section 3 of
`AGENTS.md`.

## Step 2 — Determine the topic

- `generationMethod = auto`:

  **Step 2.1 — Choose category (mandatory, strict 2-category alternation hard rule: the ACTIVE category
  used by the previous ACTIVE video is locked; the next session must use the other ACTIVE category — see `10_category_rotation.md`):**
  ```bash
  python3 .agents/tools/category_selector.py \
      --history database/history.json \
      --output-json
  ```
  Output: `{"selected_category": "buddhist_wisdom", "reason": "..."}`.
  The selector derives its lock state only from `database/history.json`; do not
  override `selected_category` in auto mode based on trend strength or balance.
  This `category` value is later required when writing the
  `database/history.json` entry in Step 11 (see `03_data_schemas.md §1` and
  `schemas/history.schema.json`).

  **Step 2.2 — Find a genuinely current, strong topic *within that category*:**
  1. Search YouTube inside the chosen category using the category-specific
     keyword sets in `10_category_rotation.md §3.2`, but do **not** equate
     "high total views" with "hot now." Prefer recent evidence windows
     (roughly 7/30/90 days depending on the topic) and compare publication
     age, repeated coverage by independent creators/outlets, and apparent
     view/engagement velocity when those signals are available. **When the
     channel's YouTube Studio Trends data is accessible, prefer its recent
     Top searches, Breakout videos, Recent videos, audience-interest, and
     Content-gap signals as audience-specific evidence** rather than relying
     on a generic platform-wide "Trending" list.
  2. Cross-check the underlying event/discovery with current web/primary or
     authoritative sources when the candidate depends on a recent claim.
     An old discovery that has merely resurfaced must not be narrated as a
     new event.
  3. Build an internal pool of **8–12 candidate angles** before choosing one.
     Record the evidence in the **runtime-only** file
     `data/.agent_runtime/_topic_research.json` using
     `schemas/topic_research.schema.json`. This does **not** change any final
     output schema and must never be copied into the final video folder. For
     every candidate record freshness/recent catalyst, audience momentum,
     visual richness for Veo, factual/source strength, novelty versus
     `history.json`, category fit, and the URLs/dates/signals that support the
     assessment. Reject pure rumor/clickbait, broad textbook topics with no
     fresh angle, and topics whose core claim cannot be responsibly verified.
     Before selection, validate the ledger, then run its evidence gate:
     ```bash
     python3 .agents/tools/schema_validator.py \
       --schema .agents/schemas/topic_research.schema.json \
       --file data/.agent_runtime/_topic_research.json

     python3 .agents/tools/topic_research_gate.py \
       --file data/.agent_runtime/_topic_research.json \
       --verify-sources --verify-content \
       --ai-model <agy|codex> \
       --verification-cache data/.agent_runtime/_source_verification_cache.json \
       --content-receipt data/.agent_runtime/_topic_evidence_content_receipt.json
     ```
     A topic is not allowed to be called "hot" merely because an old video has
     high lifetime views. If the best choice is evergreen, label it evergreen
     and state the fresh angle/catalyst instead of fabricating trend momentum.
  4. For `mode = "2"`, require a verifiable factual/historical basis before selection.
      For `mode = "1"`, a contemplative/philosophical topic is acceptable, but
      the final angle must clearly identify what is established teaching versus
      personal interpretation.
   5. Generate the candidate topic as a **specific angle/question**, not only
      a broad noun phrase (e.g. not merely "vô thường," but the exact
      teaching, story, paradox, or life lesson the video will explore).

  **Step 2.3 — Check topic uniqueness** (MANDATORY, **global-first** keyword +
  multi-signal scan + AI semantic check across the whole history; same-lane
  (`language` + `videoType`), plus a stricter same-category deep pass when
  `--category` is supplied). A category change must never be used to make the
  same viewer experience appear "unique":
     ```bash
     # Comprehensive global-first check + same-lane fatigue + same-category deep pass
     python3 .agents/tools/check_topic_duplicate.py \
         --new-topic "<candidate_topic>" \
         --history database/history.json \
         --language vi \
         --video-type <short|long> \
         --category <selected_category> \
         --ai-model <agy|codex>  # use queue.json aiModel
     
     # Fast keyword-only check (use when AI unavailable)
     python3 .agents/tools/topic_uniqueness_checker.py \
         --new-topic "<candidate_topic>" \
         --history database/history.json \
         --language vi \
         --video-type <short|long>
     ```
     **V9 global rule:** duplicate protection scans the entire history across
     languages and video types first. A translation or Short/Long conversion
     can still be a duplicate of the same core viewer experience. Same-lane
     and same-category checks remain secondary fatigue/depth signals.

     **Exit codes:**
     - Exit 0 (unique, AI-confirmed): Proceed to Step 3 ✅
     - Exit 1 (duplicate): Apply alternative angle from AI suggestions → re-check ⚠️
     - Exit 2 (warning, including "AI check did not actually run" — see
       `combined_analysis.verdict: "AI_CHECK_DID_NOT_RUN"` in the JSON
       output): borderline or AI-unavailable case. Do **not** treat this the
       same as exit 0 — read `combined_analysis.reasoning` and proceed
       manually with caution, or adjust the topic slightly ⚠️
     - Exit 3 from `ai_semantic_checker.py` directly (if called standalone):
       the AI check itself did not run (call failed, or `--ai-model manual`)

     **Important:** `--category` adds a same-category deep pass; it no longer
     filters away history entries from other categories. The global pass always runs across the whole history first.

     **Why AI reasoning matters:**
     - Detects semantic duplicates (e.g., "Extreme planet A" after "Extreme planet B, C, D")
     - Catches title-differs-but-content-same cases (e.g., different title about the same Lake Vostok)
     - Catches pattern repetition (e.g., same "If X happens" format)
     - Evaluates viewer fatigue (too many similar topics recently)
     
  **Step 2.4 — If duplicate → apply suggested alternative angle → re-check
  (max 3 iterations), staying within the same category.**

  **Step 2.5 — Read `database/history.json` to pick a hook pattern**
  different from recent `last_hook_pattern` values (see
  `08_hook_patterns.md §How to use it`).

- `generationMethod = manual`: use `topic` from `queue.json` directly — **no
  need** to compare against `history.json` (but optional check recommended to
  warn user if duplicate detected). If `queue.json` includes a `category`
  field, use it as-is even if it repeats the previous video's category (see
  `10_category_rotation.md §9`, "manual mode allows this" — just note the
  repetition to the user). If `queue.json` has no `category`, classify the
  topic manually into one of the 2 ACTIVE categories in `10_category_rotation.md §1`
  before writing the `database/history.json` entry.



### Step 2.6 — Claim Evidence Lock (runtime-only; required before final script)

Before finalizing `master_script.txt`, extract all material claims that could mislead the viewer if overstated: named institutions/organizations, exact dates/numbers, causal mechanisms, historical reconstructions, "no evidence found" conclusions, and the central doctrinal, historical, or factual claims. Follow `14_claim_evidence_lock.md`.

Create `data/.agent_runtime/_claim_evidence.json`, validate and gate it:

```bash
python3 .agents/tools/schema_validator.py \
  --schema .agents/schemas/claim_evidence.schema.json \
  --file data/.agent_runtime/_claim_evidence.json

python3 .agents/tools/claim_evidence_gate.py \
  --file data/.agent_runtime/_claim_evidence.json \
  --mode <1|2> \
  --verify-sources --verify-content \
  --ai-model <agy|codex> \
  --verification-cache data/.agent_runtime/_source_verification_cache.json \
  --content-receipt data/.agent_runtime/_claim_evidence_content_receipt.json
```

For `mode=2`, this gate is mandatory and blocking. For `mode=1`, it is blocking for any factual high-risk claim listed above while purely hypothetical story claims remain explicitly speculative. The eventual script must not use wording stronger than each ledger entry's `allowed_wording`; later Veo scenes must not visually claim more than `visual_rule` permits.



### V9 source-truth + content-support checkpoint

The production source/content gate above is intentionally run **before** the duplicate AI check so fabricated/unsafe evidence fails early. Do not run it a second time in the same unchanged task. The `_topic_evidence_content_receipt.json` is runtime evidence that the exact ledger version was content-checked; if the topic ledger changes, rerun the gate and replace the receipt before continuing.

## Step 3 — Write the script and master narration

See `02_content_style.md` for the full style guidance (reference `references/buddhist_glossary.md` for standard terminology and `references/canonical_texts_reference.md` for sutra attribution). Hard constraints:

| Type | Master narration character-length limit | Content-flow requirement |
|---|---|---|
| `short` | 900–1,200 characters | Tight, condensed summary; fast pacing; hooks the viewer from the first line |
| `long` | **Strictly >60,000 characters; no maximum** (recommended production target **65,000+**) | Must be as detailed as the topic truthfully requires: complete context, doctrine/source provenance, explanations, stories/examples, nuance, practical application, synthesis, and coherent retention. The 60k floor is mandatory, but never satisfy it with repetition/filler; broaden or reselect a topic that can genuinely support this depth. |

### Long-form completeness rule — mandatory

For `videoType=long`, the master narration must be **strictly more than 60,000 Unicode characters**. Treat **65,000+ characters** as the normal production target so small editing/TTS changes do not accidentally drop the final script below the floor. There is **no maximum script length or runtime ceiling**: 70,000, 100,000, 150,000+ characters are all valid when the subject genuinely requires them. Keep expanding only while each section adds new understanding, evidence, doctrinal context, narrative value, practical application, or a necessary bridge. If a chosen topic/angle cannot honestly sustain >60,000 useful characters, broaden/reframe/reselect it; **never** cross the floor by repeating quotations, morals, definitions, rhetorical questions, or generic meditation language.

A LONG script is complete only when it has covered, where relevant:

1. the viewer's central question and why it matters;
2. the Buddhist teaching/story with accurate source or tradition provenance;
3. historical/canonical context needed to avoid misleading simplification;
4. the meaning of key Pali/Sanskrit/Vietnamese Buddhist terms in plain Vietnamese;
5. the reasoning or causal/psychological mechanism behind the teaching;
6. one or more concrete stories/examples that illuminate rather than merely decorate;
7. distinctions between canonical teaching, later commentary, tradition-specific interpretation, folk belief, and modern application;
8. important nuances, limitations, common misunderstandings, and competing interpretations when materially relevant;
9. practical application in contemporary daily life;
10. a synthesis/payoff that resolves the opening promise without repeating earlier paragraphs.

Do **not** compress a LONG topic below the mandatory >60,000-character floor, and do **not** add filler, duplicated quotations, repetitive moralizing, or generic meditation language merely to clear that floor. There is no upper limit. The standard is **at least 60,001 useful characters, preferably 65,000+, with maximum useful depth and zero avoidable padding**.

Pick one of the 5 opening patterns from `08_hook_patterns.md` for the
opening line/passage. When `generationMethod = auto`, prefer a pattern
different from the most recent `last_hook_pattern` values in
`database/history.json` (see the full selection logic in
`08_hook_patterns.md §How to use it`).

Before final prose, create the runtime **Editorial Message Lock** from
`17_editorial_message_lock.md` at
`data/.agent_runtime/_editorial_message_lock.json`. Validate it against
`schemas/editorial_message_lock.schema.json`, then run the preflight:

```bash
python3 .agents/tools/editorial_script_gate.py \
  --lock data/.agent_runtime/_editorial_message_lock.json \
  --video-type <short|long> --language vi --mode <1|2>
```

This stays **inside Step 3**; it is not a new pipeline step and adds no field to
any canonical final-output schema.

Then apply the full **script quality gate** in `02_content_style.md`: the hook
must promise a real payoff; the listener must receive the complete chain of
meaning (WHAT → HOW/WHY → HOW WE KNOW → WHY IT MATTERS where relevant); every
paragraph must advance the same central investigation; claim strength must
match evidence; and the narration must remain visually translatable. Long
videos should contain deliberate reveal/evidence blocks, relevant limitations,
and a closing synthesis that resolves the opening promise and leaves the
single `core_message` in the listener's mind. Write for spoken cadence rather
than dense prose; avoid sustained 45+ word sentences and repeated hype words.

Write to: `data/[video_long|video_short]/[title-slug]/master_script.txt`
(plain text, UTF-8, no markdown).

**Post-script editorial gate (same Step 3; blocking):**

```bash
python3 .agents/tools/editorial_script_gate.py \
  --lock data/.agent_runtime/_editorial_message_lock.json \
  --script data/[video_long|video_short]/[title-slug]/master_script.txt \
  --video-type <short|long> --language vi --mode <1|2>
```

If it fails, revise the narration before chapter/scene splitting. The tool is a
deterministic floor for message coverage, spoken cadence, hype/repetition and
common overstatement signatures.

Then run the **independent semantic editorial gate** once on the final script:

```bash
python3 .agents/tools/editorial_semantic_checker.py \
  --lock data/.agent_runtime/_editorial_message_lock.json \
  --script data/[video_long|video_short]/[title-slug]/master_script.txt \
  --video-type <short|long> --language vi --mode <1|2> \
  --ai-model <agy|codex> \
  --receipt data/.agent_runtime/_editorial_semantic_receipt.json
```

This judge evaluates payoff, narrative progression, revelation quality, spoken
naturalness, redundancy/padding, epistemic discipline, visual translatability
and ending synthesis. It is independent from the writing pass and is blocking.
The hash-bound receipt is reused by final QA, so the full script is not sent to
AI a second time unless the script or editorial lock changes.

**Post-script evidence coverage gate (same Step 3; no new workflow step):** after the final script is written, re-run the runtime evidence gate against the actual script so a valid but incomplete ledger cannot pass silently:

```bash
python3 .agents/tools/claim_evidence_gate.py \
  --file data/.agent_runtime/_claim_evidence.json \
  --mode <1|2> \
  --script data/[video_long|video_short]/[title-slug]/master_script.txt \
  --require-content-receipt data/.agent_runtime/_claim_evidence_content_receipt.json
```

This second pass is blocking whenever the Claim Evidence Lock applies. It checks deterministic material-claim coverage, rejected-claim leakage, epistemic wording, and verifies that the earlier content-support receipt still matches the exact current claim-ledger hash. It therefore avoids re-fetching/re-spending AI when the evidence ledger has not changed.

## Step 4 — Write `metadata.json`

Write `title`; leave `description` and `keywords` empty. Full schema:
`03_data_schemas.md §2`. Start from `templates/metadata_template.json`.

## Step 5 — Split into chapters

- `videoType = short` → exactly 1 chapter: `chapter_01.json`
- `videoType = long` → analyze `master_script.txt` and split it by content
  flow (each chapter is one complete, self-contained idea — never cut a
  chapter in the middle of an argument) → `chapter_01.json` …
  `chapter_[n].json`

## Step 6 — Create `visual_bible.json`

**Must be done before splitting into scenes or writing any veo_prompt.** See
the full guide in `05_visual_bible_guide.md` and color palettes in `references/color_palette_system.md`. This file is created **exactly
once for the whole video** and is shared by every chapter/scene. Write
`story_anchor` first (2–4 sentences summarizing the video's whole
throughline) — this is what every later `veo_prompt` re-checks itself
against to stay on-topic, without needing to re-read the entire
`master_script.txt` per scene.

## Step 7 — Split each chapter into scenes

For a Short video (a single chapter), extract the full text of
`master_script.txt` and run:

```
python3 .agents/tools/word_splitter.py \
  --input data/.../master_script.txt \
  --type <short|long> \
  --lang vi \
  --output data/.../chapter_01.json
```

For a Long video with multiple chapters, the agent must cut the text
corresponding to each chapter out into temporary files in
`data/.agent_runtime/`, then call the tool sequentially for each chapter,
**carrying `--scene-start`/`--sentence-start` forward between calls** exactly
as described in `04_scene_splitting_rules.md §3.1` (use the
`NEXT_SCENE_START`/`NEXT_SENTENCE_START` values printed by the previous
call). Skipping this hand-off will reset `sentence_id` back to 1 at the
start of every chapter, which breaks the definition of "the original
sentence's ordinal position across the whole master narration."

The tool automatically fills in `scene`, `voiceover`, `sub`, `context_ref`,
`sentence_id`, `part` per the hard rule. **Never hand-count words or fill in
these fields by LLM inference.** Details: `04_scene_splitting_rules.md`.

**IMPORTANT**: After all chapters are processed and validated, delete all
temporary `_chapter_*_raw.txt` files from `data/.agent_runtime/`.

## Step 8 — Write `veo_prompt` for each scene

**Regeneration note (does not add/reorder a workflow step):** if Veo generation is run again after Step 8 data already exists, first execute `tools/veo_regeneration_prepare.py --folder <folder> --type <short|long> --lang vi`. A rerun is a full six-field rebuild: `context_ref`, `sentence_id`, `part`, `continuity_ref`, `shot_type`, and `veo_prompt`. The preparation tool deterministically reconstructs the first three, removes the last three, and invalidates old Veo checkpoint/semantic-receipt/merged-prompt state before regeneration restarts from Scene 1.


For every scene in `chapter_0X.json`, add the fields `continuity_ref`,
`shot_type`, `veo_prompt` per the principles in `06_veo_prompt_guide.md` and `references/camera_variety_guide.md` (for camera movement variety and anti-repetition rules).
Always cross-reference `visual_bible.json` (including `story_anchor`) while
writing — never re-derive character/location wording from memory.

Non-negotiable format rules for every `veo_prompt` (full detail:
`06_veo_prompt_guide.md §0`):
- Written **entirely in English**, even when `language: vi`.
- Build the visual beat from **all four scene-local fields together**:
  `voiceover` = what is being spoken during this clip, `context_ref` = full
  semantic meaning, `sentence_id` = source-sentence anchor, `part` = current
  progression within that sentence. The prompt must depict the current beat
  and must not reveal later parts early or repeat the same generic visual
  across all parts of one sentence.
- **Never mentions audio/sound/dialogue in any form** — no `Audio:` clause,
  no "silent"/"no dialogue"/"no music," and no description of a character
  speaking as a sound event. This is the project's visual-only prompt
  contract because voiceover narration is added separately via TTS during
  editing; it is not a limitation of Veo's audio capabilities.
- **Production range: 900–4,000 Unicode characters per `veo_prompt`, with at least 800 characters of positive visual direction before `Negative:`**; the Negative boilerplate does not count toward the detail floor and 4,000 is the hard ceiling. Use concrete detail efficiently; aim near 900–1500 chars when sufficient and compress redundant
  wording before removing required continuity/identity/camera/lighting/
  safety information (see `06_veo_prompt_guide.md §7`).
- Describes **one continuous shot fitting a single Veo 3.1 generation**
  (4, 6, or 8 seconds) — no internal transitions, no multiple actions.
- Uses the expanded cinematic camera/lens/lighting vocabulary in
  `06_veo_prompt_guide.md §2.9`, varied deliberately scene to scene.
- On multi-chapter Long videos, follows the anti-drift protocol in
  `06_veo_prompt_guide.md §0.5` — re-open `visual_bible.json` and
  `story_anchor` every chapter rather than working from memory.

### Step 8.1 — Mandatory scene micro-batches (anti-laziness / anti-drift)

Do **not** write all scenes in one uninterrupted pass. Process scenes in contiguous
batches of **6 by default (maximum 8)**. For each batch:

1. Re-open `visual_bible.json`, the current chapter's relevant narration, the previous 2 scenes, and the current batch's `voiceover/context_ref/sentence_id/part`.
2. Apply `Semantic Lock` (`06_veo_prompt_guide.md §0.4`) for each scene before writing the prompt.
3. Write full production-detail prompts. Do not create placeholders for future batches.
4. Run the deterministic batch gate and write the resumable checkpoint:
   ```bash
   python3 .agents/tools/veo_batch_guard.py \
     --folder data/[video_long|video_short]/[title-slug] \
     --start <first_scene> --end <last_scene> --checkpoint
   ```
5. Run semantic QA on that exact batch:
   ```bash
   python3 .agents/tools/scene_semantic_checker.py \
     --folder data/[video_long|video_short]/[title-slug] \
     --ai-model <agy|codex> \
     --scene-start <first_scene> --scene-end <last_scene>
   ```
6. Fix every blocking issue and rerun both gates. **Only after both pass may the next batch begin.**

If the job is interrupted or the agent context becomes long, read the checkpoint file in
`data/.agent_runtime/_veo_progress_<slug>.json`, reopen the source-of-truth files, and
resume from `last_completed_scene + 1`. Never continue from memory. Full protocol:
`13_long_job_quality_guard.md`.

## Step 9 — Validate schemas

Run `tools/schema_validator.py` against **every** JSON file written in this
task (`metadata.json`, every `chapter_0X.json`, `visual_bible.json`). Fix any
errors and re-run until it passes.

## Step 10 — QA checklist

First run the deterministic automated checks:
```bash
python3 .agents/tools/qa_automation.py \
  --folder data/[video_long|video_short]/[title-slug] \
  --lang vi \
  --mode <1|2>
```
Fix anything it reports (exit code 1 = checks failed, 2 = system error) and
re-run until it exits 0. This now hard-checks exact output schemas, word-count
integrity, `part=x/N`, aspect ratio, canonical visual-bible anchors when an
entity is named, full Negative-list reuse, scene numbering/continuity format,
the 900–4,000 total-character production range with >=800 positive visual characters before Negative, global film-look anchor, duplicate-anchor prevention, exact-prompt duplicate blocking, and core cinematic detail contract.

Batch-scoped semantic QA has already produced hash-bound PASS receipts. `qa_automation.py` verifies that every final scene is covered by a current receipt. **Do not rerun the whole video through AI a second time when receipt coverage is current.** Rerun `scene_semantic_checker.py` only for stale/changed/failed ranges. Legacy full-pass command (diagnostic only):
```bash
python3 .agents/tools/scene_semantic_checker.py \
  --folder data/[video_long|video_short]/[title-slug] \
  --ai-model <agy|codex>
```
If this diagnostic command is used: exit 0 = semantic QA passed; exit 1 = fix blocking scenes; exit 3 = AI did not produce usable review after bounded retry and is NOT PASS. Normal V9 completion relies on current batch receipts verified by final deterministic QA, avoiding duplicate AI spend.

## Step 11 — Update `database/history.json`

Append one new entry matching the schema in `03_data_schemas.md §1` /
`schemas/history.schema.json`, including the `category` chosen in Step 2.1
(auto mode) or determined in Step 2 (manual mode), with
`youtube_status: "pending"` and `capcut_created: false`. This is the
**final** step of the task — only perform it after Steps 9 and 10 have both
fully passed.

### Writing `main_video_content` (hard rule)

`main_video_content` is the **PRIMARY signal** for the anti-duplication
system. It MUST be a 2–3 sentence summary (≥80 characters) of the video's
actual script content. **It MUST NOT be a copy of the title.**

1. Read the completed `master_script.txt`
2. Write 2–3 sentences describing:
   - The specific subject/phenomenon (use proper nouns when applicable)
   - The angle/question the video answers
   - The key facts, discoveries, or hypotheses covered
3. The title is designed to attract clicks; `main_video_content` is designed
   to **uniquely identify the video's content** for future duplicate checks.
   A lazy title copy drastically weakens duplicate detection.

**Good example:**
```json
"main_video_content": "Khám phá Hồ Vostok dưới 4km băng Nam Cực — hệ sinh thái biệt lập 15 triệu năm, phát hiện vi khuẩn cổ đại trong mẫu lõi băng, và câu hỏi về sự sống ngoài Trái Đất trên Europa/Enceladus."
```

**Bad example (REJECTED by schema):**
```json
"main_video_content": "Hồ Vostok: Sự Sống Dưới Bốn Ki-lô-mét Băng?"
```

After the history entry is safely appended, delete the
runtime-only `data/.agent_runtime/_topic_research.json` (if auto mode) and
any remaining `_chapter_*_raw.txt` files, and the runtime `_veo_progress_<slug>.json` checkpoint and `_veo_semantic_receipts_<slug>.json` semantic receipt ledger; these audit/work files are not part
of the final video output.

### V9 strict-scene hard scene chain

For every micro-batch, use this exact order and do not reorder/skip it:

```bash
python3 .agents/tools/veo_batch_guard.py --folder <video-folder> --start <S> --end <E> --checkpoint
python3 .agents/tools/scene_semantic_checker.py --folder <video-folder> --ai-model <agy|codex> --scene-start <S> --scene-end <E>
```

A successful semantic run automatically writes a hash-bound runtime PASS receipt. The next new batch is mechanically blocked until that receipt exists and still matches `master_script.txt`, `visual_bible.json`, and the exact reviewed scene payload. Rewriting any reviewed prompt invalidates its old receipt by hash.

Before running either gate, every prompt in the batch must start verbatim with:

`Create exactly one uninterrupted continuous shot in one visual setup for the entire clip.`

and its `Negative:` clause must contain verbatim:

`internal cuts, scene transitions, fades, dissolves, morph transitions, montage, time jumps, location changes, visual-domain changes`

The visual beat must be generated from the **current** `voiceover`; a named subject in current narration is locked and cannot be replaced. Later-scene subjects are forbidden. Exact large repeated-object counts are reserved for post-production graphics. For slow natural or ritual processes, keep real-time motion physically plausible unless the narration explicitly requires a clearly motivated time-compressed representation. Historical reconstructions must not invent events beyond the narration/evidence.
