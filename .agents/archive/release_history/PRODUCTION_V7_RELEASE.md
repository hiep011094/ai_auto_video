# `.agents` V7 — Editorial & Narration Quality Release

> **Historical audit/release note:** superseded by Production V9. Do not use this file as an executable contract; current authority is `AGENTS.md` + `00_runtime_contract.md` + current step/skill/tool behavior.


## Scope

V7 is a **targeted editorial upgrade** on top of the existing two-category
system and Production V4 Veo scene contract. It does not redesign the project
data flow and does not change the final JSON schemas for queue/history,
metadata, visual bible, or chapters.

## What V7 improves

1. **Editorial Message Lock** (`17_editorial_message_lock.md`)
   - one central question;
   - one core message;
   - explicit viewer value;
   - key revelations/evidence path;
   - known-vs-uncertain boundary;
   - ending takeaway.

2. **Natural narration gate** (`tools/editorial_script_gate.py`)
   - spoken cadence instead of article-like sentence packing;
   - sustained 45–60+ word sentence chains are blocked;
   - hype/reaction-word density is bounded;
   - repeated filler/hype phrases are blocked;
   - final-quarter takeaway coverage is checked;
   - common strong-certainty wording is flagged/blocked by mode.

3. **Stronger epistemic discipline**
   - `claim_evidence_gate.py --script` now catches common cases where a
     `qualified/speculative/preliminary/disputed/hypothetical/unknown` claim is
     upgraded to `proved`, `đã chứng minh`, `fully explained`, `giải mã trọn
     vẹn`, etc.;
   - association/correlation is explicitly separated from direct causation in
     the editorial rules.

4. **Hook examples cleaned up**
   - old `space/mystery/physics` wording was replaced by the current two
     exploration pillars;
   - unsafe/example-only exact catastrophe phrasing was removed so examples do
     not prime unsupported clickbait.

## Calibrated against real generated scripts

The V7 gate was tuned against three representative scripts from the existing
agent output:

- the DART Short passes the new editorial gate (good compact storytelling);
- the Holographic Principle Short is blocked when it upgrades theoretical
  status to proof-level language;
- the STEVE Long is blocked for sustained long-sentence density, excessive
  hype repetition, and an unsupported `fully solved`-style claim.

The intention is **not** to make scripts bland. The standard is: let the fact,
mechanism, evidence, scale, or consequence create the wonder; do not use
adjectives or certainty stronger than the evidence.

## Compatibility guarantees

V7 deliberately leaves these contracts untouched unless separately requested:

- the 2 ACTIVE content categories and strict alternation;
- topic duplicate/semantic uniqueness logic;
- `word_splitter.py` and exact scene word counts;
- GenerateVeoPrompts full-regeneration contract;
- Veo prompt schema/length/continuity/single-shot rules;
- SEO generation/QA;
- CapCut/audio timeline behavior;
- canonical final project JSON field sets.

The only new schema is `editorial_message_lock.schema.json`, and it describes a
**runtime-only scratch file** under `data/.agent_runtime/`.
