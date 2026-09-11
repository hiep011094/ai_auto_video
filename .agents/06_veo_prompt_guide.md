# 06 — Guide to Writing `veo_prompt`

## 0. Hard format rules — read this before writing a single prompt

These rules are **absolute** and apply to every `veo_prompt`, in every
video, regardless of `language`/`videoType`/`mode`. They are listed first,
in imperative form, precisely because they are the most commonly
mis-inferred rules in the whole pipeline — do not pattern-match against
`language: vi` or against tone of the script to decide otherwise.

1. **`veo_prompt` MUST always be written in English — never Vietnamese,
   regardless of `language: vi` or `language: en`.** This applies even for
   a fully Vietnamese-narrated video: only `voiceover`/`sub`/
   `master_script.txt` follow `voiceStyle`'s language; `veo_prompt` does
   not. Reason: Veo 3.1 interprets English cinematography/lighting/lens
   terminology significantly more reliably than Vietnamese, and mixing
   languages measurably degrades output quality. `context_ref` itself may
   stay in the original script language (it is only an internal reference
   for meaning) — but the `veo_prompt` text you actually submit to Veo must
   be 100% English.
2. **`veo_prompt` MUST NEVER contain any description of audio, sound, or
   dialogue — not a positive description, and not a negative/silence
   directive either.** Do not add an `Audio:` clause. Do not write "silent,"
   "no dialogue," "no sound," "no music," or any variant of that. Do not
   describe a character speaking, narrating, shouting, singing, or any
   other sound-producing action framed as an audio cue. **This is an
   intentional project/pipeline constraint, not a Veo 3.1 capability
   limitation.** Veo can be prompted for synchronized audio/dialogue, but
   this project creates narration/TTS separately and needs predictable clips
   for later editing. Therefore `veo_prompt` is visual-only so generated
   speech/audio instructions do not compete with the final soundtrack.
   - Practical consequence for continuity with the separately-produced TTS
     narration: since Veo may generate a character's mouth moving with its
     own (unpredictable, non-matching) dialogue audio, prefer framing human
     subjects so their mouth/lip motion is not the focal point when it
     doesn't need to be — e.g. a three-quarter angle, profile, looking
     away from camera, listening/observing posture, or the mouth simply not
     in tight close-up — **as a visual composition choice**, not as an audio
     instruction. This is a cinematography decision (§2.9 below), never an
     `Audio:`/"no dialogue" clause.
3. **Production range: 900–4,000 Unicode characters per `veo_prompt`, with at least 800 characters of positive visual direction before `Negative:`.** Count the final string exactly as Python `len(prompt)`
   would after it is written into JSON. Rich detail is still required, but
   it must be information-dense: subject identity, the current visual beat,
   continuity handoff, camera/lens, lighting/atmosphere, physical behavior,
   style/realism, and the `Negative:` clause all compete for the same budget.
   If a draft exceeds 4,000 characters, remove repetition and compress syntax
   first; never solve the limit by dropping identity anchors, narration
   fidelity, continuity, safety, or the core cinematography. The fixed `Negative:` boilerplate does **not** count toward the positive-detail minimum. Never pad a
   short prompt toward 4,000 characters — every clause must add a **new,
   concrete, non-redundant visual fact**.
4. **One `veo_prompt` = one project-defined continuous shot fitting one
   4/6/8-second base generation.** Veo 3.1 can support richer multi-shot/
   timestamp workflows in other contexts, but **this pipeline deliberately
   does not use them** because each scene JSON object is one independently
   generated clip that must be easy to validate, regenerate, and stitch.
   Write **one clear dominant action or camera move that physically fits in
   ≤8 seconds**. Supporting micro-motion (breathing, drifting dust, wind in
   fabric, ripples, moving clouds) is allowed when it belongs to the same
   beat; a second narrative action/setup is not. If the current scene carries
   more than one essential beat, flag the mismatch rather than hiding a
   second shot inside the prompt.


## 0.3. Full regeneration contract for `GenerateVeoPrompts`

When `GenerateVeoPrompts` is invoked, treat `context_ref`, `sentence_id`, `part`, `continuity_ref`, `shot_type`, and `veo_prompt` as one generated dependency package. **Every invocation rebuilds all six; no old value in this package is authoritative merely because it already exists.**

Before Scene 1, always run `tools/veo_regeneration_prepare.py --folder <folder> --type <short|long> --lang <vi|en>`. The tool re-derives `context_ref/sentence_id/part` through the canonical `word_splitter.py` algorithm, preserves `scene/voiceover/sub/timeline`, removes all old `continuity_ref/shot_type/veo_prompt`, and invalidates prompt-dependent checkpoint/semantic-receipt/merged-prompt artifacts. Then regenerate the three visual fields from Scene 1 in the normal deterministic→semantic micro-batch chain.

