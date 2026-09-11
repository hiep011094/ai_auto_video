# 03 — Data Schemas

Each final JSON output below has a matching JSON schema file in
`.agents/schemas/` — always validate with `tools/schema_validator.py` before
considering a file done. Final output schemas use closed objects where
appropriate (`additionalProperties: false`), so accidental undeclared fields
are rejected instead of silently passing QA.

## 0. `queue.json`

Schema: `schemas/queue.schema.json` — the incoming task object.

| Field | Type | Required | Notes |
|---|---|---|---|
| `videoType` | `"short"` \| `"long"` | ✔ | |
| `generationMethod` | `"auto"` \| `"manual"` | ✔ | |
| `topic` | string | conditionally | Required when `generationMethod = "manual"` |
| `language` | `"vi"` | ✔ | |
| `mode` | `"1"` \| `"2"` | ✔ | 1 = Chiêm nghiệm, 2 = Kiến thức |
| `voiceStyle` | `"contemplative"` | ✔ | Must match `language` |
| `aiModel` | `"agy"` \| `"codex"` | ✔ | |
| `category` | category enum | — | Optional manual override. In auto mode the agent selects category via `category_selector.py`; do not require this field from the queue |

## 1. `database/history.json`

Schema: `schemas/history.schema.json` — an array of objects, one per video.

| Field | Type | Required | Notes |
|---|---|---|---|
| *(note)* | | | The `history.schema.json` schema describes **ONE entry** (object), not the whole file. `database/history.json` is an **array** of these entries. When validating with `tools/schema_validator.py`, run it against the single entry you are about to add (e.g. write it to a temporary `.json` file containing only that object) — **do not** point `--file` at the whole `database/history.json` (it will always fail, since the root is an array, not an object). |
| `id` | string | ✔ | Unique identifier (UUID or timestamp-based) |
| `title` | string | ✔ | Video title |
| `folder` | string | ✔ | Folder name (matches `[title-slug]`) |
| `date` | string (ISO 8601, VN time) | ✔ | Creation date |
| `type` | `"short"` \| `"long"` | ✔ | |
| `language` | `"vi"` | ✔ | |
| `mode` | `"1"` \| `"2"` | ✔ | 1 = Chiêm nghiệm, 2 = Kiến thức |
| `voiceStyle` | `"contemplative"` | ✔ | Must match `language` |
| `aiModel` | `"agy"` \| `"codex"` | ✔ | |
| `category` | `"buddhist_life"` \| `"buddhist_wisdom"` | ✔ | Auto: selected in Step 2.1. Manual: supplied or classified before history write |
| `last_hook_pattern` | integer (1–5) | ✔ | Opening pattern used |
| `main_video_content` | string (≥80 chars) | ✔ | **2–3 sentence summary tóm tắt nội dung chính của kịch bản** — KHÔNG ĐƯỢC copy title. Phải mô tả: chủ đề cụ thể, góc nhìn, các sự kiện/khám phá/giả thuyết chính. Đây là signal CHÍNH để hệ thống anti-duplication đối chiếu ý nghĩa nội dung với các video tương lai. Copy title = làm suy yếu hệ thống phát hiện trùng lặp |
| `youtube_status` | string | ✔ | Defaults to `"pending"` |
| `youtube_video_id` | string \| null | — | |
| `capcut_created` | boolean | ✔ | Defaults to `false` |
| `capcut_created_at` | string \| null | — | |
| `created_at` | string | ✔ | Same value as `date` |

## 2. `metadata.json`

Schema: `schemas/metadata.schema.json`. Start from
`templates/metadata_template.json`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | ✔ | |
| `description` | string | ✔ | Leave as `""` — only filled in through the separate SEO-optimization step |
| `keywords` | array[string] | ✔ | Leave as `[]` — only filled in through the separate SEO-optimization step |

## 3. `visual_bible.json`

Schema: `schemas/visual_bible.schema.json` — created once per video, shared
by every chapter/scene.

