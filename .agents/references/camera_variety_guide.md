# Camera Movement Variety Guide

> **Load rule:** Lazy-load when writing veo_prompts (Step 8). Reference this guide alongside `06_veo_prompt_core.md` and `06_veo_prompt_guide.md §2.9` to ensure camera movement variety across batches.

## 1. Problem this solves

Analysis of chapter outputs shows excessive repetition of "slow dolly push-in" across consecutive scenes. This produces:
- Monotonous video rhythm that reduces viewer engagement
- Predictable camera behavior that feels like automated stock footage
- Missed opportunities for cinematic storytelling through camera language

Professional documentaries use camera movement as a narrative tool — each movement choice should serve the current scene's emotional/informational beat.

---

## 2. Movement library by scene function

### 2.1. ESTABLISHING shots (typically `part = 1/N`)

Purpose: Set the scene, reveal scale, orient the viewer.

| Movement | Description | Best for | Veo prompt wording |
|---|---|---|---|
| Slow crane rise | Camera rises from low to reveal landscape/architecture | Temple exterior, mountain, historical site | "slow crane shot rising from ground level to reveal the full [location]" |
| Aerial lateral sweep | Drone-style smooth horizontal sweep across setting | Wide landscape, river, forest canopy | "aerial drone shot sweeping laterally across the [landscape]" |
| Wide static locked-off | Fixed frame with environmental micro-motion only | Meditation scene, sacred space, quiet moment | "static locked-off wide shot with [environmental motion] as the only movement" |
| Slow tilt up reveal | Camera tilts from ground detail to full scene | Temple entrance, bodhi tree, monument | "slow upward tilt from [ground detail] to reveal the full [scene]" |
| Gentle 90° arc | Camera circles the scene partially | Central subject, altar, seated figure | "gentle arc shot circling 90 degrees around [subject]" |

### 2.2. DEVELOPMENT shots (typically middle `part` values)

Purpose: Continue the action, deepen engagement, vary the angle.

| Movement | Description | Best for | Veo prompt wording |
|---|---|---|---|
| Lateral tracking | Camera moves parallel alongside subject | Walking monk, procession, path journey | "smooth lateral tracking shot alongside [subject] at constant distance" |
| Steady dolly alongside | Camera follows at subject's pace | Conversation, teaching moment, meditation walk | "steady dolly tracking parallel to [subject]" |
| Subtle handheld | Organic micro-shake documentary feel | Intimate moment, emotional beat, observation | "subtle handheld shot with natural documentary micro-movement" |
| Static with rack focus | Fixed camera, focus shifts between planes | Two subjects, foreground/background meaning | "static shot with slow rack focus from [foreground] to [background]" |
| Gentle continuing arc | Camera continues circling from prior angle | Extended observation, discovery, ritual | "gentle arc shot continuing [direction] around [subject]" |
| Pan following gaze | Camera pivots to follow subject's look direction | Reaction, discovery, pointing at something | "slow pan following [subject's] gaze toward [object/direction]" |

### 2.3. CLOSE-UP / INTIMATE shots (typically `part = N/N`)

Purpose: Close the moment, create emotional connection, build momentum into next sentence.

| Movement | Description | Best for | Veo prompt wording |
|---|---|---|---|
| Slow push-in | Classic approach toward subject detail | Key insight, emotional peak, realization | "slow dolly push-in toward [subject detail]" |
| Static locked close-up | Fixed frame, subject micro-motion only | Meditation, breathing, stillness | "static locked-off close-up with only [micro-motion]" |
| Pull-out reveal | Camera retreats from detail to show context | After intimate moment, returning to scene | "slow pull-out from [detail] revealing [broader context]" |
| Subtle lateral slide | Camera slides sideways revealing adjacent detail | Examining objects, scrolling across surface | "subtle lateral slide revealing [adjacent detail]" |
| Macro static | Extreme detail, atmospheric motion | Small objects, hands, water, texture | "macro static shot with shallow DOF capturing [detail] and atmospheric [particle motion]" |

### 2.4. TRANSITION / TIME-SHIFT shots

Purpose: Bridge between narrative sections, signal time/location change.

