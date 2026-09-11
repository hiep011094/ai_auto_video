# 06 — Veo Prompt Core Contract (V9, mandatory compact runtime guide)

Load this file for normal Veo generation/regeneration. `06_veo_prompt_guide.md` is the extended reference for unusual cases and examples; do not preload it unless a scene is ambiguous or a gate failure points to it.

## 1. Authority order

For each scene, obey this order:

1. current `voiceover` = local timing/visual authority;
2. `sentence_id + part` = position within the source sentence;
3. `context_ref` = resolves pronouns/meaning only, never licenses future content;
4. Claim Evidence `allowed_wording/visual_rule` = epistemic ceiling when relevant;
5. previous rendered/planned visible end state = continuity handoff;
6. `visual_bible.json` = recurring identity/style truth;
7. `story_anchor` = whole-video thematic check, never a reason to preview later narration.

If these appear to conflict, keep the current spoken beat and epistemic ceiling. Never solve a conflict by showing later content early.

## 2. One scene = one semantic beat = one setup

Every `veo_prompt` describes exactly one uninterrupted 4/6/8-second shot in one visual setup.

Required opening, exactly:

`Create exactly one uninterrupted continuous shot in one visual setup for the entire clip.`

Allowed inside the shot:
- one dominant subject/action/process;
- one framing/setup;
- one primary camera trajectory;
- subordinate micro-motion that belongs to the same action;
- continuous focus/lighting/environment evolution;
- one explicit visible end state.

Forbidden inside the shot:
- cut, montage, dissolve, fade, wipe, split screen;
- internal location/time jump;
- second setup or second independent narrative beat;
- morphing one visual domain into another;
- “then show…”, “next…”, “cut to…”, or equivalent edit logic.

### Hard word-split semantic bridge

Scene word counts remain owned by `word_splitter.py`; do not change them. If a hard split contains the tail of sentence A plus the start of sentence B, choose **one dominant bridge visual** that truthfully accommodates the spoken window. Do not create two setups. If no single truthful setup exists, flag a scene-design conflict for semantic review; do not silently invent a transition.

## 3. Semantic Lock before writing the prompt

Privately determine for the current scene:

- `LOCAL_CLAIM`: what is actually spoken now;
- `VISUAL_PROOF`: the most specific visible subject/process/evidence that communicates it;
- `NOT_YET`: later clause/consequence/opposing view/speculative result that must not appear;
- `CERTAINTY`: established / supported / preliminary / disputed / hypothetical / unknown;
- `END_STATE`: concrete visible state from which the next scene can continue or intentionally shift.

The prompt must depict `LOCAL_CLAIM`, not generic beautiful B-roll. A visually impressive scene that could fit many unrelated lines is weak and may fail semantic QA.

## 4. Epistemic visual truth

The image must not claim more than narration/evidence.

- `may/could/possible/tradition says/one interpretation/legend/scholarly debate/uncertain` → use symbolic imagery, contemplative framing, artistic reconstruction, or explicitly interpretive framing; never present a traditional story or philosophical interpretation as historically confirmed fact.
- attribution claims → visualize the teaching or concept symbolically; never depict an unverifiable dialogue or event as literal documentary footage.
- causation → do not depict a specific spiritual outcome as guaranteed when the narration only discusses possibility or practice.
- historical reconstruction → clearly remain artistic reconstruction when depicting ancient events, figures, or settings that cannot be directly observed.

## 5. Continuity contract

Global Scene 1: `continuity_ref = "opening"`.

Later scenes use:

`Previous end: <visible end state>. Current opening: <opening state>. Editorial relationship: <one allowed value>.`

Allowed values only:
- `continuous action`
- `matched conceptual cut`
- `intentional location/time shift`

Continuity carries only previous visible state: identity, object state, pose/gaze, screen direction, motion, weather, lighting, scale motif, camera axis when relevant. It must never carry future story information.

## 6. Visual-bible identity lock

When a named recurring character/location/key object appears, reuse its canonical identity description from `visual_bible.json`. Do not paraphrase appearance in a way that changes identity, outfit, materials, landmark geometry, or prop state.

Copy `visual_style.film_look` verbatim exactly once per prompt. Use lighting/camera style only where scene-relevant.

## 7. Cinematic craft without over-constraint

Each prompt needs enough direction to generate a moving shot, not a moving still:

- framing + camera angle;
- one justified focal length (e.g. 24/35/50/85mm or macro; do not default every scene to 35mm);
- focus strategy;
- one physically plausible camera behavior;
- motivated lighting;
- spatial/material depth;
- one scene-specific micro-action/process;
- explicit end-frame state.

Do not add cinematic metadata merely to fill length. Prefer the shortest complete prompt.

## 8. Prompt language/length/audio

- English prompt only, regardless of narration language.
- Total length: 900–4000 Unicode characters.
- Positive visual section before `Negative:`: at least 800 characters.
- Normal target: ~900–1500 characters when that fully specifies the scene.
- Visual-only contract: no dialogue, narration, music, sound effects, silence, voice, or `Audio:` instruction.

## 9. Negative clause

End with `Negative:`. Include:

1. `visual_bible.negative_keywords`;
2. policy safety baseline from `12_veo_policy_compliance.md`;
3. exact no-internal-edit intent: no cut, no montage, no dissolve, no fade, no wipe, no split screen, no internal transition, no second setup, no location/time jump within the clip;
4. no watermark/logo/generated typography unless a canonical project requirement explicitly permits it.

Positive instructions must not contradict the Negative clause.

## 10. Batch execution

Default contiguous batch = 6 scenes; max = 8.

For each batch:

1. write new `continuity_ref`, `shot_type`, `veo_prompt`;
2. run deterministic `veo_batch_guard.py --checkpoint`;
3. run `scene_semantic_checker.py` on the same exact range;
4. fix blocking issues and rerun both;
5. do not start the next batch without a hash-current semantic PASS receipt.

At final completion, run `qa_automation.py`. If all scene ranges already have current semantic receipts, **do not run a second full-video semantic AI pass**. Only stale/changed/failed ranges need semantic AI again.


## Channel visual style lock

Default to **mature semi-realistic 3D cinematic Buddhist storytelling**. The output may be stylized, but it must preserve natural human proportions, subtle expressions, realistic cloth/wood/stone/water/skin behavior, respectful sacred imagery, and physically plausible light. Reject childlike cartoon, chibi/anime exaggeration, toy-plastic CGI, flat 2D illustration, or neon fantasy styling unless the narration explicitly requires a mature symbolic exception.

## 11. Material fidelity contract

Every scene involving physical materials must include at least one material-specific rendering descriptor from the channel material authority table (`02_content_style.md §5.0`). This prevents Veo from defaulting to generic flat surfaces.

Priority order when budget is tight:
1. skin rendering quality (when human subject is visible);
2. fabric/robe behavior (when monastic/lay character present);
3. architectural surface (when building/temple is the environment);
4. natural element (water, foliage, fire, smoke).

Do not paste the entire material table into every prompt — select only the 1-3 materials that are visually dominant in the current scene.
