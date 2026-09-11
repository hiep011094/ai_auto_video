# Production V10 — LONG >60,000 Character Update (2026-09-09)

This update is built on the Production V9 hardening core for **ĐƯỜNG VỀ TỈNH THỨC** and changes only long-form script policy/validation. It does **not** change the final project data contract.

## Hard LONG policy

- `videoType=long` requires `master_script.txt` to be **strictly more than 60,000 Unicode characters**.
- Recommended production working target: **65,000+ characters** to provide margin for later editing/TTS differences.
- There is **no maximum** character count or runtime ceiling. 70k, 100k, 150k+ are valid when the topic needs them.
- 60,000 characters is a **floor, not a target**. The script must remain detailed, accurate, coherent, and useful.
- Never cross the floor with duplicated quotations, repeated morals, generic meditation filler, circular explanations, or redundant transitions.
- If a selected topic/angle cannot truthfully sustain >60k useful narration, broaden/reframe/reselect it before final script generation.

## Unchanged data rules

- All 8 final JSON schemas are unchanged byte-for-byte from the uploaded package.
- Existing final fields and structures remain unchanged.
- Scene splitting remains deterministic: LONG Vietnamese = 20 words/scene (natural final remainder allowed).
- `context_ref`, `sentence_id`, `part`, `continuity_ref`, `shot_type`, `veo_prompt` rules remain unchanged.
- Final `veo_prompt` remains 900–4000 Unicode characters with the existing one-shot/no-transition contract.

## Enforcement

The >60k rule is enforced in both:

1. `tools/editorial_script_gate.py` — editorial script validation.
2. `tools/qa_automation.py` — final deterministic QA.

A LONG script of exactly 60,000 characters fails. 60,001+ passes the length gate, subject to all other quality/evidence/editorial checks.

## Validation performed

- 79/79 regression tests pass across 8 test modules.
- 41 Python files compile successfully.
- All 8 final schema files are byte-identical to the user-uploaded `.agents(1).zip`.
- Boundary policy verified: exactly 60,000 characters fails; 60,001 characters clears the deterministic LONG length gate; 65,000+ is recommended.
- ZIP integrity is verified after packaging.