Final `qa_automation.py` independently re-derives the splitter-owned trio again and blocks any scene whose `context_ref`, `sentence_id`, or `part` drifted after preparation. This is a regeneration safety contract only; it does not add or reorder a canonical workflow step and does not change the final chapter schema.


## 0.4. Semantic Lock — mandatory before writing every scene

This is the highest-priority anti-mismatch rule in the entire Veo stage. It exists
because a visually impressive prompt can still be wrong if it depicts a later idea,
the opposite side of an argument, or a speculative consequence while the narration is
still discussing evidence. Before drafting any `veo_prompt`, make a short **internal
scratch decision** (do not add new final JSON fields):

- `LOCAL_CLAIM`: one sentence stating exactly what the current `voiceover` says now.
- `VISUAL_PROOF`: the specific visible subject/action/process that best represents that claim.
- `DO_NOT_SHOW_YET`: facts/images present only in later wording or later `part` values.
- `EPISTEMIC_STATUS`: established observation / interpretation / hypothesis / simulation / unknown.
- `END_FRAME_STATE`: the exact visible state this one continuous shot should end on, so the next scene can inherit it.

Then apply this immutable priority order:

```
CURRENT voiceover words
    ↓
LOCAL_CLAIM / VISUAL_PROOF
    ↓
context_ref only to resolve meaning
    ↓
sentence_id + part to position the beat
    ↓
visual_bible identity/style
    ↓
previous END_FRAME_STATE / continuity_ref
    ↓
cinematography and micro-motion
```

**Never reverse this order.** `continuity_ref` is not a story planner and must never
introduce a subject, conclusion, opposing viewpoint, later consequence, later location,
or speculative life-form that the current `voiceover` does not yet justify. If the
previous scene and current narration require an editorial concept change, preserve only
what can logically carry across the cut (tone, light family, motion direction, motif),
then depict the current narration beat.

### Epistemic visual truth

The image must communicate the same certainty level as the narration. If the narration
says *may, could, possible, hypothesis, candidate, disputed, preliminary, model,* or
equivalent wording, the prompt must not depict the hypothesis as confirmed reality. Use
phrasing such as `symbolic contemplative visualization`, `historical reconstruction`,
`possible model`, or show the evidence/process itself. Do not show thriving alien life,
a confirmed causal mechanism, a historical event, or a discovery outcome unless the
current narration actually supports that certainty. This rule is blocking in semantic QA.



## 0.6. Visual Domain Lock — one clip, one representational world

Before writing the camera sentence, internally choose exactly one domain for the current scene: `PHYSICAL_REAL_WORLD`, `HISTORICAL_RECONSTRUCTION`, `SCIENTIFIC_CROSS_SECTION_SIMULATION`, `MICROSCOPIC_MOLECULAR`, `SPACE_ORBITAL`, or `ABSTRACT_CONCEPTUAL`. This is scratch reasoning only; do not add a final JSON field.

The shot must **start inside that domain and stay there for the whole 4/6/8-second clip**. Do not hide a transition by writing `drone shot moving into a geological cross-section`, `laboratory becomes a molecular model`, `camera dives from a landscape into the mantle`, or similar. If the correct visual is a geological cross-section, open directly on a geological cross-section and use a virtual/cross-section camera movement within it. A focus pull, reveal, pan, tilt, physical movement, or lighting evolution is fine only when the representational domain and setup remain the same.

## 0.7. Camera Physics & Scale Lock

Camera terminology must remain physically meaningful. Use human-scale rigs (`dolly`, `crane`, `handheld`, `steadicam`, `gimbal`) only for human/architectural distances; `drone/aerial` for exterior atmospheric-scale movement; `orbital` for space; `macro` for specimen-scale; and `virtual camera` / `cross-section camera` for scientific travel impossible for a physical rig. Never ask a crane to rise kilometers, a dolly to travel through the mantle, a drone to fly inside a molecule, or a physical camera to pass through solid material. Camera movement should be achievable within one 8-second beat and must not become a disguised second scene.

## 0.8. Evidence Visualization ≠ Visual Verdict

When narration discusses measurements, surveys, missing evidence, competing interpretations, inferred history, or a model, show **what was observed and the limits of that observation**, not a stronger conclusion invented by the image. `No obvious rectilinear anomalies in the surveyed section` is visually honest; `proof that no structures exist anywhere` is not. A historical or geological reconstruction that is inferred must be phrased as a reconstruction/simulation at the same certainty level as narration. Exact institutions, dates, numbers and causal claims are governed by `14_claim_evidence_lock.md` before script writing.

## 0.9. Positive/Negative Coherence & Typography Reliability

