# 17 — Editorial Message Lock & Natural Narration Gate

## Purpose

This layer makes the final narration communicate a complete idea instead of
merely sounding dramatic. It is **runtime-only** and changes no canonical
video JSON schema, no topic-uniqueness logic, no category rotation, no scene
splitting rule, and no Veo/SEO contract.

The target listener is a Vietnamese viewer seeking inner peace and practical
wisdom, with no prerequisite Buddhist knowledge. By the end of a video, that
viewer should be able to answer three questions in plain language:

1. What is the teaching, story, or insight being shared?
2. Why does this teaching exist, and how does it apply to daily life?
3. Why does it matter — what single insight should remain after the video?

## 1. Create the runtime Editorial Message Lock before final prose

Inside canonical Step 3, create:

`data/.agent_runtime/_editorial_message_lock.json`

Validate it with `schemas/editorial_message_lock.schema.json`. This file is
scratch editorial state; never copy it into the final video folder or add its
fields to `metadata.json`, chapter JSON, visual bible, queue, or history.

Required intent fields:

- `central_question` — the one question about life/dharma the video is
  genuinely answering.
- `core_message` — one sentence the viewer should remember after the video.
- `viewer_value` — what the viewer will understand better after watching.
- `audience_assumption` — normally: curious general audience, no specialist
  prerequisites; define any unavoidable prerequisite explicitly.
- `key_revelations` — the minimum evidence/reveal beats needed to earn the
  core message. Short: normally 2–4. Long: normally 4–8 top-level revelations; a revelation may contain as many sourced sub-points as the topic requires, so this runtime summary never caps script depth or duration.
- `epistemic_boundary.known` — what is canonical teaching or established
  historical fact, supported strongly enough to state directly.
- `epistemic_boundary.uncertain` — what remains one tradition's
  interpretation, later commentary, scholarly debate, personal reflection,
  or folk belief not found in canonical texts.
- `ending_takeaway` — the final insight in fresh wording; it must resolve the
  opening promise rather than simply launch another unrelated mystery.
- `do_not_overclaim` — optional concrete claims/wordings that research showed
  would be stronger than the evidence permits.

## Long-form length rule

For `video_type=long`, the final master script must be **strictly more than 60,000 Unicode characters** (recommended working target **65,000+**) and has **no maximum**. Continue until the declared message is fully earned through accurate context, source provenance, explanation, examples, nuance, practical application, and synthesis. The minimum may never be met by padding: if the locked topic cannot sustain >60k useful narration without repetition, broaden/reframe/reselect the topic before finalizing the lock. Stop only after both conditions are true: the script is >60,000 characters **and** additional material would only repeat/decorate what is already understood.

## 2. Message-completeness contract

Every paragraph/section must serve at least one of these jobs:

- establish the central question;
- provide necessary context to understand the next reveal;
- present evidence/observation;
- explain mechanism/cause at the supported certainty level;
- compare alternatives or limitations;
- show consequence/meaning;
- synthesize toward the core message.

If a passage serves none of them, remove or rewrite it. Do not keep filler
merely to reach the >60,000-character LONG floor; solve insufficient depth by
broadening/reselecting the topic, never by repetition.

A reveal is incomplete if it gives only a fact without the listener-facing
connection. When relevant, finish the thought with the appropriate link:

`WHAT → HOW/WHY → HOW WE KNOW → WHY IT MATTERS`

Not every sentence needs all four, but the full script must.

## 3. Natural spoken-narration contract

Write for the ear, not for a dense article.

- One sentence should normally carry one primary idea.
- Vietnamese target cadence: most sentences about 12–30 whitespace words;
  occasional 31–45 word explanation is acceptable when syntax remains clear.
  Avoid repeated 45+ word sentences; 55+ words should be exceptional and
  rewritten unless splitting would damage meaning.
- English target cadence: most sentences about 10–28 words with the same
  principle.
- Put the important noun/subject early. Avoid long chains of subordinate
  clauses before the listener knows what the sentence is about.
- After a technical term, immediately give a plain-language explanation when
  a general viewer would not already know it.
- Prefer: concept/mechanism first → one grounded analogy second. Never teach
  the analogy as if it were the mechanism itself.
- Vary cadence deliberately: short reveal → normal explanation → concrete
  example/consequence. Do not make every sentence a trailer line.
- Pronouns must have an obvious antecedent. Re-name the subject when needed.
- Preserve logical connectors (`vì`, `nhưng`, `do đó`, `trong khi`, `however`,
  `therefore`) only where the relationship is actually supported.

## 4. Hype-density budget

Wonder should come from the information, not from adjective stacking.

