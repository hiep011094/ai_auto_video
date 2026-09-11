# Production V9 — Buddhist Long-Form Update (2026-09-09)

This update specializes the package for **ĐƯỜNG VỀ TỈNH THỨC** without changing the final project data contract.

## Hard guarantees

- All 8 final JSON schemas remain byte-identical to the uploaded package.
- SHORT narration remains 900–1,200 characters.
- LONG narration has **no fixed character minimum, maximum, or runtime ceiling**.
- LONG duration is determined by topic completeness, factual/doctrinal accuracy, useful depth, and narrative coherence.
- Unlimited length never means unlimited filler: repeated quotations, duplicated morals, generic padding, and redundant transitions must still be removed.
- Existing scene data rules remain unchanged, including exact word splitting, `context_ref`, `sentence_id`, `part`, `continuity_ref`, `shot_type`, `veo_prompt`, final schema validation, and Veo prompt limits.

## Visual identity

Default channel style is **premium cinematic Buddhist visual storytelling, mature semi-realistic 3D, warm amber tones**. The system avoids child-oriented cartoon, chibi/anime exaggeration, toy-like plastic CGI, and flat 2D illustration unless a mature symbolic exception is explicitly justified by narration.

## Long-form completeness

A long script should continue as long as useful material remains and, where relevant, cover source/tradition provenance, historical/canonical context, terminology, reasoning, illustrative stories, important nuances, common misunderstandings, modern-life application, and a resolved synthesis.

## Verification

- 77 tests collected; all 8 test modules passed individually.
- 41 Python files compiled successfully.
- A 290,000-character long script passed the updated final-QA length policy.
- Final schemas were hash-compared against the uploaded package and remained unchanged.