Never positively request an element that `Negative:` forbids. In particular, do not ask Veo to generate an official logo/emblem while also using `logo` in Negative, or precise readable plaque/certificate/interface text while using `text overlay`/`burned-in subtitles` as negatives. Exact formulas, labels, brand marks, institutional emblems, certificates, plaque wording and exact numeric typography belong in post-production. In Veo, generate the **unlabeled physical/graphic structure** (blank plaque, abstract measurement marks, clean unlabeled spectrum, proportional planet spheres) and reserve exact text for the editor.


## 0.5. Anti-drift protocol for long videos — read before starting a Long video

The single biggest quality failure on a multi-chapter Long video is **slow
drift**: by chapter 4 or 5, an agent working scene-by-scene from only local
`context_ref` gradually reinvents a character's face, forgets the fixed
outfit, "upgrades" a location's colors, or loses track of the story's
throughline — none of which trips the schema validator, because every
field is still individually well-formed. This is a continuity failure, not
a format failure, so it must be actively guarded against, not just hoped
against:

1. **Never write a `veo_prompt` from memory of `visual_bible.json`.** Every
   time you write or review a batch of scenes, re-open `visual_bible.json`.
   Copy the **relevant recurring identity anchors** (character/location/
   key-object descriptions) verbatim; apply `visual_style`,
   `lighting_timeline`, and `camera_style` as governing constraints without
   mechanically pasting unrelated entries. Do not rely on what you remember
   having written for that character three chapters ago.
2. **Re-anchor every chapter, not just the first one.** Before writing the
   first `veo_prompt` of *any* chapter (including chapter 1), re-read
   `story_anchor` in full. Before writing the first `veo_prompt` of chapter
   2 onward, also re-read the **last 2–3 scenes of the previous chapter**
   (not just their `continuity_ref` string) so tone, blocking, and lighting
   carry over accurately, not just in summary form.
3. **Carry a running "continuity ledger" while working through a chapter.**
   As you write each scene, mentally (or in scratch notes) track: which
   characters are on screen right now, their exact position/pose/gaze at
   the end of the last scene, the current time-of-day per
   `lighting_timeline`, and the current location. Every new scene's opening
   state must match this ledger exactly before you touch camera/action
   details — if it doesn't match, fix the drift before writing the prompt,
   don't write around it.
4. **Treat any deviation from `visual_bible.json` as a bug, not a style
   choice.** If a scene's needs seem to require a character to look
   different (e.g. injured, aged, changed outfit), that change must be a
   deliberate, explicit entry in `visual_bible.json` stating exactly where
   in the story it happens (per `05_visual_bible_guide.md §"characters"`) —
   never an ad hoc adjustment invented inside a single `veo_prompt`.
5. **Mandatory micro-batch production: 6 scenes by default, never more than 8 before a checkpoint.** After each batch, run `tools/veo_batch_guard.py` and the batch-scoped semantic checker before continuing. Also do one pass rereading the `veo_prompt` text of those scenes side by side
   and confirm every **used recurring identity description** still matches
   `visual_bible.json` word-for-word, temporary state remains continuous,
   and the throughline still matches `story_anchor`. This is cheap (rereading your own recent output) and
   catches drift immediately instead of at final QA when it's expensive to
   fix across dozens of scenes. The exact procedure and resumable progress ledger are in `13_long_job_quality_guard.md`.
6. This protocol is a workflow discipline, not a new output field — it
   doesn't change any schema. It exists purely to keep the guarantee in
   `AGENTS.md §2` (recurring identity is anchored in `visual_bible.json`)
   actually true in practice on long, multi-chapter jobs.

## 1. Source data for writing a prompt

A professional scene prompt must use the scene fields as a **temporal-semantic
stack**, not choose one field and ignore the others:

1. **`voiceover` = local timing window.** These are the words actually spoken
   during this clip. The visual must primarily serve this local beat. Do not
   reveal a later clause early just because it appears elsewhere in the full
   sentence.
2. **`context_ref` = semantic envelope.** Use the full source sentence (or
   merged adjacent sentences) to resolve pronouns, subjects, causes,
   consequences, terminology, and the real meaning of the local fragment.
   `context_ref` prevents a truncated `voiceover` from being misread; it does
   **not** mean every scene sharing that context should visualize the whole
   sentence identically.
3. **`sentence_id` + `part` = progression map.** `sentence_id` groups scenes
   that belong to the same source sentence. `part` tells where this clip sits
   in that sentence's visual progression. Across `1/N → ... → N/N`, reveal or
   emphasize different, logically ordered aspects of the sentence instead of
   repeating one frame. When a splitter chunk straddles two sentences, use
   the actual `voiceover` words plus the joined `context_ref` to decide which
   meaning is active now.
4. **`visual_bible.json` = fixed visual identity.** Reuse only the relevant
   character/location/key-object identity descriptions verbatim, plus the
   global `story_anchor`, `visual_style`, `lighting_timeline`, and
   `camera_style`. Fixed identity comes from the bible; temporary state comes
   from the current action and `continuity_ref`.
