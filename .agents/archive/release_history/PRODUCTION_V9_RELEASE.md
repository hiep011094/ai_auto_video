# Production V9 Release

Production V9 is a backward-compatible hardening release for the `.agents` video-production system. It preserves the existing final project schemas while strengthening source truth, multilingual duplicate prevention, semantic QA, runtime resilience, and token efficiency.

## Compatibility guarantee

- The eight public JSON schemas under `schemas/` are byte-for-byte unchanged from Production V8.
- Existing V7/V8 project JSON remains valid under the same schemas.
- V9 adds runtime receipts/tools and documentation only; it does not add required fields to final project data.

## Major V9 hardening

### Source and evidence integrity

- `source_verifier.py` rejects placeholder hosts, loopback/private/link-local/metadata targets and unsafe redirects before a source can count as evidence.
- URL reachability alone is not sufficient for production evidence.
- `evidence_semantic_verifier.py` retrieves source content and checks whether the selected topic angle or factual claim is actually grounded by the retrieved material.
- Agent-written `supports` text cannot launder an unrelated source: the target statement/angle and support note are grounded independently.
- Topic and claim gates support hash-bound content receipts so unchanged evidence does not need to be rejudged.
- Freshness windows are checked against source publication dates rather than trusted as self-reported labels.
- URL verification is cached and concurrent within bounded worker limits.

### Topic uniqueness

- Duplicate discovery is global-first across VI/EN and Short/Long history.
- A local multilingual concept layer promotes common translated concepts before AI review, preventing obvious translated duplicates from being hidden by lexical top-k filtering.
- Lane/category similarity remains a secondary fatigue signal, not an escape hatch from global duplicate prevention.

### Editorial quality

- Deterministic editorial checks remain the first line of defense.
- `editorial_semantic_checker.py` adds an independent whole-script semantic review for narrative progression, payoff/revelation quality, spoken naturalness, redundancy/padding, epistemic discipline, visual translatability and ending synthesis.
- Editorial semantic receipts are hash-bound to the message lock and final script; final QA reuses a current receipt instead of spending another whole-script model call.

### Veo prompt and continuity QA

- The compact `06_veo_prompt_core.md` is the default generation contract; the larger guide is loaded for edge cases rather than every scene-generation task.
- Hard word-split scenes that cross sentence boundaries expose a runtime boundary signal to semantic QA.
- Semantic QA must block a boundary-crossing scene when it cannot be represented truthfully as one continuous visual setup/beat.
- Claim evidence sent to each scene semantic batch is compacted to claims relevant to that batch.
- Semantic scene result parsing is fail-closed for boolean/type/count contradictions.
- Existing hash-bound per-batch receipts remain the final semantic coverage mechanism; no redundant full-video AI semantic pass is required when all receipts are current.

### Runtime and regression reliability

- Documentation now describes six required base queue parameters; conditional fields remain governed by the unchanged queue schema.
- Current runtime documents use Production V9 terminology; historical release notes are retained only as history.
- `tools/run_regression_suite.py` runs each pytest module in an isolated subprocess with third-party pytest plugin autoload disabled and a bounded timeout. This avoids cross-module/global-environment shutdown hangs while preserving deterministic regression coverage.

## Performance pass (2026-08-29)

A follow-up token/CPU-efficiency pass touched only implementation internals — never final data
schemas, CLI contracts, gate thresholds, or output messages:

- `qa_automation.py` previously re-read and re-parsed `chapter_*.json`/`visual_bible.json` from
  disk once per independent check (up to 17x and 5x per single run respectively). Reads are now
  memoized per run, keyed on each file's mtime + size, so an unchanged file is read once and any
  on-disk change is still picked up immediately.
- `similarity_engine.py` and `semantic_concepts.py` eliminated redundant recomputation of pure
  text-normalization/keyword/trigram/entity/concept functions that were being rebuilt from scratch
  for the same title/content strings across multiple similarity signals and scans; the 189-entry
  canonical phrase table is now compiled once at import time instead of per call.
- Minor dead-code cleanup (unused imports/variables, no-op f-strings) across 7 tool files, found by
  static analysis (`pyflakes`), with zero behavioral effect.
- Line endings normalized to LF across 16 files that had mixed CRLF/LF.

Verification: all 8 `schemas/*.schema.json` files remain byte-for-byte identical (SHA-256
reverified against the values recorded in `RELEASE_MANIFEST_V9.json`); the full 75-test regression
suite passes before and after every change; all Python files compile cleanly. See
`RELEASE_MANIFEST_V9.json` → `performance_pass_2026_08_29` for the itemized list.

## Production validation target

A release ZIP is considered final only after:

1. the V8 and V9 schema SHA-256 sets match exactly;
2. all regression test modules pass through `tools/run_regression_suite.py`;
3. all Python tools/tests compile successfully;
4. the ZIP passes `unzip -t` integrity verification;
5. a clean extraction contains `.agents/AGENTS.md`, schemas, tools, skills and tests.
