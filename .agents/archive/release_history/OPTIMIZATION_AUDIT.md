# Production V4 Hardened — Final Optimization Audit (2026-08-27)

> **Historical audit/release note:** superseded by Production V9. Do not use this file as an executable contract; current authority is `AGENTS.md` + `00_runtime_contract.md` + current step/skill/tool behavior.


This hardening release improves the existing `.agents` implementation **without changing the canonical data flow defined in `01_workflow.md`**. The purpose is to make Skills, schemas, tools, documentation and automated gates obey that flow consistently.

## Canonical flow preserved

The 11 canonical steps remain:

1. queue validation
2. topic/research/evidence
3. master script
4. metadata
5. chapters
6. Visual Bible
7. deterministic scene splitting
8. guarded Veo prompt generation
9. schema validation
10. final QA
11. history/state update + runtime cleanup

No new replacement step was inserted. SEO, audio timeline, Flow rendering and prompt aggregation remain downstream/auxiliary capabilities.

## Final scene contract preserved

The canonical scene fields remain:

- `scene`
- `voiceover`
- `sub`
- `context_ref`
- `sentence_id`
- `part`
- `continuity_ref`
- `shot_type`
- `veo_prompt`
- optional `timeline` when audio synchronization is explicitly performed

No convenience field was added to canonical metadata or scene JSON.

## Critical contract repairs

- `ProcessQueue/SKILL.md` now follows the exact canonical Step 1–11 order, including Visual Bible before scene splitting.
- `GenerateVeoPrompts/SKILL.md` and `OptimizeSEO/SKILL.md` no longer expect illegal project-context fields inside `metadata.json`.
- Canonical `Editorial relationship` values are unified everywhere: `continuous action`, `matched conceptual cut`, `intentional location/time shift`.
- Every Step-8 micro-batch must pass deterministic `veo_batch_guard.py` and then `scene_semantic_checker.py`; semantic receipts remain source/hash-bound.
- Final Veo QA uses the actual task mode instead of hard-coding mode 1.
- `progression_score` is now a true blocking semantic metric.
- Codex semantic calls no longer use `--dangerously-bypass-approvals-and-sandbox`.

## Determinism and reproducibility

- Category selection uses a canonical ordered tie-break instead of Python set/hash iteration.
- Malformed history data is a blocking input error rather than silently becoming “first video”.
- Category balance output uses the same canonical category order.
- Regression coverage verifies category selection remains stable across multiple `PYTHONHASHSEED` values.

## Visual/scene QA hardening

- `story_anchor` is required for every new Visual Bible.
- Visual Bible must contain the complete policy-safety negative baseline.
- Production V4 no-internal-edit negatives remain mandatory in every final prompt.
- Alias detection uses Unicode-aware phrase boundaries, avoiding substring collisions such as a short alias matching inside a longer word.
- Lens detection accepts valid forms such as `35mm` and `35 mm`.
- Micro-motion recognition covers additional physically meaningful processes such as condensation, evaporation, melting, fracturing, elongation, expansion, contraction, accumulation and spreading.
- The over-broad standalone `then` deterministic transition trigger was narrowed; semantic single-shot QA still treats true multi-beat scheduling as blocking.
- Future-leak semantic lookahead was expanded while keeping the context compact enough for repeated micro-batch review.
- English-only deterministic QA now checks more than Vietnamese diacritics and no longer reports a stronger guarantee than the heuristic actually proves.

## Claim Evidence Lock hardening

- Evidence sources now require a concrete `supports` note, not a bare URL.
- Mode 2 requires verified/qualified decisions and strong source types for high-risk claims.
- Final script receives a **post-script material-claim coverage pass** through `claim_evidence_gate.py --script`.
- Exact numbers/units, years, named institutions, strong causation and absence/no-evidence claims are conservatively checked for ledger coverage.
- Rejected claim statements are checked for leakage back into the final script.
- The gate explicitly states its limitation: it validates source metadata/URLs but does not fetch remote pages; source-content verification remains a research/editorial responsibility.

## Audio timeline hardening

