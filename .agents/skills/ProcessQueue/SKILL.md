---
name: ProcessQueue
description: Processes new video generation tasks from queue.json by following the canonical 11-step vutru_ai pipeline exactly, without reordering or inventing alternate data flow.
---

# Process Queue Skill

This skill executes the end-to-end video production pipeline for the `vutru_ai` channel when triggered through `queue.json`.

## Canonical-flow lock

`.agents/01_workflow.md` is the single source of truth for execution order. **Do not reorder, merge, rename, skip, or insert a replacement pipeline step.** Supporting QA/tool calls inside a canonical step are allowed only when they reinforce that step and do not change any final output schema.

## Token-efficient documentation loading

Do **not** preload every manual. Follow the lazy-load map in `.agents/AGENTS.md §1`:

1. Always load `.agents/AGENTS.md`, `.agents/00_runtime_contract.md`, this skill, and `.agents/01_workflow.md`.
2. As each canonical step begins, load only the detail guide(s) mapped to that step.
3. For normal Step 8 Veo work, load `.agents/06_veo_prompt_core.md`, `.agents/12_veo_policy_compliance.md`, and `.agents/13_long_job_quality_guard.md`; load the extended `.agents/06_veo_prompt_guide.md` only for edge cases/examples or a gate failure that cites it. Reference `references/camera_variety_guide.md` and `references/color_palette_system.md` as needed.
4. Do not load audio/render/SEO/reference manuals unless that work is actually requested or reached.

This is a context-efficiency rule only; it does not change the canonical 11-step data flow.

## Exact 11-step execution order

1. **Read & validate `queue.json`** with `schemas/queue.schema.json`.
2. **Determine/research the topic**; in auto mode select category, build the runtime topic-research ledger, run uniqueness checks, choose a hook pattern, and complete the Claim Evidence Lock required by Step 2.6.
3. **Write `master_script.txt`** within the canonical SHORT length rule and the completeness-driven, unbounded LONG content-quality requirements. Inside this same step, create/validate the runtime `_editorial_message_lock.json`, pass `editorial_script_gate.py` before and after prose, then run `editorial_semantic_checker.py` once and keep its hash-bound `_editorial_semantic_receipt.json` through final QA. Reference `references/buddhist_glossary.md` and `references/canonical_texts_reference.md` when defining terms or citing canonical texts. Preserve the Claim Evidence Lock and do not proceed until both deterministic and independent semantic editorial gates pass.
4. **Write `metadata.json`** using only the canonical fields: `title`, `description`, `keywords`. Leave `description=""` and `keywords=[]` until the separate SEO step. **Do not put `language`, `videoType`, `mode`, `voiceStyle`, sources, or queue state into metadata.**
5. **Split the master narration into chapters** according to `videoType` and narrative structure.
6. **Create one project-wide `visual_bible.json` before scene splitting.** Write `story_anchor`, canonical entity identity, visual style (referencing `references/color_palette_system.md`), lighting, camera style, and the complete required negative list.
7. **Split each chapter into scenes only with `tools/word_splitter.py`**, carrying `NEXT_SCENE_START` and `NEXT_SENTENCE_START` across long-video chapter boundaries.
8. **Write `continuity_ref`, `shot_type`, and `veo_prompt`** in contiguous micro-batches (enforcing anti-repetition rules in `references/camera_variety_guide.md`). Every batch must pass deterministic `veo_batch_guard.py` **and then** AI semantic `scene_semantic_checker.py` before the next batch starts. If Step 8 is being re-run for a project that already has Veo fields, invoke the `GenerateVeoPrompts` full-regeneration contract first: `veo_regeneration_prepare.py` must rebuild `context_ref/sentence_id/part` and invalidate old `continuity_ref/shot_type/veo_prompt` plus stale Veo runtime state before Scene 1 is regenerated.
9. **Validate every final JSON output against its canonical schema.** Do not validate the top-level `database/history.json` array directly against the single-entry history schema.
10. **Run final QA** with the task's actual `language` and `mode`. `qa_automation.py` must pass and must confirm hash-current semantic receipt coverage for every scene. Do **not** run a redundant second full-video semantic AI pass when all batch receipts are current; rerun semantic AI only for stale/missing/changed ranges. A skipped/unavailable semantic review is not PASS.
11. **Append the history entry and update queue state only after Steps 9–10 pass.** Then clean runtime-only artifacts per `11_temp_file_management.md`.

## Hard contract reminders

- Final output schemas are closed. Never add undeclared convenience fields to `metadata.json`, chapter scenes, or `visual_bible.json`.
- Project settings (`videoType`, `language`, `mode`, `voiceStyle`, `aiModel`) come from the active task context and/or the matching `database/history.json` entry after Step 11, **not from metadata.json**.
- `visual_bible.json` precedes `word_splitter.py` by design; do not swap Steps 6 and 7.
- `all_veo_prompt.json`, CapCut assets, audio timelines, or SEO packages are downstream/auxiliary artifacts and must never be inserted as replacement canonical steps in this 11-step flow.
- On any contract conflict, stop and resolve the conflict in favor of `.agents/01_workflow.md` + `.agents/03_data_schemas.md` + the matching schema file rather than improvising a new data flow.