Use dramatic modifiers only when they add real meaning. Avoid repeated use of
phrases such as `vô cùng`, `kinh hoàng`, `khổng lồ`, `chấn động`, `ma mị`,
`mãnh liệt`, `cực kỳ`, `sững sờ`, `độc nhất vô nhị`, or English equivalents.
A strong number, image, mechanism, contradiction, or consequence usually does
not need an extra reaction adjective.

Rules:

- Do not reuse the same hype phrase more than twice in one script.
- Long narration should normally stay below ~7 hype markers per 1,000 words.
- A Short may use a few stronger words because it is compressed, but should
  not attach a superlative/reaction adjective to every reveal.
- Never intensify certainty. `dramatic delivery` may be stronger than neutral
  prose; `claim strength` may not be stronger than the evidence.

## 5. Epistemic-language contract

Never silently convert:

- one tradition/commentary/modern interpretation → universal Buddhist truth;
- moral correlation or folk belief → guaranteed karmic causation;
- later retelling or devotional legend → securely established history;
- one school’s interpretation → the only valid interpretation;
- absence from one text/tradition → proof that no Buddhist source teaches it;
- a popular quote or social-media saying → direct words of the historical Buddha without source verification.

When uncertainty matters, make it audible in the narration with concise,
natural wording: `có thể`, `dữ liệu cho thấy`, `một cách giải thích là`,
`nghiên cứu hiện tại gợi ý`, `chưa rõ`, `vẫn đang được tranh luận`, or the
English equivalent. Do not bury the qualifier several sentences away.

The Claim Evidence Lock in `14_claim_evidence_lock.md` remains the factual
source-of-truth gate; this editorial lock does not replace it.

## 6. Short-video architecture

A Short must be one complete argument, not a teaser with missing explanation:

1. Hook — truthful interruption.
2. Orientation — identify the subject quickly.
3. 2–4 reveal/evidence beats in causal/logical order.
4. Payoff — answer the central question as far as evidence allows.
5. Takeaway — one memorable implication tied to the core message.

If narration must be condensed, remove secondary examples before removing the causal/explanatory
bridge that lets the viewer understand the main point.

## 7. Long-video architecture

A Long video should feel like one investigation with chapters, not several
mini-articles stitched together.

- Each chapter has a local question/reveal but advances the same central
  question.
- Before introducing a new branch, explain why the current evidence makes
  that branch necessary.
- Place background immediately before the viewer needs it; avoid front-loading
  textbook context.
- After a dense mechanism section, reconnect to a concrete observation,
  consequence, or unresolved question.
- Include the strongest limitation/counterpoint at the moment it becomes
  relevant, not as a legal disclaimer dumped at the end.
- The final 10–15% synthesizes rather than introduces a large unrelated topic.
- The ending should echo the opening at a deeper level and restate the core
  message in fresh words, without repeating paragraphs verbatim.

## 8. Blocking gate inside Step 3

Before writing prose:

```bash
python3 .agents/tools/editorial_script_gate.py \
  --lock data/.agent_runtime/_editorial_message_lock.json \
  --video-type <short|long> --language <vi|en> --mode <1|2>
```

After `master_script.txt` is written/revised:

```bash
python3 .agents/tools/editorial_script_gate.py \
  --lock data/.agent_runtime/_editorial_message_lock.json \
  --script data/[video_long|video_short]/[title-slug]/master_script.txt \
  --video-type <short|long> --language <vi|en> --mode <1|2>
```

Exit 1/2 is blocking. Fix the editorial lock or narration and rerun before
scene splitting. The deterministic tool checks intent coverage, cadence,
hype/repetition, and common overstatement signatures.

After the deterministic post-script gate, run the independent semantic judge:

```bash
python3 .agents/tools/editorial_semantic_checker.py \
  --lock data/.agent_runtime/_editorial_message_lock.json \
  --script data/[video_long|video_short]/[title-slug]/master_script.txt \
  --video-type <short|long> --language <vi|en> --mode <1|2> \
  --ai-model <agy|codex> \
  --receipt data/.agent_runtime/_editorial_semantic_receipt.json
```

Exit 1/2/3 is blocking. This independent pass judges narrative payoff,
progression, revelation quality, spoken naturalness, redundancy/padding,
epistemic discipline, visual translatability, and ending synthesis. Final QA
reuses the hash-bound receipt and never spends a duplicate whole-script AI pass
when the lock/script hashes are unchanged.

## 9. Final self-read

Before accepting the script, read it once as if hearing it without images.
The listener must not need to infer a missing bridge. Verify:

- I know what question is being answered.
- I can explain the answer in one sentence.
- I understand why the major reveals are connected.
- I know which parts are certain and which are not.
- I understand why the topic matters.
- The final thought is earned by the story and stays with me.

If any answer is no, rewrite `master_script.txt` before continuing.
