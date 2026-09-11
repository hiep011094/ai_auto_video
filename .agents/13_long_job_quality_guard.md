# 13 — Long-Job Quality Guard (Anti-Laziness / Anti-Drift)

## Purpose

Long scene-generation jobs fail in a predictable way: later prompts become shorter, generic, repetitive, visually disconnected from narration, or are written from stale memory. This guide makes constant quality a **hard workflow property**, not a request for the agent to "try harder." It does not change any final video-output field.

## 1. Mandatory micro-batch size

- Default batch: **6 consecutive scenes**.
- Absolute maximum before a checkpoint: **8 scenes**.
- Never draft future-batch placeholder `veo_prompt`s.
- Never mass-copy a template and perform superficial noun substitution.
- The next batch is locked until both deterministic batch QA and semantic batch QA pass.

## 2. Re-anchor before every batch

Re-open, in this order:
1. `visual_bible.json` (`story_anchor`, recurring identities, film look, lighting, camera style).
2. The current chapter narration / relevant section of `master_script.txt`.
3. The previous **2 completed scenes** including their prompts and `continuity_ref`.
4. The new batch's `voiceover`, `context_ref`, `sentence_id`, `part`.

Do not use a self-written summary as a substitute for these source files.

## 3. Scene-level Semantic Lock

Before each prompt, internally identify `LOCAL_CLAIM`, `VISUAL_PROOF`, `DO_NOT_SHOW_YET`, `EPISTEMIC_STATUS`, and `END_FRAME_STATE` as defined in `06_veo_prompt_guide.md §0.4`. These are scratch reasoning aids, not output fields.

## 4. Batch gate

After writing one batch:

```bash
python3 .agents/tools/veo_batch_guard.py \
  --folder data/[video_long|video_short]/[title-slug] \
  --start <first_scene> --end <last_scene> --checkpoint

python3 .agents/tools/scene_semantic_checker.py \
  --folder data/[video_long|video_short]/[title-slug] \
  --ai-model <agy|codex> \
  --scene-start <first_scene> --scene-end <last_scene>
```

Do not continue on exit 1/2/3. Fix the batch and rerun.

## 5. What `veo_batch_guard.py` blocks

It blocks under-detailed or structurally weak prompts before they accumulate:
- non-contiguous/skipped scene numbers;
- prompt <900 or >4000 characters, or positive visual body <800 characters before `Negative:`;
- missing exact `visual_style.film_look`;
- duplicate film-look/canonical identity anchor within one prompt;
- missing concrete lens/focus/camera/lighting vocabulary;
- missing complete Negative list;
- audio/sound/dialogue wording;
- internal cut/transition language;
- exact duplicate prompt reuse;
- invalid/vague continuity handoff for non-opening scenes;
- continuity refs that do not separate `Previous end:` from `Current opening:`;
- hidden visual-domain transformations (e.g. aerial/drone becoming a cross-section inside one clip);
- physically impossible camera scale (e.g. crane traveling kilometers);
- exact readable typography/logo/emblem requests and positive↔Negative contradictions;
- alias-aware canonical identity omissions.

## 6. Resuming after interruption or context fatigue

With `--checkpoint`, the tool writes:
`data/.agent_runtime/_veo_progress_<slug>.json`.

On resume:
- run `python3 .agents/tools/veo_resume_guard.py --folder <folder>` first;
- resume only from the tool-reported `NEXT_SCENE`;
- the guard verifies source hashes and the last batch's semantic PASS receipt;
- re-open source-of-truth files per §2;
- never infer where you stopped from memory.

If source hashes changed intentionally, run `veo_batch_guard.py --reset-checkpoint ...` and restart guarded review from scene 1. This is intentionally conservative: a changed script/bible can invalidate earlier prompts, so the system never silently accepts old checkpoints against new sources.

## 7. Periodic deep reset

Every 24 completed scenes, and at every chapter boundary:
- reread `story_anchor` and the relevant master-script passage;
- review shot-type distribution and recent camera movement choices;
- compare recurring character/location wording against the bible;
- scan the last 12 prompts for repeated composition, generic hologram/monitor dependence, or shrinking prompt length;
- correct drift before proceeding.

## 8. Completion condition

Per-batch PASS is not final PASS. After all scenes are written, run full `qa_automation.py --mode <1|2>`. V9 final QA requires hash-current semantic PASS receipt coverage for every scene, so do **not** repeat a second full-video AI semantic review when all batch receipts are current. Re-run semantic AI only for a stale/changed/failed batch. For mode 2, keep `_claim_evidence.json` until final deterministic QA confirms the Claim Evidence Lock. Only then may history be updated and runtime progress be cleaned.

## 9. Hash-bound semantic chain

The current V9 strict-scene contract makes the micro-batch order mechanically enforceable. After deterministic PASS+checkpoint, run semantic QA on the same exact scene range. A PASS writes `_veo_semantic_receipts_<slug>.json` under `data/.agent_runtime/`. Before a new batch starts, `veo_batch_guard.py` verifies that the immediately prior deterministic batch has a matching semantic receipt whose scene payload, master script, and visual bible hashes are unchanged.

Therefore:
- never edit a passed scene and assume its previous semantic PASS still applies;
- never advance after semantic checker exit 1/2/3;
- never delete receipts until final QA/history completion;
- if source-of-truth changes, reset checkpoint and re-guard from scene 1;
- final `qa_automation.py` requires semantic receipt coverage of every final scene.
