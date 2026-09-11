---
name: GenerateVeoPrompts
description: Generates or fully regenerates the complete V9 strict-scene Veo scene package with deterministic narration alignment, stale-state invalidation, and non-skippable deterministic→semantic micro-batch QA.
---

# Generate Veo Prompts Skill

This skill owns the **complete Veo scene-generation package**. Load `06_veo_prompt_core.md` as the normal prompt contract; load the full `06_veo_prompt_guide.md` only for edge cases/examples or when a gate failure requires deeper guidance. Also reference `references/camera_variety_guide.md` for anti-repetition camera movements and `references/color_palette_system.md` for scene-type color grading. Every invocation rebuilds the Veo-dependent scene state from canonical sources; it never assumes existing generated fields are still trustworthy merely because they are present.

It does **not** change the canonical project data flow or final JSON schema.

## Source-of-truth contract

Resolve project/task settings from the existing pipeline sources, never from undeclared metadata fields:

- `metadata.json`: canonical fields are only `title`, `description`, `keywords`.
- `videoType`: infer from the canonical folder (`data/video_short/...` → `short`, `data/video_long/...` → `long`) and cross-check the matching history/task context when available.
- `language`, `mode`, `voiceStyle`, `aiModel`: read from the triggering task context. For post-generation regeneration, resolve the matching entry in `database/history.json` by project folder when the task no longer carries them. Never invent a fallback.
- `master_script.txt`: canonical narration token stream and global semantic source.
- `visual_bible.json`: single visual identity source of truth: `story_anchor`, `characters[].appearance/outfit`, `locations[].description`, `key_objects[].description`, `visual_style`, `lighting_timeline`, `camera_style`, `negative_keywords`.
- `chapter_*.json`: preserves canonical `scene`, `voiceover`, `sub`, optional `timeline`; all Veo-semantic/generated fields are rebuilt by this skill.

If required settings cannot be resolved unambiguously, stop rather than silently assuming `mode=1`, `language=en`, or any other value.

## Full-regeneration contract — mandatory on EVERY invocation

Treat these six fields as one dependency chain, not independent editable values:

1. `context_ref` — deterministically rebuilt from the preserved narration stream through the canonical splitter algorithm.
2. `sentence_id` — deterministically rebuilt and globally continuous across chapters.
3. `part` — deterministically rebuilt as the exact `x/N` progression belonging to the rebuilt `sentence_id`.
4. `continuity_ref` — regenerated from the newly planned visible endpoint/opening states.
5. `shot_type` — regenerated from the current semantic beat and continuity needs using the closed schema enum.
6. `veo_prompt` — regenerated last from the complete current scene stack.

**Existing values of any of these six fields must never be reused simply because they exist.** A rerun of `GenerateVeoPrompts` means a full rebuild of the entire six-field package.

Preserve exactly unless another canonical workflow step explicitly changes them:

- `scene`
- `voiceover`
- `sub`
- `timeline`
- `master_script.txt`
- `visual_bible.json`
- `metadata.json`
- runtime Claim Evidence data required by the task mode

### Mandatory deterministic preparation

Before writing Scene 1, run:

```bash
python3 .agents/tools/veo_regeneration_prepare.py \
  --folder "<outputFolder>" \
  --type <actual short|long> \
  --lang <actual vi|en>
```

This tool is the only approved way for this skill to rebuild `context_ref`, `sentence_id`, and `part`. It:

- proves the preserved scene `voiceover` stream is an exact whitespace-token split of `master_script.txt`;
- reuses the canonical `word_splitter.py` algorithm rather than LLM inference;
- rebuilds `context_ref`, `sentence_id`, `part` for every scene;
- preserves `scene`, `voiceover`, `sub`, and optional `timeline`;
- removes every existing `continuity_ref`, `shot_type`, and `veo_prompt` so stale visual generation cannot be reused accidentally;
- deletes stale `_veo_progress_<slug>.json`, `_veo_semantic_receipts_<slug>.json`, and derived `all_veo_prompt.json` when present;
- aborts before mutation if master-script coverage, scene numbering, word boundaries, or canonical re-splitting do not match.

After this command, chapter JSON is intentionally **intermediate/incomplete** until all three visual fields are regenerated. Do not run final chapter schema validation until all scenes have been rebuilt.

## `continuity_ref` contract

- Global Scene 1: `opening`.
- Every later scene:
  `Previous end: <visible end state of N-1>. Current opening: <opening state intended for N>. Editorial relationship: <value>.`
- Allowed relationship values are exactly:
  - `continuous action`
  - `matched conceptual cut`
  - `intentional location/time shift`
- Never use unregistered values such as `scale expansion cut`, `perspective shift`, or `matched graphic cut`.
- Never put future planning or an in-clip transition in `continuity_ref`.
- Build Scene N+1 continuity only after Scene N's new end-frame state is fixed; never copy the previous run's handoff.

## V9 strict-scene `veo_prompt` contract

Every prompt must:

