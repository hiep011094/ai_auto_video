# AGENTS.md — V10 operating entry point

The project creates serene cinematic documentary YouTube Short/Long videos for the channel **ĐƯỜNG VỀ TỈNH THỨC** in exactly two active pillars: **Phật pháp sống** (`buddhist_life`) and **Trí tuệ Phật giáo** (`buddhist_wisdom`). Language: Vietnamese only. Voice style: `contemplative`.

V10 is a backward-compatible policy update on the V9 hardening core. It remains compatible with V7/V8/V9 final project data. **Never change final schemas or fields already defined by the project.**

## 1. Context-loading rule — mandatory and token-efficient

Always read only:

1. `AGENTS.md`
2. `00_runtime_contract.md`
3. the current skill file when a skill was invoked
4. the step-specific documents below **only when that step is being executed**

Do **not** preload `01`–`17` on every task. Detailed guides remain authoritative for their own step, but loading unrelated manuals wastes context and increases instruction drift.

| Work being performed | Load these detail files |
|---|---|
| Full queue orchestration | `01_workflow.md`, then load later rows only as their step begins |
| Script/content | `02_content_style.md`, `08_hook_patterns.md`, `17_editorial_message_lock.md`; optionally `references/buddhist_glossary.md` and `references/canonical_texts_reference.md` when defining terms or citing sutras |
| Final JSON structure/write | `03_data_schemas.md` + target schema under `schemas/` |
| Scene splitting/alignment | `04_scene_splitting_rules.md` |
| Visual bible | `05_visual_bible_guide.md`, optionally `references/color_palette_system.md` |
| Veo prompt generation/regeneration | `06_veo_prompt_core.md`, `12_veo_policy_compliance.md`, `13_long_job_quality_guard.md`; optionally `references/camera_variety_guide.md`, `references/color_palette_system.md`; load `06_veo_prompt_guide.md` only for edge cases/examples or a gate failure that cites it |
| Topic auto-selection/duplicate/category | `09_topic_uniqueness.md`, `10_category_rotation.md` |
| Factual/source research | `14_claim_evidence_lock.md`, optionally `references/canonical_texts_reference.md` |
| Flow render/reference handoff | `15_flow_render_continuity.md` only when rendering downstream |
| Audio timeline | `16_audio_timeline_guide.md` only when audio/timeline is requested/available |
| Final QA | `07_qa_checklist.md` plus only the guides implicated by a failing gate |
| Temp cleanup | `11_temp_file_management.md` |

## 2. Non-negotiable project invariants

- Final project schemas are immutable. No undeclared field may be added to final JSON.
- Use `tools/word_splitter.py`; never eyeball word counts.
- LONG narration must be **strictly more than 60,000 Unicode characters** in `master_script.txt` (recommended working target: **65,000+**), with **no maximum character/runtime ceiling**. The 60k floor is a format requirement, not permission to pad: choose/broaden only topics that can truthfully sustain >60k useful narration, and never repeat or dilute ideas merely to cross the threshold.
- `context_ref` is internal-only and never viewer-facing.
- `visual_bible.json` must exist before Veo prompting; recurring identity wording comes from it, not memory.
- Current `voiceover` is the local visual authority. `context_ref` resolves meaning but cannot authorize future content.
- Every `veo_prompt` is English, visual-only, one uninterrupted continuous setup, 900–4000 chars total and >=800 positive chars before `Negative:`.
- Normal prompt target is concise and concrete (usually ~900–1500 chars), not padded toward the ceiling.
- No real identifiable-person likeness, copyrighted-character imitation, graphic violence/gore/sexual content, generated exact typography/logo, internal transitions, or audio instructions.
- Use Vietnam UTC+7 timestamp helper for project timestamps.
- Deliberate GenerateVeoPrompts reruns remain full-package regeneration as defined in the skill/guide.

## 3. V9 quality architecture

### Topic discovery

- Auto topic selection requires a runtime research ledger plus **online source verification** of the selected evidence.
- Run:

```bash
python3 .agents/tools/topic_research_gate.py \
  --file data/.agent_runtime/_topic_research.json \
  --verify-sources --verify-content --ai-model <agy|codex> \
  --verification-cache data/.agent_runtime/_source_verification_cache.json \
  --content-receipt data/.agent_runtime/_topic_evidence_content_receipt.json
```

- Primary duplicate checking is global across languages and Short/Long history. Same-lane/same-category checks are extra fatigue signals.

```bash
python3 .agents/tools/check_topic_duplicate.py \
  --new-topic "<topic>" --history database/history.json \
  --language vi --video-type short|long --ai-model agy \
  [--category buddhist_life|buddhist_wisdom]
```

### Script + claims

