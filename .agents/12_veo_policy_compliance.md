# 12 — VEO 3.1 / Google Flow Content-Policy Compliance for `veo_prompt`

> Read this file together with `06_veo_prompt_guide.md`. That file defines
> **how** to write a good `veo_prompt`; this file defines this project's
> **conservative safety envelope** for prompts submitted to Veo 3.1 / Flow.
> It intentionally stays narrower than the broadest content the product may
> technically support, because production reliability matters more than
> testing filter boundaries. A prompt that falls outside this envelope is not
> finished — treat it exactly like a schema fail: stop and simplify the
> visual treatment before moving on.

## 1. Why this matters for this project

Every `veo_prompt` is submitted to Veo 3.1 through Google Flow, where
Google applies safety protections and may decline some requests. The exact
filtering implementation, thresholds, regional behavior, model behavior,
and credit treatment can change, so this project must **not** encode guesses
about hidden filter stages as if they were stable API guarantees.

Because this project's channel is Buddhist content about dharma teachings,
historical figures, sacred sites, meditation, and contemplative philosophy,
some natural topics can be religiously sensitive. The rules below are
therefore deliberately conservative production rules designed to reduce
avoidable rejections and maintain respectfulness **without watering down
authentic dharma content in `master_script.txt`**. When a project rule is
stricter than Google's public policy wording, treat it as a reliability
choice for this pipeline, not as a claim that Google universally forbids
every such case.

## 2. Project safety boundaries — never cross these in a `veo_prompt`

