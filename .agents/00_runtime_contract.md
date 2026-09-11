# V10 Runtime Contract — compact mandatory core

This is the only detailed document that every execution must load together with `AGENTS.md`.
All other guides are **lazy-loaded by step** from the map in `AGENTS.md`. This reduces context/token overhead without changing any final project data schema.

## Immutable output/data contract

- Never add, remove, rename, reorder, or reinterpret final project fields defined by `03_data_schemas.md` / `schemas/*.schema.json`.
- `queue.json`, `database/history.json`, `metadata.json`, `visual_bible.json`, `chapter_*.json`, `master_script.txt` remain backward-compatible with V7.
- Runtime-only files under `data/.agent_runtime/` may be created/invalidated by tools; they are never shipped as final video data.
- All project timestamps use Vietnam time UTC+7 via `tools/get_vn_timestamp.py`.
- Preserve the hard word counts owned by `tools/word_splitter.py`: short vi=14, long vi=20 words per scene except the natural final remainder.
- Preserve SHORT narration length discipline. For LONG, enforce **>60,000 Unicode characters** in `master_script.txt` as the minimum long-form format floor, recommend **65,000+** for production margin, and impose **no maximum character/runtime ceiling**. The script must still be topic-driven and complete without padding; if the selected angle cannot sustain >60k useful narration, broaden/reselect the angle instead of repeating content.
- Normal Veo work loads `06_veo_prompt_core.md`; the 43KB extended `06_veo_prompt_guide.md` is lazy reference material for edge cases, examples, or gate-directed troubleshooting only.

## Topic truth + uniqueness

1. In `generationMethod=auto`, category selection still follows the two active categories and the rotation contract in `10_category_rotation.md`.
2. Topic research must use real fresh evidence. A URL that merely looks valid is not evidence.
3. Run `topic_research_gate.py --verify-sources --verify-content --ai-model <queue.aiModel>`. Selected sources must be public-network safe, resolve online, and their retrieved content must substantiate the selected angle/support note. A live but unrelated page is not evidence.
4. Duplicate protection is **global-first** across all history languages and formats. Tier-1 retrieval includes canonical VI↔EN concept signals so translated duplicates cannot be hidden outside lexical top-k. Same-lane and same-category checks are secondary fatigue/depth signals; they are never the boundary of duplicate protection.
5. A translation, Short/Long conversion, category reassignment, or title rewrite does not make an already-covered core topic unique.

## Script/editorial truth

- Create the Editorial Message Lock before the master script and pass `editorial_script_gate.py`; after the final script, run `editorial_semantic_checker.py` once and preserve its hash-bound receipt through final QA.
- Script must answer one central question, communicate one core message, advance through distinct revelations, and end with a fresh synthesis.
- Avoid padding: repeated substantial sentences, consecutive near-restatements, repeated formulaic sentence openings, hype density, filler bridges, and question-only teasing are quality failures when they exceed the V9 gate budgets.
- Material factual claims must be represented in the Claim Evidence Lock. In production, run `claim_evidence_gate.py --verify-sources --verify-content --ai-model <queue.aiModel>` and write the hash-bound content-support receipt.
- Source reachability alone never proves semantic support. V9 verifies retrieved content against each `supports` note/claim and uses AI only for ambiguous rows; high-risk Mode 2 claims require a semantically supported strong source.

## Scene splitting + semantic beat rule

- The deterministic word boundary is immutable. Never change scene text merely to make Veo prompting easier.
- A fixed word window may straddle two source sentences. This does **not** authorize two shots or two visual domains.
- For each scene, identify one **dominant visible beat** from the words actually spoken in `voiceover`; use `context_ref` only to resolve meaning/anaphora.
- If a scene contains the end of one thought and the beginning of the next, use one bridge-compatible visual setup/action that remains true for the entire spoken window. Do not depict both clauses as separate setups. If no honest single setup can cover the window, flag a scene-design conflict for editorial review; never invent a transition inside the Veo clip.

## Veo prompt contract

- Veo prompts are English-only and visual-only. No audio/sound/dialogue directions.
- Every prompt starts exactly with: `Create exactly one uninterrupted continuous shot in one visual setup for the entire clip.`
- One prompt = one uninterrupted setup, one visual domain, one dominant process/action, no internal cut/fade/dissolve/morph/montage/time jump/location change.
- Final prompt remains 900–4000 Unicode characters with at least 800 positive visual characters before `Negative:`. Treat 900–1500 as the normal efficiency target when the scene can be fully specified there; do not pad toward 4000.
- Reuse only relevant canonical recurring identity/location/object wording from `visual_bible.json`; do not paste unrelated anchors.
- Include the exact project film-look once (premium cinematic Buddhist visual storytelling, mature semi-realistic 3D, warm amber tones), a justified lens/focus choice, physically plausible camera plan, motivated lighting/material behavior, useful micro-motion, and explicit end-frame state.
- Do not ask Veo to render large exact counts or exact readable typography/logos. Exact numbers/text belong in post.
- `continuity_ref` describes endpoints: Previous end + Current opening + Editorial relationship. It must not command a transition inside the clip.

## Long-job and interruption contract

- Default generation micro-batch = 6 scenes, maximum 8.
- Before a new batch, reopen only the source files needed for that batch; do not reload all manuals.
- Each batch must pass `veo_batch_guard.py --checkpoint` then batch-scoped `scene_semantic_checker.py`.
- AI semantic calls retry one transient failure automatically. After bounded retries, failure/unusable JSON remains NOT PASS; never silently infer success.
- Hash-bound semantic receipts are the final proof that a batch was reviewed. `qa_automation.py` verifies current receipt coverage across every scene, so **do not rerun a second full-video AI semantic review after all batches already have current receipts**. This eliminates duplicate AI cost while preserving hard semantic coverage.
- A changed master script, visual bible, or scene payload invalidates matching receipts automatically.

## GenerateVeoPrompts regeneration

- A deliberate new GenerateVeoPrompts regeneration remains full-package: prepare with `veo_regeneration_prepare.py`, rebuild `context_ref/sentence_id/part` deterministically, remove old `continuity_ref/shot_type/veo_prompt`, invalidate stale Veo runtime state, regenerate from Scene 1.
- A process interruption inside the same already-prepared run is not permission to prepare/destructively restart again. First run `tools/veo_resume_guard.py --folder <folder>`; resume only from the reported hash-valid checkpoint when sources are unchanged. If it reports NOT_RESUMABLE, restart full regeneration preparation.

## Final QA

Final completion requires:

1. final schema validation;
2. deterministic Editorial gate + hash-current independent editorial semantic receipt + Claim gates current for the final script;
3. `qa_automation.py` PASS, including exact alignment and semantic receipt coverage;
4. policy review current;
5. no stale runtime-derived artifact masquerading as current output.

A format-valid file is not automatically true, unique, or high quality. V10 retains the V9 separation of structural validation, safe source reachability, evidence-content support, semantic review, and render-time reality, while adding the >60,000-character LONG floor; no one layer is sufficient by itself.