- Create `_editorial_message_lock.json`, run editorial preflight, write script, run editorial script gate.
- Build `_claim_evidence.json`; source URLs are not trusted by syntax alone.

```bash
python3 .agents/tools/claim_evidence_gate.py \
  --file data/.agent_runtime/_claim_evidence.json --mode 1|2 \
  --verify-sources --verify-content --ai-model <agy|codex> \
  --verification-cache data/.agent_runtime/_source_verification_cache.json \
  --content-receipt data/.agent_runtime/_claim_evidence_content_receipt.json

# after master_script.txt is final, reuse the hash-bound evidence receipt:
python3 .agents/tools/claim_evidence_gate.py \
  --file data/.agent_runtime/_claim_evidence.json --mode 1|2 \
  --script <master_script.txt> \
  --require-content-receipt data/.agent_runtime/_claim_evidence_content_receipt.json
```

### Veo generation

For a deliberate new regeneration:

```bash
python3 .agents/tools/veo_regeneration_prepare.py \
  --folder <video-folder> --type short|long --lang vi|en
```

Generate in contiguous batches of 6 by default (max 8). For every batch:

```bash
python3 .agents/tools/veo_batch_guard.py --folder <folder> --start N --end M --checkpoint
python3 .agents/tools/scene_semantic_checker.py --folder <folder> --ai-model agy --scene-start N --scene-end M
```

Do not advance until both pass. `scene_semantic_checker.py` uses bounded retry for transient AI failures and writes hash-bound receipts.

### Final QA

```bash
python3 .agents/tools/qa_automation.py --folder <folder> --lang vi|en --mode 1|2
```

`qa_automation.py` already verifies hash-current semantic receipt coverage for all scenes. **Do not spend a second full-video AI semantic pass after all batches have valid receipts.** Rerun semantic AI only for stale/changed/failed ranges.

## 4. Core tool index

| Tool | V9 purpose |
|---|---|
| `word_splitter.py` | deterministic hard word split + canonical `context_ref/sentence_id/part` |
| `schema_validator.py` | exact JSON schema validation |
| `source_verifier.py` | public-network reachability verification + cache; blocks placeholder/private/internal/unsafe-redirect sources |
| `topic_research_gate.py` | topic evidence/freshness structure + source reachability + semantic-content verification |
| `check_topic_duplicate.py` | global-first multilingual-concept + lexical/entity signals + AI semantic duplicate prevention; lane/category as secondary checks |
| `similarity_engine.py` | fast Tier-1 scan; supports `--scope lane|global` |
| `category_selector.py` | two-category rotation selector |
| `editorial_script_gate.py` | message/cadence/hype + V9 anti-padding/formulaic narration checks |
| `claim_evidence_gate.py` | claim/certainty/wording coverage + source reachability + semantic-content support receipts |
| `veo_regeneration_prepare.py` | full deliberate regeneration preparation/invalidation |
| `veo_resume_guard.py` | read-only safe-resume check after interruption; validates checkpoint + source hashes + semantic receipt |
| `veo_batch_guard.py` | deterministic batch quality/checkpoint chain |
| `scene_semantic_checker.py` | AI semantic scene QA + hash-bound receipts; bounded retry inherited from AI caller |
| `qa_automation.py` | final deterministic QA + current semantic receipt coverage |
| `audio_timeline_aligner.py` | optional confidence-gated audio timeline alignment |
| `seo_qa.py` | downstream SEO structure/timeline QA; timestamps must exactly match chapter starts |

## 5. Failure policy

- Schema/data mismatch: stop and fix.
- Topic/evidence URL cannot be verified in production mode: replace/verify the source; do not self-score it into PASS.
- AI semantic exit 3 or unusable output after bounded retry: NOT PASS; rerun that range or perform explicit manual review according to the workflow.
- Changed source hashes: stale receipts/checkpoints are invalid.
- One failing range does not justify rerunning unrelated verified AI ranges unless the source-of-truth change makes their hashes stale.
- Never mark a task complete merely because JSON is syntactically valid.

## 6. Release identity

This package is **Production V10** (V9 hardening core + >60,000-character LONG policy). Historical V3/V7/V8/V9 release notes and the superseded V4 optimization audit are archived under `archive/release_history/` for audit history only — they are never loaded during task execution. An expanded (non-authoritative) category reference bank is archived under `archive/superseded_reference/`; the authoritative category source remains `10_category_rotation.md` + `tools/category_keywords.py`. Current execution follows `AGENTS.md`, `00_runtime_contract.md`, the current step guide/skill, and V10 tool/test behavior. When historical wording conflicts, the V10 current contract wins without altering final data schemas.

- V9 script quality: after the deterministic editorial gate, run `tools/editorial_semantic_checker.py` once and preserve its hash-bound receipt through final QA. Do not rerun the same whole-script semantic review when hashes are unchanged.