1. Start exactly with `Create exactly one uninterrupted continuous shot in one visual setup for the entire clip.`
2. Visualize the current `voiceover` beat, resolved by newly rebuilt `context_ref` and positioned by newly rebuilt `sentence_id + part`; never preview a later beat.
3. Remain in one visual domain/setup for the entire clip.
4. Include concrete framing, one justified focal length appropriate to the shot (for example 24mm/35mm/50mm/85mm or macro), focus strategy, one physically plausible camera behavior, motivated lighting, spatial/material detail, scene-relevant micro-action, and explicit end-frame state. Do not force every scene to 35mm.
5. Copy `visual_style.film_look` verbatim exactly once.
6. Reuse named recurring character/location/key-object canonical descriptions without identity drift.
7. Contain 900–4,000 Unicode characters total and at least 800 positive visual characters before `Negative:`; normally target the shortest complete prompt near 900–1500 rather than padding toward the ceiling.
8. Be entirely English regardless of narration language.
9. Contain no audio/sound/dialogue/narration/music/silence instruction.
10. Contain no internal edit, montage, fade, dissolve, time/location jump, domain morph, or second setup.
11. End with `Negative:` containing the complete project negative list, no-internal-edit lock from `06_veo_prompt_core.md`, and mandatory safety negatives from `12_veo_policy_compliance.md`.

### Eight-part craft checklist

1. Mandatory opening anchor.
2. Shot/framing and exact current subject.
3. Canonical environment/identity detail.
4. Lens, focus, one camera trajectory and spatial logic.
5. Lighting/atmosphere.
6. Scene-specific micro-action and end-frame state.
7. Verbatim canonical film look and restrained realism/color treatment.
8. Complete `Negative:` clause.

## Execution workflow

### 1. Claim the `veo_queue.json` task

Mark only the selected task `processing` and preserve the existing queue structure/timestamps contract.

### 2. Resolve and validate canonical inputs

- Resolve actual `videoType`, `language`, `mode`, and `aiModel` from canonical task/history sources.
- Validate `metadata.json` and `visual_bible.json` against their schemas.
- Confirm `master_script.txt` and all chapter files exist.
- Do **not** require pre-generation chapters to satisfy the final `chapter.schema.json`, because the final schema intentionally requires visual fields that this skill is about to regenerate.

### 3. Mandatory full-regeneration preparation

Run `veo_regeneration_prepare.py` exactly once for the project before generating any new `continuity_ref`, `shot_type`, or `veo_prompt`. Never bypass this step on a rerun, even when the existing alignment fields appear correct.

Start generation from global Scene 1 after preparation. Old checkpoints/receipts are invalid by definition after a full regeneration.

### 4. Regenerate in contiguous micro-batches

Default batch size: 6; hard maximum: 8.

For each batch:

1. Re-open `visual_bible.json`; read current `voiceover/context_ref/sentence_id/part`, previous two rebuilt scene endpoints, and relevant source narration.
2. Apply Semantic Lock and decide the current beat/end-frame state.
3. Generate **new** `continuity_ref`, **new** `shot_type`, and **new** `veo_prompt` for every scene in the range. No placeholders and no copying from the prior run.
4. Run deterministic gate with checkpoint:
   ```bash
   python3 .agents/tools/veo_batch_guard.py \
     --folder "<outputFolder>" --start <S> --end <E> --checkpoint
   ```
5. Only after deterministic PASS, run semantic gate on the exact same range:
   ```bash
   python3 .agents/tools/scene_semantic_checker.py \
     --folder "<outputFolder>" --ai-model <actual agy|codex> \
     --scene-start <S> --scene-end <E>
   ```
6. Fix all blocking issues and rerun both gates. The next batch is forbidden until the exact current batch has a current hash-matching semantic PASS receipt.

### 5. Validate final chapter schemas

After **all scenes** have their new visual fields, run `schema_validator.py` on every `chapter_*.json`. Do not continue on schema failure.

### 6. Rebuild optional derived prompt artifact

If the renderer needs `all_veo_prompt.json`, rebuild it from the newly validated chapters only after Step 5. It must contain only ordered `{scene, veo_prompt}` rows. Never reuse the previous file.

### 7. Final QA with actual task settings

```bash
python3 .agents/tools/qa_automation.py \
  --folder "<outputFolder>" --lang <actual vi|en> --mode <actual 1|2>
```

`qa_automation.py` verifies hash-current semantic receipt coverage for every scene. **Do not run a second full-video `scene_semantic_checker.py` pass when all batch receipts are current.** If final QA reports stale/missing semantic coverage, rerun semantic QA only for the affected contiguous range(s), then rerun final QA. Never hard-code `--mode 1`. A mode-2 project must retain and pass Claim Evidence Lock. Semantic exit code 3 means manual review required, never PASS.

### 8. Complete queue task

Only after final schema + deterministic QA + semantic QA all pass, mark the Veo task completed and update only its existing progress/timestamp fields. Do not alter queue schema or final project schemas.