5. **`continuity_ref` = previous-shot handoff only.** Read the immediately
   preceding visual state so spatial direction, pose/gaze, motion, weather,
   light, object state, and editorial logic do not reset accidentally. It must **never override the current `voiceover`, plan the next idea, or introduce later content**. Treat any future-content leakage in `continuity_ref` as a blocking semantic error. For every scene after scene 1, write the string in this stable internal format: `Previous end: <only the actual visible end state of scene N-1>. Current opening: <the already-established opening state of scene N>. Editorial relationship: <continuous action | matched conceptual cut | intentional location/time shift>.` Never write `transitioning to...`, `moving into...`, or other wording that asks the new clip itself to perform the editorial transition.
6. **`master_script.txt` = ambiguity resolver.** Consult surrounding text
   when the local stack above still leaves a real ambiguity or when a
   chapter-level cause/effect relation must be preserved. Do not reread the
   whole script mechanically for every scene.
7. **`12_veo_policy_compliance.md` = final safety filter.** It can reframe or
   simplify a visual treatment but must not change what the narration claims.

### Scene fidelity contract — apply before finalizing every prompt

Ask four questions:

1. **Local relevance:** Can I point to the current `voiceover` words that
   justify the main subject/action shown in this prompt?
2. **Full meaning:** Does `context_ref` confirm that I interpreted those
   words correctly?
3. **Progression:** If this is part `x/N`, does it show the appropriate stage
   of the idea instead of repeating what an earlier part already showed or
   previewing a later reveal?
4. **No filler:** If this shot were removed, would the viewer lose a useful
   visual explanation, scale cue, evidence point, emotional consequence, or
   continuity bridge? If not, rewrite it; a beautiful but narration-irrelevant
   shot is still a failed scene.

This contract is the main defense against "cinematic but meaningless" scene
creation. It deliberately uses both `voiceover` **and** `context_ref`: one
provides timing, the other meaning.

## 2. Required principles

1. **Stay true to the current narration beat**: derive the dominant
   subject/action from `voiceover`, resolve it with `context_ref`, and place
   it correctly using `sentence_id` + `part`. Never substitute a generic
   "nice-looking shot" that merely fits the mood, and never visualize the
   entire full sentence identically in every part.
2. **Consistency throughout**: reuse the exact wording from
   `visual_bible.json` — never re-invent appearance/location details. See
   §0.5 above for the full anti-drift discipline on multi-chapter Long
   videos.
3. **Logical editorial continuity**: the scene must flow naturally from
   `continuity_ref`. For continuous action, preserve screen direction,
   subject/object state, pose/gaze, weather, and motivated light. For a
   narration-driven change of time/location/concept, make the cut clearly
   intentional and carry at least one compatible visual anchor (shape,
   motion direction, color/light, scale, or subject concept) when useful.
   Do not force every documentary cut to look like one physically continuous
   take, but never allow an unexplained reset/teleport of recurring state.
4. **No internal transitions in this pipeline**: each `veo_prompt`
   describes **one single continuous shot**. Veo 3.1 can be directed with
   multi-shot/timestamp prompting in other workflows, but this system
   intentionally assigns one JSON scene to one shot for deterministic
   generation and stitching. Therefore do not ask for a cut/transition
   inside the prompt.
   - **Never use transition/multi-shot language** inside a `veo_prompt`,
     including (non-exhaustive): "then," "next," "cuts to," "cut to,"
     "transitions to," "fades to," "dissolves into," "morphs into,"
     "followed by," "after that," "meanwhile," "suddenly switches to," or
     any construction describing two different shots/setups back to back.
   - If describing camera *movement* (dolly forward, pan left, tracking),
     that is fine — a single continuous camera move within one static
     setup is not a transition. What's forbidden is jumping to a **different
     framing, subject, or location** partway through the same prompt.
   - Before finalizing a `veo_prompt`, re-read it and confirm it describes
     only one shot setup from start to end. If the sentence you just wrote
     needs a "then" to make sense, split it: keep only the first
     action/moment in this `veo_prompt`, and if the remaining action is
     essential, that's a signal this `context_ref` needed an additional
     scene at the splitting step (see §6 below) — flag it rather than
     smuggling a second shot into one prompt.
   - This rule is checked automatically by
     `tools/qa_automation.py` (transition-word scan) and manually in
     `07_qa_checklist.md §C`.
