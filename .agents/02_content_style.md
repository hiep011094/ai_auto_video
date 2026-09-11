# 02 — Content Direction & Voice Style

## 1. Channel theme

The channel **ĐƯỜNG VỀ TỈNH THỨC** has exactly two content pillars:
**Phật pháp sống** and **Trí tuệ Phật giáo**. Topics may involve Buddhist
philosophy applied to daily life, meditation, mindfulness, Buddhist stories
with life lessons, Buddhist history, sacred sites, or accessible explanation
of sutras and dharma. Every topic must clearly belong to one of these two
pillars.

The channel promise is **trí tuệ với sự nhẹ nhàng**: every video should feel
calming, insightful, and easy to follow while keeping a clearly audible
boundary between what is taught in canonical texts, what is historical record,
and what is personal reflection or interpretation.

The default audience is a **curious Vietnamese viewer seeking inner peace and
practical wisdom, with no prerequisite Buddhist knowledge**. The script may be
deep and thoughtful, but it must never require the listener to already know
Buddhist terminology or doctrine to follow along.

## 2. Overall visual/narrative style

Serene cinematic documentary — contemplative, warm, grounded in nature and
temple aesthetics, as if a mindful documentary crew captured the scene with
reverence. **Strictly avoid**: flashy effects, dramatic horror-style lighting,
sensationalist editing, cartoon/animated style, generic stock-footage
narration, empty spiritual clichés, or abstract prose that gives the scene
generator nothing concrete to depict.

A strong script must do three jobs at once:

1. **Narrative job** — create curiosity through questions about life, gentle
   revelation of wisdom, relatable human situations, and a satisfying insight.
2. **Explanation job** — make the listener understand the complete chain of
   meaning, not merely hear a sequence of impressive quotes.
3. **Visual job** — continuously supply concrete subjects: temple courtyards,
   monks walking at dawn, lotus ponds, mountain paths, candlelit meditation
   halls, historical sites, natural landscapes — that can become meaningful
   4/6/8-second contemplative shots.

## 3. Voice style: `contemplative`

### 3.1. `contemplative` — used when `language = vi`

The intended tone is **contemplative documentary narration with gentle warmth**
— like a wise friend sharing insight over a cup of tea.

- Calm, measured, and easy to understand without sounding preachy, mechanical,
  or overly solemn.
- Colloquial Vietnamese is allowed when it makes Buddhist concepts accessible;
  prefer "hiểu đơn giản là..." over Sanskrit/Pali jargon without explanation.
- Use relatable analogies from everyday life (water, trees, breath, seasons)
  to make abstract concepts tangible; analogies must not distort the teaching.
- Prefer shorter sentences around key insights, then normal-length explanatory
  sentences when reasoning or context is needed.
- Allow natural pauses between major ideas — the listener needs time to
  absorb, not just hear.
- Do not make every line sound like a spiritual quote. Strong teachings
  normally need no extra reaction adjective.
- Avoid forced mysticism, repeated catchphrases, adjective stacks, fake
  urgency, and humor that undermines a serious contemplative moment.
- End with gentle opening rather than aggressive call-to-action. Prefer
  "Mời bạn dành vài phút lắng lại với chính mình" over "Nhấn subscribe ngay!"

## 4. Message-first editorial architecture

Before final prose, create the runtime Editorial Message Lock defined in
`17_editorial_message_lock.md`. The final narration must be able to answer:

- **Central question:** What single question about life/dharma is this video
  answering?
- **Core message:** What one insight should remain in the viewer's mind?
- **Viewer value:** What will the viewer understand after watching that they
  did not understand before?
- **Evidence path:** What teachings, stories, or historical facts earn that
  conclusion?
- **Epistemic boundary:** What is canonical teaching, what is historical
  record, and what is interpretation/reflection?
- **Ending takeaway:** What final insight resolves the opening promise?

This is not extra viewer-facing metadata. It is a runtime writing lock that
prevents a technically correct script from becoming a quote dump.

## 5. Professional narrative architecture

The exact wording varies by topic, but the script should normally follow this
logic without adding new final-output fields.

### Channel visual-language lock

The default image language for **ĐƯỜNG VỀ TỈNH THỨC** is **premium cinematic Buddhist visual storytelling with mature semi-realistic 3D rendering**, not child-oriented cartoon animation. Human proportions, facial expressions, fabric, architecture, vegetation, fire, water, smoke, and light should feel physically grounded and emotionally restrained. Use scene-appropriate color palettes from `references/color_palette_system.md` instead of a universal warm-amber directive. Camera motion is slow and intentional; expressions are subtle; sacred settings are treated respectfully.

