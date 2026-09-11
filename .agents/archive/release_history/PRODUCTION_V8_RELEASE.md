# Production V8 Release

> **Historical audit/release note:** superseded by Production V9. Do not use this file as an executable contract; current authority is `AGENTS.md` + `00_runtime_contract.md` + current step/skill/tool behavior.


## Compatibility guarantee

Production V8 keeps every V7 final-data schema unchanged. Hash comparison against the V7 package confirms the existing JSON schemas under `.agents/schemas/` are byte-for-byte unchanged. V8 hardens runtime behavior, QA, source verification, context loading, duplicate detection, semantic review, and documentation without adding final project fields.

## What V8 fixes

### 1. Token/context efficiency

- Replaces mandatory preload of all 17 detailed manuals with `AGENTS.md` + `00_runtime_contract.md` + lazy-loaded step guides.
- Always-loaded instruction footprint is reduced from roughly 235 KB of manuals to roughly 14 KB of compact core text before step-specific guides are needed.
- Removes the redundant second full-video AI semantic pass when all batch receipts are current.
- Veo prompt guidance now targets the shortest fully specified prompt near 900–1500 chars instead of naturally drifting toward multi-thousand-character verbosity. Hard 900–4000 / >=800-positive rules remain unchanged.
- Topic research uses compact scout candidates and deepens only shortlisted/selected evidence; selected evidence alone receives mandatory online URL verification.

### 2. Interruption resilience

- AI semantic calls use bounded retry/backoff for transient CLI/timeout/parse failures and still fail closed after retries.
- Adds `veo_resume_guard.py`, a read-only safe-resume validator for interrupted already-prepared Veo runs. It verifies source hashes, checkpoint range, and semantic receipt before reporting `NEXT_SCENE`.
- A deliberate GenerateVeoPrompts rerun remains full regeneration; interruption-resume is explicitly separated from deliberate regeneration.

### 3. Topic-selection integrity

- Primary duplicate protection is now global across languages and Short/Long formats.
- Same-lane and same-category scans remain secondary fatigue/depth signals rather than duplicate boundaries.
- Translation, format switching, or category reassignment no longer hides a repeated core topic.
- `source_verifier.py` blocks placeholder/reserved fake URLs, verifies selected evidence online, uses bounded retries, and caches successful checks.
- `topic_research_gate.py --verify-sources` now fails if selected evidence cannot actually be resolved.

### 4. Script + narration quality

- Existing Editorial Message Lock remains intact.
- `editorial_script_gate.py` now additionally detects substantial repeated sentences, excessive consecutive near-restatements, and formulaic repeated sentence openings.
- Existing cadence, hype, filler, question-density, core-message/revelation, ending, and epistemic-strength checks remain.

### 5. Claim/evidence integrity

- `claim_evidence_gate.py --verify-sources` can require real online-resolvable evidence URLs in production.
- Reachability is explicitly separated from semantic support: the agent still has to read the source and keep `supports`, `allowed_wording`, certainty, and decision faithful to it.
- No claim/evidence runtime field was added to final project data.

### 6. Veo prompt quality

- Keeps hard scene word counts unchanged.
- Adds the V8 semantic-bridge rule for a fixed word window that straddles sentence boundaries: one truthful visual setup/beat only, never two setups or an in-clip transition.
- Removes the accidental implication that every shot should use 35mm; focal length must be justified per shot.
- Preserves current-voiceover authority, future-content lock, one-shot rule, canonical identity anchors, film look, physical camera logic, lighting/focus/micro-action/end-frame requirements, and exact negative locks.

### 7. QA correctness

- Fixes SEO chapter timestamps: description timestamps must exactly match chapter timeline starts; a one-second drift is now a failure.
- Final deterministic QA relies on hash-current semantic receipt coverage and reruns AI only where necessary.
- V8 regression tests include fake-source rejection and cross-lane duplicate blocking.

## Validation result

- Python tools compile: 28/28.
- Regression suite: 60/60 PASS.
- Existing final JSON schema files changed: 0.

## New runtime tools

- `tools/source_verifier.py`
- `tools/veo_resume_guard.py`

These tools write/read runtime-only state and do not change final video schemas.