5. **Choose `shot_type` based on `part`** (valid values — see the full enum
   in `03_data_schemas.md §4` and the expanded cinematic camera library in
   §2.9 below):
   - `part = 1/N` → prefer `establishing`/`wide`/`aerial`/`crane`/`drone`
     (sets the scene, reveals scale)
   - `part` in the middle → prefer `medium`/`tracking`/`pan`/`handheld`/
     `over-the-shoulder`/`two-shot` (continues the action,
     varies the angle — a **rack focus may be described inside the prompt as a focus operation, but `rack-focus` is not a `shot_type` enum value**; `handheld` fits the on-location documentary feel
     described in `02_content_style.md`)
   - `part = N/N` → prefer `close-up`/`extreme-close-up`/`POV`/`insert`
     (closes the moment, creates momentum into the next sentence)
   - This is a priority suggestion, not a hard rule — the real goal is
     avoiding two consecutive scenes mechanically reusing the same
     `shot_type` (see `07_qa_checklist.md` section C), so pick a different
     enum value if it fits the context better.
6. **Realistic cinematic quality**: always state the lens, lighting, and
   camera movement (pulled from `camera_style` in `visual_bible.json`), and
   high detail — simulating a real documentary camera or a real-world film
   set, not a generic "AI video" look.
7. **Physical/environmental plausibility**: describe only the
   scene-relevant physical behavior that prevents visual nonsense — gravity
   and inertia, contact points, cloth/hair response to wind, water/rain
   direction, shadows from the motivated light source, reflections,
   particles/dust, scale, and cause→effect of the phenomenon. Do not dump a
   physics checklist into every prompt; include the details that matter for
   this shot. For Buddhist historical, ritual, or natural phenomena, prefer evidence-supported behavior over
   dramatic but impossible embellishment.
8. **Never repeat an identical frame** between 2 consecutive scenes sharing
   the same `sentence_id` — each part of the same sentence must show a
   different angle/moment within the same setting.
9. **Always include `negative_keywords`** from `visual_bible.json` at the
   end of the prompt — this must include both the visual-quality keywords
   and the safety keywords required by
   `12_veo_policy_compliance.md §4`. This `Negative:` clause is purely
   visual (watermark, text overlay, cartoonish CGI, policy-safety terms,
   etc.) — it must never mention audio, since §0 rule 2 forbids the topic of
   audio entirely, in both directions.
10. **Stay inside VEO 3.1 / Flow's content policy**: every `veo_prompt` must
   pass the hard boundaries and self-check in
   `12_veo_policy_compliance.md` (no real identifiable people, no
   copyrighted IP, no graphic violence/gore, no sexual content, no
   misleading-as-real depiction of speculative content, etc.) — read that
   file before writing prompts for any scene involving a real person,
   historical disaster, hypothesis/speculation, or intense subject matter.

## 2.9. Camera & lens library — write like a real cinematographer, not a stock-photo caption

Veo 3.1 was trained on real film footage and understands professional
film-language terms far more reliably than plain descriptive English (e.g.
"the camera performs a slow crane shot rising above the canyon" produces a
much more controlled, cinematic result than "a nice view from above"). Vary
these deliberately from scene to scene — never default to the same 2–3
shots out of habit — and always pick the one that actually serves the
the current `voiceover` beat resolved through `context_ref` + `part`, not
just whichever sounds most dramatic. Do not stack mutually conflicting
camera instructions: one framing, one primary angle, one primary movement,
and one lens/focus strategy is normally enough.

**Framing / distance** (expands `shot_type`'s enum — see
`03_data_schemas.md §4` for the full closed list now available):
`extreme wide shot`, `wide shot`, `medium shot`, `medium close-up`,
`close-up`, `extreme close-up`, `two-shot`, `over-the-shoulder`, `insert
shot` (a tight detail cutaway, e.g. hands, an instrument readout).

**Angle**: `eye-level`, `low angle` (subject looms, feels powerful/vast),
`high angle` (subject feels small/vulnerable), `bird's-eye / top-down`,
`worm's-eye` (extreme low, looking straight up), `Dutch/canted angle` (tilted
horizon — tension, disorientation; use sparingly, only where the narration's
mood calls for it).