| Field | Type | Required | Notes |
|---|---|---|---|
| `story_anchor` | string | ✔ | Required 2–4 sentence project-wide throughline/theme/ending anchor — see `05_visual_bible_guide.md §"story_anchor"`. Read before every scene batch to prevent continuity drift. |
| `characters` | array[object] | ✔ | Each object: `name`, `role`, `age_range`, `appearance` (face, hair, build — fixed), `outfit` (fixed), optional `aliases`, optional `era`. For an off-screen/voice-only narrator, `appearance`/`outfit` must still be non-empty — write an explicit "N/A — never appears on camera" rather than leaving them blank |
| `locations` | array[object] | ✔ | Each object: `name`, `description` (architecture/space, dominant colors), optional `aliases` mapping alternate wording to the same canonical identity |
| `key_objects` | array[object] | — | Each object: `name`, `description` (fixed shape, material, scale), optional `aliases` — only declare objects that recur throughout the video |
| `visual_style` | object | ✔ | `aspect_ratio` (`9:16` for SHORT/vertical, `16:9` for LONG/horizontal), `film_look` (e.g. "cinematic documentary, subtle film grain"), `color_grading` (dominant color grade) |
| `lighting_timeline` | array[object] | ✔ | In chronological order through the video: `{ "stage": "opening", "time_of_day": "dusk", "mood": "..." }` — keeps lighting from jumping around illogically between scenes |
| `camera_style` | object | ✔ | `lens` (e.g. "35mm cinematic lens"), `movement_notes` (e.g. "slow dolly, light handheld for on-location scenes, static for data scenes") |
| `negative_keywords` | array[string] | ✔ | Project-wide negatives. Must include the policy-safety baseline (`no real identifiable people`, `no celebrity likeness`, `no graphic violence`, `no gore`, `no nudity`, `no sexual content`, `no hate symbols`) and the current V9 no-edit baseline (`internal cuts`, `scene transitions`, `fades`, `dissolves`, `morph transitions`, `montage`, `time jumps`, `location changes`, `visual-domain changes`), plus topic/style negatives as needed. |

## 4. `chapter_[01-n].json`

Schema: `schemas/chapter.schema.json` — an array of scene objects.

| Field | Type | Required | Notes |
|---|---|---|---|
| `scene` | integer | ✔ | Increases from 1, sequential, no duplicates, no gaps |
| `voiceover` | string | ✔ | Exact word count per the hard rule (see `04_scene_splitting_rules.md`) — generated by `word_splitter.py`, never hand-edit the word count. For scene generation this is the **local timing window**: the words actually spoken during this clip |
| `sub` | string | ✔ | Exact word count per the hard rule, used for TTS |
| `context_ref` | string | ✔ | The full sentence/passage containing this `voiceover` — **never shipped in the final product**. It is the semantic envelope used to resolve references/meaning, not permission to visualize every detail of the whole sentence in every part |
| `sentence_id` | integer | ✔ | Ordinal position of the original sentence in `master_script.txt`; used as a continuity/grouping anchor across parts, not as a substitute for reading the local `voiceover` beat |
| `part` | string (`"x/N"`) | ✔ | This scene's position within its source sentence; scene visuals should progress across `1/N → ... → N/N` rather than repeating the whole sentence in every part |
| `continuity_ref` | string | ✔ | Scene 1 is `"opening"`. For every later scene use `Previous end: ... Current opening: ... Editorial relationship: ...` to separate the preceding endpoint from the new clip opening; this is the end state/editorial handoff from the immediately preceding scene **in the whole video** (subject position/state, motion or gaze direction when relevant, location/time/weather/light, and the visual anchor carried across the cut). It may represent continuous action, a motivated matched cut, or an intentional narration-driven location/time shift; it must never invent an unmotivated teleport. Only scene 1 of `chapter_01.json` may say `"opening"` |
| `shot_type` | string | ✔ | One of: `establishing`, `extreme-wide`, `wide`, `medium`, `medium-close-up`, `close-up`, `extreme-close-up`, `two-shot`, `over-the-shoulder`, `insert`, `tracking`, `POV`, `pan`, `tilt`, `whip-pan`, `static`, `handheld`, `steadicam`, `aerial`, `drone`, `dolly`, `dolly-zoom`, `crane`, `arc`, `overhead`, `low-angle`, `high-angle`, `birds-eye`, `worms-eye`, `dutch-angle` — this is a **closed** list (enum, in `chapter.schema.json`); the full cinematic vocabulary and when to use each is in `06_veo_prompt_guide.md §2.9`. If a scene genuinely needs a shot type not on this list, do not invent a new value — flag it so the enum can be extended first |
| `veo_prompt` | string | ✔ | Written per `06_veo_prompt_guide.md`. Entirely English regardless of `language`; one project-defined continuous shot fitting a 4/6/8-second generation; no audio/sound/dialogue instructions because this pipeline mixes narration separately; **900–4,000 Unicode characters total**, with **at least 800 characters of positive visual direction before `Negative:`**; 4,000 is the hard ceiling. It must visualize the current `voiceover` beat while using `context_ref` + `sentence_id` + `part` for meaning/progression. See `06_veo_prompt_guide.md §0–§3` |
| `timeline` | object | — | Optional audio synchronization metadata generated by `tools/audio_timeline_aligner.py` from `[tong_hop_loi_thoai_vbee, tong_hop_loi_thoai].[wav,mp3]` or `scene_*.wav`. Contains: `start` (seconds), `end` (seconds), `duration` (seconds), `start_formatted` (`mm:ss.sss`), `end_formatted` (`mm:ss.sss`), and `speed` (playback speed factor, e.g. 1.15). Schema checks field shape; final QA additionally checks monotonic/contiguous boundaries and cross-field arithmetic. See `16_audio_timeline_guide.md` |