| Movement | Description | Best for | Veo prompt wording |
|---|---|---|---|
| Slow tilt from sky | Camera tilts down from sky/ceiling to new setting | New chapter, time passage, awakening | "slow downward tilt from [sky/ceiling] to reveal [new setting]" |
| Static atmospheric | Fixed wide with natural movement (fog, light shift) | Mood transition, contemplation | "static wide shot with [atmospheric movement] as primary visual evolution" |
| Drone descent | Aerial camera descends to eye-level | Arriving at location, discovery | "smooth drone descent from aerial altitude to eye-level at [location]" |
| Through-opening reveal | Camera pushes through doorway/window/archway | Entering new space, new perspective | "gentle push-through [doorway/archway] revealing [interior space]" |

---

## 3. Anti-repetition rules

### Hard rules (checked by `veo_batch_guard.py`)

| Rule | Limit |
|---|---|
| Same camera movement in 2 consecutive scenes | ❌ Never allowed |
| "Slow dolly push-in" per 6-scene batch | Maximum 2 |
| "Static locked-off" per 6-scene batch | Maximum 2 |
| Distinct movement types per 6-scene batch | Minimum 3 different movements |

### Best practices

| Practice | Guideline |
|---|---|
| Movement → stillness → movement rhythm | Alternate dynamic and static shots for breathing room |
| Match movement to emotional beat | Stillness for contemplation; tracking for journey; push-in for insight |
| Camera direction consistency | Maintain left→right or right→left direction within continuous sequences |
| Movement speed consistency | All movements should be slow and controlled — this is contemplative content |
| Reserve dramatic movements | Crane, drone, and arc for key moments; not every scene |

---

## 4. Lens variety companion

### Per-batch minimum diversity

| Batch size | Minimum distinct focal lengths |
|---|---|
| 6 scenes | At least 3 different (e.g., 24mm, 35mm, 85mm) |
| 8 scenes | At least 4 different |

### Lens → scene function mapping

| Focal length | Character | Best for |
|---|---|---|
| 24mm wide-angle | Expands space, reveals scale, slight barrel distortion | Establishing, temple interior, vast landscape, architectural grandeur |
| 35mm standard | Natural perspective, channel baseline | General medium shots, walking, tracking, natural environment |
| 50mm neutral | Close to human eye, intimate but not isolating | Medium close-up, conversational framing, contemplation |
| 85mm portrait | Compresses background, creamy bokeh isolation | Intimate face close-up, emotional moment, portrait |
| Macro | Extreme detail, very shallow DOF | Small objects (bell, lotus petal, water drop, hand gesture, text texture) |

### ❌ Common mistakes to avoid

| Mistake | Why it's wrong | Fix |
|---|---|---|
| Every scene uses 35mm | Monotonous perspective | Vary according to shot function |
| Using 85mm for establishing shots | Compresses space, loses scale | Use 24mm or 35mm |
| Using 24mm for intimate close-ups | Distorts facial features | Use 50mm or 85mm |
| Macro for full-body shots | Loses context entirely | Use 35mm or 50mm |

---

## 5. Movement → emotion mapping for Buddhist content

| Emotional beat | Recommended movement | Rationale |
|---|---|---|
| **Reverence / Sacred** | Slow crane rise, gentle tilt up | Elevating gaze communicates awe |
| **Contemplation / Stillness** | Static locked-off, macro static | Absence of movement = inner quiet |
| **Journey / Practice** | Lateral tracking, steady dolly | Forward movement = progress on the path |
| **Discovery / Insight** | Push-in, rack focus | Approaching truth, shifting perspective |
| **Letting go / Release** | Pull-out, slow crane descent | Releasing attachment, returning to bigger picture |
| **Transition / Impermanence** | Pan, atmospheric static | Gentle passage of time, change |
| **Connection / Teaching** | Medium static, subtle handheld | Documentary intimacy, human warmth |

---

## 6. Usage contract

- This guide is lazy-loaded during veo_prompt writing (Step 8) and does not change any schema.
- The anti-repetition rules are **hard requirements** that the batch guard enforces.
- Movement choices should serve the current narration beat, not be selected for variety alone.
- All camera movements must remain physically plausible and achievable within one 4/6/8-second clip.
- The contemplative speed mandate applies to all movements — no rapid, frantic, or jarring camera work.