**Movement**: `static/locked-off`, `slow dolly-in`/`dolly-out`, `tracking
shot` (moving laterally alongside the subject), `pan` (horizontal pivot),
`tilt` (vertical pivot), `whip pan` (fast, blurred pivot — high-energy
transitions of energy within one continuous shot, not a scene cut), `crane
shot` (rises or descends, revealing scale), `arc shot` (camera circles the
subject), `handheld` (natural micro-shake, documentary/on-location feel),
`Steadicam/gimbal` (smooth, floating follow), `dolly zoom` (background
compresses/expands while subject stays framed — disorienting, use only for
a deliberate unease beat), `drone/aerial` (sweeping high-altitude
perspective), `POV` (first-person, from a character's own eyeline).

**Lens & focus** (state a specific focal length, not just "cinematic
lens"): `24mm wide-angle` (expands space, good for establishing/vast
scenes), `35mm` (natural perspective, the channel's general-purpose
default per `camera_style`), `50mm` (neutral, close to human eye), `85mm`
(compresses background, isolates a subject with creamy bokeh — good for
intimate character close-ups), `macro lens` (extreme detail on small
objects/textures). Combine with `shallow depth of field` (subject sharp,
background soft — isolates focus) or `deep focus` (foreground to background
all sharp — good for wide documentary/establishing shots) as the scene
calls for, and `rack focus` when the prompt needs attention to shift from
one focal plane to another within the same continuous shot (this is a focus
change, not a transition — it's allowed under §2.4/§0's "no transitions"
rule as long as it's one uninterrupted take).

**Lighting language** (pulled from `lighting_timeline` +
`camera_style.movement_notes`, but always state it in concrete cinematic
terms rather than vaguely): `golden hour`, `blue hour`, `Rembrandt lighting`
(triangle of light under one eye — classic dramatic portrait light),
`practical light` (light sourced from an in-frame object — a lamp, a
monitor, a window), `hard light`/`soft light`, `backlight/rim light`, `lens
flare`, `volumetric light`/`god rays` (visible light shafts through
dust/fog).

Do not treat this list as boxes to tick every time — pick the 2–4 terms
(framing + angle + movement + lens, at minimum) that genuinely fit this
scene's current `voiceover` beat, resolved by `context_ref` + `part`, and
`shot_type`, and state them precisely.
Precision, not exhaustiveness, is what makes the prompt read as
professional cinematography instead of a checklist.

For anti-repetition rules and movement variety requirements per batch, see
`references/camera_variety_guide.md`. The batch guard (`veo_batch_guard.py`)
enforces minimum movement diversity and blocks consecutive identical
camera movements. Variety is not optional decoration — it is a hard
quality requirement.

## 3. Standard structure of a `veo_prompt`

Use a compact order aligned with professional shot direction:

```
[Cinematography: one framing + angle + primary movement + lens/focus]
+ [Relevant subject identity anchor copied verbatim from visual_bible]
+ [Current visual action/beat derived from voiceover, resolved by context_ref
   and positioned by sentence_id + part; one dominant beat ≤8 seconds]
+ [Context/environment: only the relevant location/object bible anchors]
+ [Continuity handoff: preserve only previous visible state that remains relevant; never import future narrative content]
+ [Micro-action arc inside the same uninterrupted take: clear opening state → one dominant action/process → explicit end-frame state, with no cut or setup change]
+ [Physical/environmental behavior: weather, atmosphere, motion, contact,
   scale, shadows/reflections/particles only where relevant]
+ [Lighting/time/color grade matching lighting_timeline + visual_style]
+ [Global style anchor: include `visual_style.film_look` verbatim exactly once; add the relevant color-grade instruction and a concrete lens/focus choice]
+ [Style/quality: physically plausible cinematic documentary realism, material texture, optical depth, controlled detail]
+ [Negative: relevant negative_keywords — visual-quality + policy-safety only]
```

### Prompt budget priority (when approaching 4,000 characters)

Keep information in this order of importance:

1. current narration beat and factual/visual correctness;
2. recurring identity anchors from `visual_bible.json`;
3. continuity/state that prevents a visible jump;
4. cinematography and motivated lighting;
5. physically relevant weather/phenomenon behavior;
6. style/quality wording;
7. `Negative:` safety/quality constraints.

Remove duplicate adjectives, repeated global-style phrases, and irrelevant
bible entries first. Do **not** remove items 1–4 or required policy safety to
meet the limit.

Written entirely in English (§0 rule 1), regardless of the video's `language`.
No audio/dialogue/sound instruction appears because of this project's
visual-only prompt contract (§0 rule 2).

## 4. Worked example (abridged)

Suppose the current narration is about noticing anger before reacting. The visual bible establishes an anonymous lay visitor, an anonymous elderly monk, and a quiet monastery courtyard. For a scene at `part = 1/2`, keep the current narration subject and the same physical setup rather than inventing a second location or a symbolic transformation.

> Create exactly one uninterrupted continuous shot in one visual setup for the entire clip. Cinematic medium-wide shot beneath a mature bodhi tree in a weathered monastery courtyard at soft morning light, an anonymous generic lay visitor seated near a small bronze meditation bell while an elderly generic monk remains several feet away, both with natural proportions and restrained expressions. The camera performs one slow 50mm lateral track in the same physical setup, preserving screen direction and the visitor as the current narration subject. Warm light filters through leaves and moves subtly across realistic robe, linen, stone, and bronze surfaces. The visitor's fingers gradually unclench while the monk remains quietly attentive; no second action, new location, flashback, or symbolic transformation appears. The shot ends with the visitor's hand fully relaxed beside the bell. Negative: no watermark, no text overlay, no logo, no childish cartoon style, no chibi proportions, no oversized cartoon eyes, no anime exaggeration, no toy-like plastic CGI, no real identifiable people, no celebrity likeness, no graphic violence, no gore, no nudity, no sexual content, no hate symbols.

**Bad:** one prompt starts in the courtyard, then enters a meditation hall, then changes into a glowing lotus universe. That is multiple setups and an internal transition.

**Good:** Scene A stays entirely in the courtyard. Scene B may move to a meditation hall only when the current narration itself changes setting. Scene C may use a symbolic visual only when the current narration explicitly introduces an allegory or abstract concept. Every scene still remains one uninterrupted visual setup.

## 6. A note on how much action fits in one prompt

Never pack multiple distinct narrative actions into one `veo_prompt`
(e.g. walking into a room, sitting down, and picking up an object as three
sequential beats). In this project, each scene maps to one continuous
4/6/8-second shot. A dominant action may include subordinate natural motion
that belongs to the same instant. If the local `voiceover` + `context_ref`
really require multiple essential beats, flag the scene-design conflict;
do not silently invent an internal edit or an extra scene outside the hard
word-splitting rule.

## 7. Writing at production detail under the 4,000-character ceiling

Every final `veo_prompt` must be **900–4,000 Unicode characters** (§0 rule 3), and the positive visual body before `Negative:` must itself contain **at least 800 useful characters**. The floor exists only to prevent under-specified, lazy scene briefs; Negative boilerplate never counts toward visual richness and the rule is not permission to add fluff. Typical V9 production prompts should normally land around **900–1,500 characters** when that fully specifies the shot, while unusually simple shots may stay closer to the floor and complex historical/recurring environments may approach the ceiling. The skill is selecting the details that materially control the shot.


- **Mandatory global look anchor.** Include `visual_style.film_look` verbatim exactly once in every prompt. Do not duplicate it elsewhere. Use the relevant `color_grading`, `lighting_timeline`, and a concrete focal length/focus strategy so independently generated clips still look like the same film.
- **Micro-action, not a moving still.** Even a static composition needs visible temporal behavior appropriate to the subject: natural rotation, drifting cloud layers, breathing, hand movement, instrument response, water flow, changing shadow/reflection, particle motion, or a controlled camera move. Describe one dominant action and the shot's end-frame state. Do not invent extra events merely to create motion.
- **Avoid generated readable text.** Do not ask Veo to render exact captions, formulas, labels, dates, statistics, UI copy, or long readable screen text. Prefer unlabelled objects, readable-by-shape symbolic compositions, physical demonstrations, or abstract non-textual patterns; exact typography belongs in post-production.
- **No canonical-anchor duplication.** A character/location/object canonical description and the global `film_look` anchor appear at most once per prompt. Repetition wastes budget and can overweight identity at the expense of action.
- **Every clause must earn its place.** Prefer observable nouns/verbs,
  measurable spatial relations, real materials, motivated light, and exact
  movement over adjective stacks.
- **Current beat before decoration.** If the action cannot be summarized in
  one clear sentence that matches the local `voiceover`, the prompt is not
  ready for cinematography detail yet.
- **Use canonical identity anchors, not repeated prose.** Copy only relevant
  visual-bible entries verbatim. Global film-look language belongs once near
  the end, not repeated inside every subject/location clause.
- **Describe causality when it prevents nonsense.** For fire, dust, rain,
  water, debris, orbital motion, machinery, cloth, hair, shadows, reflections,
  or other dynamic elements, state the relevant direction/source/result.
- **Preserve screen logic across adjacent clips.** When the same subject or
  moving object continues, maintain left/right travel, gaze, pose, camera
  height, light direction, and environmental state unless narration motivates
  a change.
- **Do not mechanically maximize detail.** A simple insert shot may be
  excellent near the lower production range; a complex recurring environment may need
  much more. The ceiling is a safety boundary, not a quality target.
- **Compression order when over 4,000:** remove duplicate adjectives → merge
  repeated style phrases → remove irrelevant background detail → shorten
  non-identity location prose while retaining the exact canonical anchor →
  simplify secondary micro-motion. Never delete the current beat, necessary
  identity anchors, essential continuity, or required safety constraints.
- **Final exact check:** after composing the complete string including the
  `Negative:` clause, verify `len(veo_prompt) <= 4000`. This is also enforced
  by `chapter.schema.json` / `schema_validator.py` and
  `tools/qa_automation.py`.

The result should read like a concise shot brief from a cinematographer and
VFX supervisor: one clear beat, one clear camera idea, physically coherent
motion/light/weather, stable identity, and no detail that exists only to make
the prompt longer.

### Production detail allocation (anti-laziness)

Do not interpret the 800-positive-character floor as the target. For Long documentary scenes, a healthy **positive body** commonly lands around **1,000–2,000 useful characters**, with especially complex recurring environments, historical reconstructions, or subtle human interactions often reaching **1,300–2,400** while still staying concise. Simple inserts may be shorter but still must clear the hard floor. Spend detail budget in this order:

1. exact current visual claim and epistemic status;
2. canonical recurring identity/location/object anchor(s);
3. opening spatial composition and screen direction;
4. one dominant action with 0–8s temporal evolution;
5. material/physics/contact/fluid/particle behavior relevant to the claim;
6. environment/weather/scale cues that prevent visual nonsense;
7. motivated lighting and color grade;
8. focal length, focus strategy, camera height/axis and one physically plausible move;
9. explicit end-frame state linked to the next handoff;
10. exact global film-look anchor once, then the Negative clause.

If the prompt is short because one or more of these controlling dimensions was omitted, it is under-directed. If it is long because the same adjective/identity/style phrase is repeated, it is padded.

## 8. V9 strict-scene absolute scene lock

### 8.1 Exact prompt opening

Every final `veo_prompt` must begin verbatim with:

`Create exactly one uninterrupted continuous shot in one visual setup for the entire clip.`

Do not place cinematography words before this sentence. It is a deterministic contract checked by both the batch guard and final QA.

### 8.2 Exact no-internal-edit Negative lock

Inside the `Negative:` clause include this exact comma-separated sequence:

`internal cuts, scene transitions, fades, dissolves, morph transitions, montage, time jumps, location changes, visual-domain changes`

Transition words are allowed only in the Negative clause to prohibit them. Positive visual direction must never schedule a cut, fade, dissolve, crossfade, wipe, morph, montage, flashback, time jump, location jump, domain change, second setup, or second shot. Avoid sequencing words such as `then`, `next`, `followed by`, `meanwhile`, and `later`; write one continuously evolving action instead.

### 8.3 Named Subject Lock

For scene N, derive `CURRENT_SUBJECTS` from the words actually spoken in scene N. If a named subject appears there, it must remain the primary visual subject. Never swap one named sutra/story/person/place→another, one monk/layperson→another recurring identity, one temple/site→another, or one teaching→a different teaching. `context_ref` may only resolve pronouns/anaphora to an already-established subject. If the current line compares multiple named subjects, show only those explicitly justified by the current words.

### 8.4 Future Subject Lock

Read future scene metadata only as a **forbidden-content boundary**. Do not use future rows as inspiration. A subject, conclusion, mechanism, location, evidence result, or reveal first introduced in N+1 or later cannot be identifiable in scene N. Silhouette/teaser treatment still counts as leakage if it effectively reveals the future subject.

### 8.5 Scientific time-scale lock

A 4/6/8-second documentary shot must respect the observable time scale. Galaxies, galaxy clusters, cosmological expansion, stellar evolution, geological drift, and long orbital changes should not visibly race unless the current narration explicitly says the visualization is time-compressed. When real change would be imperceptible, create cinematic motion through camera movement, parallax, focus, local dust/plasma/atmosphere, light behavior, or nearby particles rather than falsifying the underlying process.

When time compression is editorially justified, state it explicitly as a `time-compressed symbolic or historical visualization` and keep the representation in one continuous visual domain/setup.

### 8.6 Exact-count reliability lock

Do not ask Veo to render an individually countable large set such as `109 miniature Earth spheres`, `760 planets`, or `1,300 stars`. Generative video is not a reliable exact-count compositor. Show a representative scale comparison or continuous geometry and add exact numerals/count graphics in CapCut/After Effects/post. The deterministic gate blocks obvious large exact-count rendering instructions.

### 8.7 Boundary between clips

A transition between scene N and N+1 is an **editing decision**, not a Veo action. `continuity_ref` may say `matched conceptual cut` as metadata, but neither scene's `veo_prompt` may ask Veo to perform that cut. Each exported clip must stand alone as one clean take so the editor controls all joins later.


## V9 semantic-bridge rule for hard word boundaries

The fixed word split remains unchanged. If one scene window contains the tail of one sentence and the opening of another, **do not translate that into two visual setups**. Select one dominant visible beat from the actual `voiceover` window and design a bridge-compatible continuous action/setup that stays truthful throughout the clip. `context_ref` may resolve pronouns/meaning, but it cannot authorize future visuals. If no honest single setup can cover the mixed window, flag a scene-design conflict for editorial review; never solve it with an in-clip cut, morph, time jump, or second location.

V9 efficiency principle: the 800-positive-character floor prevents under-specification; it is not a target for verbosity. Prefer one precise camera/lens/focus plan, one motivated lighting description, scene-specific physical behavior, relevant identity anchors, and a concrete end frame. Remove synonymous adjectives and repeated global boilerplate beyond the exact required anchors.