- Documentation now accurately describes the implementation as Whisper word timestamps + local fuzzy boundary matching with a confidence gate, not “perfect forced alignment”.
- Whisper/Torch environment bootstrap occurs only when the aggregate-audio ASR path is used; individual `scene_*.wav` duration mode is decoupled from Whisper.
- Zero-word ASR output fails by default instead of fabricating an aligned timeline.
- `--allow-proportional-fallback` is explicit and opt-in.
- `--min-boundary-confidence` is configurable and blocking.
- Invalid/non-monotonic Whisper timestamps, invalid speed, impossible raw timelines and timeline gaps are rejected before writing.
- Final QA cross-validates contiguous boundaries, duration arithmetic, formatted timestamps and speed.

## SEO hardening

- `seo_agent` documentation is synchronized to the executable `OptimizeSEO` contract.
- Current platform caps are represented correctly: title ≤100 characters; description ≤5,000 UTF-8 bytes; tag budget ≤500 under YouTube counting rules.
- “No external source URLs” is explicitly a project editorial policy, not misrepresented as a universal YouTube rule.
- Added `tools/seo_qa.py` for deterministic validation of structure, title/description caps, hashtags, tag count/budget/sanitizer, project URL allow-list, basic language drift and timeline-derived Long chapter timestamps.

## Templates and schemas

- `chapter_scene_template.json`, `visual_bible_template.json`, `history_entry_template.json` and `metadata_template.json` are schema-valid examples rather than invalid placeholder objects.
- `visual_bible.schema.json` now requires `story_anchor`.
- `chapter.schema.json` validates formatted timeline shape; cross-field timeline arithmetic remains enforced by QA.
- `claim_evidence.schema.json` requires meaningful source support notes.
- `rack focus` is documented as an in-prompt focus operation, not an invalid `shot_type` enum value.

## Regression and CI verification

The test suite now supports normal pytest discovery in addition to the legacy direct-script runner. Coverage includes:

- word/part/subtitle/master-script integrity
- schema extra-field blocking
- aspect ratio / Visual Bible contract
- canonical anchor enforcement
- prompt length/craft/film-look/negative locks
- transition/audio/domain/camera-physics locks
- Claim Evidence coverage
- timeline cross-field integrity
- category determinism + malformed history behavior
- English heuristic
- word splitter abbreviation/number/decimal/offset edge cases
- synthetic audio alignment + low-integrity rejection
- SEO structure/caps/URL/timestamp validation
- static cross-file contract assertions preventing flow/schema/Skill drift

Final verification for this release: **49 pytest tests passed**.

## Recommended validation commands

```bash
python3 -m pytest -q .agents/tests
python3 .agents/tests/test_quality_gates.py
python3 .agents/tools/schema_validator.py --schema .agents/schemas/visual_bible.schema.json --file .agents/templates/visual_bible_template.json
python3 .agents/tools/schema_validator.py --schema .agents/schemas/chapter.schema.json --file .agents/templates/chapter_scene_template.json
python3 .agents/tools/qa_automation.py --folder <video-folder> --lang <vi|en> --mode <1|2>
python3 .agents/tools/scene_semantic_checker.py --folder <video-folder> --ai-model <agy|codex>
```

The deterministic layer must pass first. AI semantic review is a second required editorial gate wherever the canonical workflow requires it; unavailable semantic review is never treated as PASS.

## GenerateVeoPrompts full-regeneration hardening

- Added `tools/veo_regeneration_prepare.py` as the mandatory deterministic preparation for every GenerateVeoPrompts invocation.
- `context_ref`, `sentence_id`, and `part` are rebuilt through the canonical `word_splitter.py` algorithm on every run.
- Existing `continuity_ref`, `shot_type`, and `veo_prompt` are removed before generation so they cannot be accidentally reused.
- `scene`, `voiceover`, `sub`, and `timeline` are preserved; the tool refuses mutation if the narration stream no longer exactly covers `master_script.txt` or scene boundaries no longer reproduce canonically.
- Old Veo progress checkpoints, semantic receipts, and `all_veo_prompt.json` are invalidated automatically.
- Final `qa_automation.py` now independently re-derives and compares `context_ref/sentence_id/part`, making post-preparation drift a blocking error.