Avoid childish chibi proportions, oversized cartoon eyes, slapstick motion, anime exaggeration, toy-like plastic surfaces, glossy game-CGI, flat 2D illustration, neon fantasy palettes, or cute preschool aesthetics. A stylized painterly moment is allowed only when the narration explicitly calls for allegory or metaphor, and it must still remain mature and contemplative.

Do not force the Buddha, a statue, lotus, temple, monk, or incense into every scene. Visual variety should come from the narration itself: ordinary people, family life, work, solitude, nature, village paths, rain, rivers, lamps, empty rooms, mindful gestures, historical settings, and symbolic natural details are all valid when they faithfully illustrate the current sentence.

### Material/texture authority for semi-realistic 3D

The channel's 3D style renders materials at a mature, physically plausible
level — never toy-like gloss, flat shader, or game-engine defaults:

| Material | Required rendering quality |
|---|---|
| Human skin | Subsurface scattering warmth, subtle pore texture, age-appropriate wear, natural oil sheen under warm light; never plastic/waxy |
| Monastic robes | Visible thread weave, natural drape weight, wrinkle folds at joints/lap, slight fabric transparency at thin edges under backlight |
| Stone/brick | Weathered granularity, moss/lichen in damp areas, shadow catch in mortar lines, warm absorption of ambient light |
| Wood (teak/timber) | Visible grain direction, age patina, subtle warp/crack at dry areas, warm amber absorption |
| Water (pond/river) | Translucent depth gradient, surface micro-ripple, reflection of nearby objects/sky at correct angle, subsurface scatter of light |
| Metal (bell/bowl) | Aged patina with irregular oxidation, accurate reflection softened by surface age, resonant-looking mass |
| Fire/flame (lamp/candle) | Warm core gradient (blue-white → orange → amber tip), visible heat shimmer, natural flicker micro-motion, cast shadow dance |
| Foliage/vegetation | Individual leaf geometry at close range, translucent vein structure in backlight, natural irregular growth, species-appropriate shape |
| Smoke/incense | Wispy laminar flow near source, turbulent breakup above 30cm, volumetric light scatter, physically thin density |

These material descriptions are **authoritative style anchors**: when writing
a `veo_prompt` involving any of these materials, include enough of the
relevant descriptors to prevent Veo from defaulting to a generic, flat, or
cartoon rendering. Copy relevant material keywords into the prompt, not the
entire table.

### Buddhist terminology consistency

When the script introduces Pali/Sanskrit terms, reference
`references/buddhist_glossary.md` to use the channel-standard Vietnamese
explanation. The same term must receive the same core explanation across all
videos. For canonical text attribution, reference
`references/canonical_texts_reference.md` to verify which textual tradition
a teaching belongs to and use the correct attribution language.


### 5.1. Short video

A Short is a **complete miniature insight**, not a teaser that withholds
the central lesson:

1. **Hook / question (opening ~10%)** — a relatable life question, surprising
   teaching, or concrete in-scene moment.
2. **Orientation / promise (~10–25%)** — identify the teaching/story quickly
   and make clear what the viewer is about to understand.
3. **Development / wisdom (~25–75%)** — 2–4 compact revelations in logical
   order; each adds new understanding.
4. **Payoff (~75–95%)** — answer the central question with the teaching's
   insight; do not sacrifice the explanatory bridge just to fit another quote.
5. **Exit beat (~95–100%)** — one memorable implication tied to the core
   message, gently opening rather than closing.

When the character budget is tight, remove secondary quotes before removing the
`why/how/therefore` link that lets the listener understand the main point.

### 5.2. Long video

Build one coherent contemplative journey rather than a list of quotes:

1. Cold open / hook.
2. Central question and viewer promise.
3. Necessary context only — placed immediately before the viewer needs it.
4. Teaching/story/history blocks in deliberate order, e.g. question → teaching
   → story illustration → deeper layer → practical application.
5. Gentle resets at natural section boundaries: a new angle, a story shift,
   a practical application, or a deeper question.
6. Include respectful acknowledgment of different Buddhist traditions or
   interpretations where relevant — never present one school's view as the
   only truth when others exist.
7. Synthesis/payoff: explain what the teaching actually means for daily life.
8. Closing insight that returns to the opening at a deeper level and leaves
   the core message in fresh wording.

