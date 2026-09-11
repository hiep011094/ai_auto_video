# Production V3 Master Release — 2026-08-26

> **Historical audit/release note:** superseded by Production V9. Do not use this file as an executable contract; current authority is `AGENTS.md` + `00_runtime_contract.md` + current step/skill/tool behavior.


> **Historical release note:** This file records the Production V3 milestone. The current executable contract is Production V4 as defined by `AGENTS.md`, `01_workflow.md`, current schemas, Skills, and QA tools. If this historical note conflicts with those files, the V4 contract wins.


This release is based on audits of two real long-form outputs (including a 147-scene K2-18b project and a 173-scene Richat project). It preserves the final scene field contract while strengthening the reasoning and validation layers that previously allowed polished but semantically/physically weak shots to pass.

## Major additions

- Semantic Lock remains voiceover-first; continuity can no longer plan future content.
- Prompt contract: 900–4000 total Unicode characters, plus >=800 useful positive visual characters before `Negative:`.
- Visual Domain Lock: one clip stays in one representational world/setup.
- Camera Physics & Scale Lock: physical rig terminology must match travel scale/domain.
- Structured continuity refs: `Previous end` + `Current opening` + validated `Editorial relationship`.
- Positive↔Negative conflict blocker and exact typography/logo/emblem blocker.
- Evidence Visualization ≠ Verdict rules for absence, survey, reconstruction and uncertain science.
- Runtime Claim Evidence Lock for factual claims, source authority, allowed wording and visual limits.
- Visual-bible aliases plus era-separated identities to prevent implicit entity drift.
- AI semantic QA now scores visual-domain integrity and evidence-visualization honesty and can ingest the runtime claim ledger.
- Micro-batch checkpoints now record positive-prompt detail statistics in addition to total prompt length.
- Optional Flow render-continuity guide for approved references/ingredients and frame carryover without changing scene JSON.

## Final scene fields remain unchanged

`scene`, `voiceover`, `sub`, `context_ref`, `sentence_id`, `part`, `continuity_ref`, `shot_type`, `veo_prompt`.

## Validation evidence

- Python syntax/compile: PASS.
- JSON parse: PASS.
- Quality-gate regression suite: PASS.
- Synthetic mode-2 project including Claim Evidence Lock: deterministic final QA PASS.
- Prior Richat output intentionally FAILS new gates at the exact audited weaknesses: positive-body detail floor, camera/domain physics, typography conflict and legacy free-form continuity refs.

## Production V4 strict-scene-lock addendum

The V3 structure is retained, but the execution gates are strengthened without changing final project JSON schemas. V4 adds: exact single-take prompt anchor; exact no-internal-edit Negative lock; deterministic named-subject mismatch detection; large exact-count rendering block; stricter AI scores for subject lock, future leakage, time scale and transition freedom; future-scene context supplied only for leakage detection; hash-bound semantic PASS receipts; and mechanical prevention of advancing to the next micro-batch when semantic QA was skipped or became stale.