1. **No real, named, identifiable people.** Never generate a photorealistic
   likeness of a real person by name — no living or historical named
   individual (scientists, celebrities, politicians, victims of a real
   event), even if `master_script.txt` names them in narration. If the
   script mentions a real person (e.g. "Dr. Stephen Hawking said..."),
   the corresponding `veo_prompt` must depict an **unnamed, generic**
   representative figure instead (e.g. "an elderly male physicist,
   generic/anonymized appearance, wheelchair-seated silhouette, no
   identifiable resemblance to any real individual") — never their actual
   likeness, name, or distinguishing real features. This matches the
   existing `visual_bible.json` convention already used for "Tiến sĩ
   Nguyễn Văn A"-style figures (`05_visual_bible_guide.md §3
   characters`) — every human character in `visual_bible.json` must be
   written as a fictional/generic persona from the start, never as a real
   named person.
2. **No copyrighted characters or branded IP.** No franchise characters, logos, trademarked product designs, recognizable branded uniforms, or real institutional emblems. For Buddhist settings, do not request a real temple/organization logo or copyrighted insignia; describe generic architecture, robes, ritual objects, and unbranded clothing instead.
3. **No graphic depiction of suffering.** While Buddhism discusses suffering
   (dukkha), visual depictions must stay at the level of **emotional/
   environmental context** (weary travelers, empty bowls, weathered faces,
   storm-battered landscapes), never close-up injury, blood, corpses, or
   active torture. Historical persecution/hardship scenes should show
   environmental aftermath or silhouettes, not graphic detail.
4. **No sexual or suggestive content**, no nudity, no sexualized framing of
   any character, regardless of age.
5. **No hate speech, extremist symbols, or derogatory depiction** of any
   real or fictional group, including any Buddhist tradition or sect.
6. **No self-harm, suicide, or medical-harm imagery.** Ascetic practices
   must not be depicted as self-harm.
7. **No content that could pass as misleading.** Contemplative/reflective
   scenes (per `mode = "1"`) must read as clearly illustrative/symbolic
   in the prompt itself — add framing language such as "symbolic
   visualization," "contemplative scene," or "artistic interpretation"
   for anything depicting an abstract concept. The same rule applies to
   historical claims: show period-appropriate reconstruction, not a scene
   claiming to be actual footage of ancient events.
8. **Respectful depiction of religious content.**
   - Buddha figures: generic meditating figure or golden silhouette, no
     specific statue reproduction, no disrespectful positioning
   - Temples/pagodas: generic architecture, no specific identifiable
     real temple unless the topic specifically discusses it historically
   - Religious rituals: depict with reverence, no mocking or satirical
     framing, no combining Buddhist imagery with non-Buddhist contexts
     in ways that could be seen as disrespectful
   - Sacred texts: may show generic scrolls/books, no readable specific
     text (add typography in post)
9. **Do not request audio, sound effects, speech, voice, lip-sync, or
   dialogue in `veo_prompt`.** This is a **project-level pipeline rule**.
   not a claim that Veo 3.1 lacks native audio capability. Narration/TTS is
   mixed separately, so the video prompt stays visually deterministic and
   avoids accidental speech competing with the final voice track. If a
   person is visible, describe only the visual performance needed by the
   scene (gaze, breathing, hand gesture, posture); do not ask them to say
   lines or imitate any person's voice.

If the topic genuinely requires content that would cross one of these
lines to tell the story accurately, do not attempt to "sneak" it through
with euphemisms — flag it explicitly during scene review and simplify the
visual treatment instead of the facts in `master_script.txt`. Do not invent
an undeclared `error` field in `database/history.json`; that database is only
updated after a completed task passes QA.

## 3. Wording checklist — safe rewrite patterns

Safety systems can be conservative around sensitive subject matter. When a
scene is inherently intense (impact, explosion, collapse, war, death,
weapon), use a neutral/technical/documentary register and describe only the
visual information the story genuinely needs, rather than trying to guess or
"game" hidden trigger-word thresholds:

| Instead of… | Prefer… |
|---|---|
| "the actual Buddha sitting under the Bodhi tree" | "a generic meditating figure in saffron robes beneath a large ficus tree, symbolic scene" |
| "Thích Nhất Hạnh teaching" | "an elderly Vietnamese monk in brown robes, generic appearance, not modeled on any specific real individual" |
| "a real Thai temple Wat Phra Kaew" | "a generic Southeast Asian Buddhist temple with gilded spires, no identifiable real temple" |
| "suffering and death of sentient beings" | "weary travelers on a dusty path, faces showing contemplation, no injury detail" |
| "ancient battle scene" | "distant view of dust clouds rising over a historical landscape, no visible combat" |
| depicting a teaching as literal historical footage | "symbolic visualization," "contemplative artistic scene," "period-appropriate reconstruction" |

This table is a starting point, not exhaustive — apply the same
respectful/generic instinct to any other religiously sensitive subject matter.

## 4. Required negative keywords for policy safety

In addition to the visual-quality negative keywords already required by
`05_visual_bible_guide.md §"negative_keywords"` (watermark, text overlay,
logo, cartoonish CGI, etc.), every `visual_bible.json` must also include
these safety-oriented negative keywords, and every `veo_prompt`'s
`Negative:` clause must carry them through:

```
no real identifiable people, no celebrity likeness, no graphic violence,
no gore, no nudity, no sexual content, no hate symbols
```

## 5. Self-check before finalizing a `veo_prompt`

Before marking a scene's `veo_prompt` done, re-read it and confirm:

- [ ] No real person is named or described with identifiable real features
      (only generic/anonymized descriptors are used for humans)
- [ ] No copyrighted character, logo, or branded product design appears
- [ ] Any disaster/violence content stays at environmental/scale level,
      with no injury/gore detail
- [ ] Any speculative/hypothesis content is explicitly framed as
      simulated/conceptual, not literal documentary footage
- [ ] No sexual, suggestive, hateful, or self-harm content
- [ ] No audio/sound/dialogue/narration/music/silence wording appears anywhere in the prompt; the prompt is visual-only
- [ ] The `Negative:` clause includes both the visual-quality keywords
      (from `visual_bible.json`) and the safety keywords from §4 above

This check is part of `07_qa_checklist.md §G` — see that file for the
consolidated pre-completion checklist item.
