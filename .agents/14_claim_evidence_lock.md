# 14 — Claim Evidence Lock & Visual Truth

This layer prevents a polished documentary from stating a plausible-sounding claim more strongly than its evidence allows. It changes no final video JSON schema; the ledger is runtime-only.

## When required

- `mode = 2` (Kiến thức/factual): mandatory before finalizing `master_script.txt`.
- `mode = 1` (Chiêm nghiệm/contemplative): mandatory for any named teacher, exact date/number, causal claim, sutra attribution presented as canonical, historical reconstruction presented as factual, or absence-of-evidence conclusion; contemplative/interpretive claims must remain explicitly framed as reflection.

## Runtime file

Create `data/.agent_runtime/_claim_evidence.json`, validate it against `schemas/claim_evidence.schema.json`, then run `tools/claim_evidence_gate.py`. Delete it with other runtime scratch data after the task per `11_temp_file_management.md`.

Each important claim records: the exact statement, claim type, certainty, decision (`verified`, `qualified`, `speculative`, `reject`), source URLs/types plus a concrete `supports` note for every source, the strongest wording the script is allowed to use, and a `visual_rule` explaining what the corresponding scene may honestly show.

### Authority hierarchy

Prefer primary canonical texts (Pali Canon/Nikaya, Chinese Agamas, major Mahayana sutras), peer-reviewed Buddhist scholarship (journals, university publications), authoritative Buddhist encyclopedias/databases, and historical/archaeological records for sutra attribution, historical dates, place names, and doctrinal claims. Secondary commentary/popular dharma books can add context but should not silently upgrade certainty. Folk traditions, internet memes, and unsourced "Buddha said" quotes are never enough to verify a canonical claim.

### Wording contract

The final script may be **weaker** than `allowed_wording`, never stronger. A `qualified` or `interpretive` claim cannot become canonical merely for impact. A `reject` claim cannot appear as a fact. Distinguish `Pali Canon direct quote` from `later commentary`, `one school's interpretation` from `universal Buddhist truth`, and `folk tradition` from `canonical teaching`.

**Epistemic-strength lock:** for claims whose `decision` is `qualified`/`speculative` or whose certainty is `interpretive`, `disputed`, `folk_tradition`, or `unknown`, the script must not upgrade them with absolute language such as `Đức Phật dạy rằng` (when unverifiable), `chân lý tuyệt đối`, `đã chứng minh`, `mọi Phật tử đều tin`, or `kinh điển ghi rõ` (when the source is commentary, not canonical text). Likewise, one tradition's practice must not be narrated as the universal Buddhist norm unless evidence supports that breadth. `tools/claim_evidence_gate.py --script` checks common lexical overstatement signatures in addition to material-claim coverage.

### Visual contract

The scene may show only what `visual_rule` permits at the same epistemic level. For canonical teachings, depict generic temple/nature scenes, not specific historical events unless documented. For historical claims, use period-appropriate reconstruction. For contemplative/interpretive content, use symbolic natural imagery (lotus, water, mountain, light). For exact text/quotes/numbers, generate visual atmosphere and add typography in post.


## Post-script coverage pass — mandatory when the lock applies

The pre-script gate verifies ledger structure/evidence discipline. After `master_script.txt` is finalized, run the same gate again with `--script`:

```bash
python3 .agents/tools/claim_evidence_gate.py \
  --file data/.agent_runtime/_claim_evidence.json \
  --mode <1|2> \
  --script data/[video_long|video_short]/[title-slug]/master_script.txt
```

The post-script pass deterministically looks for high-risk material claim sentences (exact numbers/units, years, named institutions, strong causation, and absence/no-evidence wording) and requires matching ledger coverage. It also blocks rejected claim statements that leak back into the final script. The gate validates URLs syntactically and evidence metadata semantically; it **does not fetch remote pages**, so the researcher must still verify that each cited source genuinely supports the recorded claim.


## Production V9 — safe reachability + semantic source-support layer

Before a production claim ledger is accepted, run `claim_evidence_gate.py` with `--verify-sources --verify-content --ai-model <queue.aiModel>`, the shared runtime verification cache, and `--content-receipt data/.agent_runtime/_claim_evidence_content_receipt.json`. V9 rejects placeholder/private/internal targets and unsafe redirects, verifies retrieved content against each claim/support note, and uses AI only when deterministic content grounding is ambiguous. A high-risk Mode 2 claim requires at least one semantically supported strong source. The receipt is hash-bound to the exact ledger and can be reused by the post-script coverage pass with `--require-content-receipt`, avoiding repeat network/AI cost. No final project schema is changed.