Every chapter must advance the same central insight. If removing a paragraph
does not reduce understanding, depth, connection, or payoff, remove/rewrite
it. **LONG must exceed 60,000 Unicode characters and has no upper ceiling.**
Use **65,000+** as the normal working target, but let the final length continue
as far as truthful, useful explanation requires. The minimum is a format floor,
not a filler quota: never repeat ideas, quotations, morals, examples, or
transitions just to gain characters. If a proposed topic is naturally too
compact to support >60,000 useful characters, broaden its legitimate scope or
select a richer topic/angle before writing. A genuine long-form topic should
keep developing context, source provenance, nuance, examples, practical
application, and synthesis until both the depth requirement and the >60k floor
are satisfied.

## 6. Complete-thought rule: WHAT → WHY → HOW → WHY IT MATTERS

The full script must transmit the whole idea to the listener. For each major
teaching point, include the links that are actually relevant:

1. **WHAT** — What is the teaching / what happened in the story?
2. **WHY** — Why does this teaching exist? What human suffering or confusion
   does it address?
3. **HOW** — How does one apply it? What does it look like in daily life?
4. **WHY IT MATTERS** — What changes in the listener's understanding, or what
   practical benefit follows?

Not every sentence needs all four. But a major point is incomplete if the
script gives a beautiful quote and then jumps away before the listener knows
why it matters or how it connects to the central question.

## 7. Natural spoken-narration rules

Write for the ear rather than for a dense dharma talk.

- **One sentence = one primary communicative job.** Split sentences that try to
  define, explain, compare, qualify, and conclude all at once.
- Vietnamese: most sentences should land around **12–30 whitespace words**;
  31–45 words is acceptable occasionally for explanation. Repeated 45+ word
  sentences make narration sound written rather than spoken. 55+ words should
  be exceptional and normally rewritten.
- Put the subject early. Do not make the listener wait through several clauses
  to discover what the sentence is about.
- After a Pali/Sanskrit term, immediately give a plain-language Vietnamese
  explanation when a general viewer would not already know it.
- Explain the concept first, then use **one** grounded analogy from everyday
  life. The analogy must never replace the actual teaching.
- Vary cadence intentionally: short insight → normal explanation → concrete
  example/story. Avoid a whole paragraph of 40–60 word sentences.
- Keep pronoun references explicit. Ambiguous `nó/điều này` causes both
  listener confusion and scene-generation drift.
- Use causal connectors only when the causal/logical relationship is genuine.
- Prefer concrete verbs and nouns over adjective stacks. `Vị sư lặng lẽ đặt
  bát cơm xuống` carries more meaning than `một cảnh tượng vô cùng thanh
  tịnh và an yên`.

## 8. Hype-density and repetition control

A contemplative script creates depth through the subject itself.

- Avoid repeatedly leaning on `vô cùng`, `tuyệt diệu`, `kỳ diệu`, `nhiệm
  màu`, `vi diệu`, `thâm sâu`, `vĩ đại`, `phi thường`, `bất khả tư nghì`,
  or equivalent reaction words.
- Never reuse one spiritual superlative more than twice in the script.
- Long narration should normally stay under ~5 spiritual superlatives per
  1,000 words — even lower than science documentary density.
- A Short may use a few stronger words because it is compressed, but not one
  dramatic modifier on every insight.
- If the teaching, story, or historical fact is already moving, state it
  cleanly and let it do the work.
- Avoid repeated filler bridges such as `nhưng câu chuyện chưa dừng lại ở
  đó` / `và điều kỳ diệu tiếp theo là`. A bridge earns its place only when
  the next point genuinely deepens the understanding.
- Avoid repeating the same teaching in different wording merely to inflate
  length.

## 9. Retention without clickbait

- Open loops must be paid off later.
- Each insight should answer a prior question or create a **more specific**
  next question.
- Escalation should increase **depth, specificity, practical relevance, or
  emotional resonance**, not merely adjective intensity.
- After a deep teaching, use a concrete story, example, or practical
  application to reset attention.
- Do not overuse rhetorical questions. Questions create curiosity; answers
  create satisfaction.
- The final 10–15% of a Long should synthesize, not suddenly introduce a large
  unrelated branch.
- The ending must resolve the video's central promise, even when the truthful
  answer is nuanced or the teaching points to ongoing practice.

## 10. Epistemic accuracy — claim strength must match source

Never silently convert:

- one school's interpretation → universal Buddhist truth;
- later commentary/tradition → direct words of the historical Buddha;
- folk belief/superstition → canonical Buddhist teaching;
- metaphorical/allegorical language → literal historical claim;
- preliminary archaeological finding → established historical fact;
- personal reflection → authoritative dharma teaching.

For uncertainty or interpretation, use concise natural qualifiers close to the
claim (`theo kinh… / truyền thống… cho rằng / một cách hiểu phổ biến là /
các nhà sử học ghi nhận / đây là lời dạy được ghi lại trong…`). Never put
the qualifier several sentences later after an absolute statement has already
misled the viewer.

| `mode` | Direction |
|---|---|
| `1` — Chiêm nghiệm | Present the content as a contemplative reflection, life lesson, or practical application of dharma. Clearly separate canonical teaching from personal interpretation/modern application. Use "theo lời Phật dạy" for canonical, "có thể hiểu rằng" for interpretation. |
| `2` — Kiến thức | Base the script on canonical texts, historical records, or verified scholarly research. Verify sutra references, historical dates, place names, and attribution accuracy. A canonical quote may be stated directly, but interpretive conclusions still require their own justification. |

### Mode selection decision tree

When a topic could belong to either mode, use this decision tree:

```
START → Does the script's central question primarily ask
        "How can I apply this to my life?"
        │
        ├── YES → Is the answer grounded in a specific canonical
        │         teaching/sutra that needs accurate attribution?
        │         │
        │         ├── YES → Mode 2 with life-application framing
        │         │         (canonical + practical)
        │         │
        │         └── NO  → Mode 1 (contemplative/reflection)
        │
        └── NO  → Does the script primarily narrate a historical
                  event, person, place, or canonical text?
                  │
                  ├── YES → Mode 2 (knowledge/historical)
                  │
                  └── NO  → Does it explore a philosophical concept
                            with multiple Buddhist traditions' views?
                            │
                            ├── YES → Mode 2 (knowledge/comparative)
                            │
                            └── NO  → Mode 1 (contemplative/reflection)
```

**Practical boundary rule:** When uncertain, choose Mode 2 — its stronger
evidence requirements can only improve the script. A Mode 2 script can
include contemplative passages; a Mode 1 script cannot include unverified
factual claims.

**Blended topics:** A video about "Kinh Pháp Cú — bài học sống" is Mode 2
(because it attributes teachings to a specific canonical text) even though
it applies the teaching to daily life. The mode defines the evidence
standard, not the tone.

For teachings attributed to the Buddha, distinguish between **Pali Canon /
early texts** and **later Mahayana sutras / commentary tradition** so the
viewer understands the textual provenance. Use `references/canonical_texts_reference.md`
for accurate attribution.

`14_claim_evidence_lock.md` is the source/claim enforcement layer; the
Editorial Message Lock complements it and never replaces it.

## 11. Script-to-scene readiness gate

Before `master_script.txt` is accepted, read it once specifically as a future
scene plan:

- Can nearly every sentence produce a meaningful visual beat rather than a
  generic filler shot?
- Do adjacent sentences progress logically enough that their clips can be cut
  together without arbitrary location/time jumps?
- When the topic requires a deliberate jump (e.g. temple → historical site →
  modern life), is that shift clearly motivated by the narration?
- Are recurring elements (monks, temples, nature scenes, meditation postures)
  described consistently enough to build one `visual_bible.json`?
- Does the script avoid long stretches of purely abstract commentary with no
  visualizable subject/process?

If not, rewrite the narration **before** scene splitting. Do not rely on
`veo_prompt` to invent cinematic content that the narration never earned.

## 12. Listener-only self-read gate

Before acceptance, read the narration once **without imagining the visuals**.
A general listener should be able to answer:

- What is this video really about?
- What is the teaching or main insight?
- How are the main points connected?
- Which parts are canonical teaching, and which are interpretation?
- Why does this matter for my daily life?
- What one idea should I remember tomorrow?

If any answer is unclear, the script is not finished even if it meets the
character count.

## 13. Consistency constraints

- Voice style stays consistent from the first line to the last; never drift
  from contemplative narration into excited promotion mid-video.
- `voiceStyle` must match `language` (`contemplative` ↔ `vi`). If mismatched,
  stop/report per `AGENTS.md`; never guess.
- A hook may be emotionally engaging, but every factual/doctrinal statement
  inside it is held to the same evidence standard as the rest of the script.
- `master_script.txt` remains the canonical continuous narration. Scene
  splitting must not rewrite, paraphrase, or omit its words.