## 5. Runtime-only auto-topic research ledger (NOT a final output)

For `generationMethod = auto`, Step 2 temporarily writes
`data/.agent_runtime/_topic_research.json` matching
`schemas/topic_research.schema.json`. It records the 8–12 candidate angles,
recent/evergreen signal, source URLs/dates, and the selected angle so the
"hot topic" decision is evidence-backed instead of an uninspectable guess.
Validate it with `tools/topic_research_gate.py`. This file is deleted after
the completed history entry is appended and is never placed in the final
video folder, so it does not change the final data contract.


## 5.1. Runtime-only claim evidence ledger (NOT a final output)

Before finalizing factual narration, create `data/.agent_runtime/_claim_evidence.json` matching `schemas/claim_evidence.schema.json` and validate it with `tools/claim_evidence_gate.py` per `14_claim_evidence_lock.md`. It records material claims, certainty, allowed wording, visual limits, and source URLs/types. It is mandatory for `mode=2` and for high-risk factual claims in `mode=1`. Delete it after the successful task/history write; never place it in the final video folder.

## 5.2. Runtime-only Editorial Message Lock (NOT a final output)

Inside Step 3, create `data/.agent_runtime/_editorial_message_lock.json` matching `schemas/editorial_message_lock.schema.json` and validate it with `tools/editorial_script_gate.py` per `17_editorial_message_lock.md`. It locks the central question, core message, viewer value, key revelations, epistemic boundary, and ending takeaway before final prose, then checks the finished `master_script.txt` for message coverage, spoken cadence, hype/repetition, and common overstatement signatures. It adds **no field** to final JSON and is deleted after the successful history write.

## 6. Folder naming convention

`[title-slug]` = the video title, lowercased, diacritics stripped, spaces
replaced with `-`, keeping only letters/digits/hyphens. Example:
`"Chánh Niệm Trong Đời Thường"` → `chanh-niem-trong-doi-thuong`.

### Runtime semantic receipts (Production V9; not final output)

### GenerateVeoPrompts regeneration ownership

The final chapter schema is unchanged, but `GenerateVeoPrompts` owns a six-field generated package: `context_ref`, `sentence_id`, `part`, `continuity_ref`, `shot_type`, `veo_prompt`. On every full GenerateVeoPrompts invocation, `tools/veo_regeneration_prepare.py` deterministically re-derives the first three from preserved narration and deletes the last three before new generation. `scene`, `voiceover`, `sub`, and optional `timeline` are preserved. The chapter may therefore be temporarily schema-incomplete during regeneration; final schema validation is required only after all regenerated visual fields are restored.

`scene_semantic_checker.py` writes `data/.agent_runtime/_veo_semantic_receipts_<slug>.json` after semantic PASS. This runtime file is deliberately **not** added to `chapter.schema.json` and must never be shipped inside the final video output folder. Each receipt binds an exact scene range to hashes of `master_script.txt`, `visual_bible.json`, and the reviewed scene payload. It exists solely to make semantic QA non-skippable and stale-proof. Keep it until full final QA/history completion, then delete it with other runtime artifacts.
