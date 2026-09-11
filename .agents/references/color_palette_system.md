# Color Palette System for Buddhist Visual Storytelling

> **Load rule:** Lazy-load when creating `visual_bible.json` (Step 6) or writing veo_prompts (Step 8). The `color_grading` field in `visual_bible.json` should reference specific palettes from this system instead of a universal warm-amber directive.

## 1. Why this matters

"Warm amber tones" as a universal color directive causes two problems:
- Moonlit, rain, dawn, and forest scenes look artificially warm when they should have their own authentic light temperature
- Visual variety suffers across 50+ scenes in a Long video, creating a monotonous viewing experience

This palette system provides scene-type-specific color direction while maintaining the channel's warm, contemplative identity. The channel's signature warmth lives primarily in Palettes A and B; other palettes provide necessary variety while keeping the contemplative mood.

---

## 2. Scene-Type Color Palettes

### Palette A — Temple/Monastery Interior (Warm Sacred)

**Color family:** Warm amber core

| Role | Color | Hex reference | Description |
|---|---|---|---|
| Primary dominant | Warm amber | #D4A574 | Wall/pillar ambient reflection |
| Primary accent | Deep saffron | #C17817 | Robe tones, altar cloth |
| Secondary | Aged wood brown | #6B4226 | Timber columns, furniture |
| Secondary | Ivory cream | #FFFFF0 | Wall plaster, ceramic |
| Accent | Candlelight gold | #FFD700 | Flame glow, metallic highlights |
| Accent | Temple red-brown | #8B3A3A | Lacquer detail, door frame |

**Lighting:** Practical warm source (oil lamp, candle, window sun), soft volumetric light through dust/incense, warm shadow bias.  
**Use when:** Indoor temple, meditation hall, monastery room, ritual scene, evening teaching.

### Palette B — Outdoor Dawn/Morning (Awakening)

**Color family:** Soft gold with earth notes

| Role | Color | Hex reference | Description |
|---|---|---|---|
| Primary dominant | Soft morning gold | #E8C547 | Eastern sky, warm light wash |
| Primary accent | Warm mist cream | #FFF8DC | Morning haze, diffuse backlight |
| Secondary | Sage green | #87A96B | Foliage in morning light |
| Secondary | Earth brown | #8B7355 | Path, temple wall, tree bark |
| Accent | Dew silver | #C0C0C0 | Water droplets, wet surface |
| Accent | Lotus pink | #FFB7C5 | Flowers in morning bloom |

**Lighting:** Soft directional golden hour from east, long warm shadows, visible mist particulate.  
**Use when:** Dawn scene, morning meditation, outdoor awakening moment, lotus pond, sunrise teaching.

### Palette C — Forest/Nature (Contemplative Green)

**Color family:** Deep green with filtered warmth

| Role | Color | Hex reference | Description |
|---|---|---|---|
| Primary dominant | Deep forest green | #228B22 | Canopy, dense foliage |
| Primary accent | Moss sage | #8A9A5B | Ground cover, old stone |
| Secondary | Bark brown | #6B4226 | Tree trunks, roots |
| Secondary | Filtered gold | #DAA520 | Dappled sunlight patches |
| Accent | Fern emerald | #50C878 | Young growth, fresh leaf |
| Accent | Earth umber | #704214 | Forest floor, fallen leaves |

**Lighting:** Canopy-filtered, dappled sun creating light/shadow play, cool-warm alternation at leaf gaps.  
**Use when:** Forest path, bodhi tree, nature teaching, walking meditation, mountain retreat, bamboo grove.

### Palette D — Night/Moonlit (Sacred Stillness)

**Color family:** Cool blue-grey with warm accent points

| Role | Color | Hex reference | Description |
|---|---|---|---|
| Primary dominant | Deep blue-grey | #36454F | Night sky, deep shadow |
| Primary accent | Moonlight silver | #C0C0C0 | Direct moonbeam, highlight |
| Secondary | Midnight blue | #191970 | Deep sky, distant mountains |
| Secondary | Cool stone | #778899 | Temple surface, pathway |
| Accent | Distant amber glow | #DAA520 | Monastery lamp, firefly |
| Accent | Star white | #F5F5F5 | Star points, reflection |

**Lighting:** Overhead moon (cool blue-white primary), distant warm practical lights (monastery lamps), low contrast, soft shadow.  
**Use when:** Night meditation, moonlit scene, evening contemplation, Uposatha night, night garden.

### Palette E — Water/River/Rain (Flow & Impermanence)

**Color family:** Cool slate with organic depth

| Role | Color | Hex reference | Description |
|---|---|---|---|
| Primary dominant | Slate blue | #708090 | Overcast sky, water surface |
| Primary accent | Mist grey | #C4C4C4 | Rain diffusion, fog |
| Secondary | River green | #4A7C59 | Vegetation near water |
| Secondary | Wet stone | #696969 | Rain-darkened surface |
| Accent | Raindrop silver | #D3D3D3 | Drop highlight, ripple |
| Accent | Deep water teal | #008080 | River depth, deep pond |

**Lighting:** Overcast diffuse, wet surface reflections, reduced contrast, muted specular highlights.  
**Use when:** Rain scene, river, pond, waterfall, teaching about impermanence, washing/purification.

### Palette F — Historical/Ancient Reconstruction

**Color family:** Warm sandstone and aged earth

| Role | Color | Hex reference | Description |
|---|---|---|---|
| Primary dominant | Sandstone warm | #D2B48C | Ancient walls, earthen surface |
| Primary accent | Aged terracotta | #CC7722 | Clay structure, pottery |
| Secondary | Dust beige | #F5DEB3 | Dry atmosphere, sand |
| Secondary | Weathered grey | #A9A9A9 | Old stone, eroded surface |
| Accent | Distant ochre | #CC7722 | Horizon, sunset sky |
| Accent | Faded saffron | #F4A460 | Ancient robe, faded cloth |

**Lighting:** Harsh midday (historical realism) or warm sunset (dramatic atmosphere), dust particulate, hard shadow.  
**Use when:** Ancient India, Sāvatthī, Rājagaha, historical sites, archaeological reconstruction, Jātaka tale setting.

### Palette G — Modern/Contemporary Application

**Color family:** Warm neutral with clean lines

| Role | Color | Hex reference | Description |
|---|---|---|---|
| Primary dominant | Warm neutral | #B5A99A | Wall, floor, furniture surface |
| Primary accent | Clean wood | #DEB887 | Modern wooden floor/furniture |
| Secondary | Soft white | #FAFAFA | Clean wall, paper, fabric |
| Secondary | Gentle grey | #D3D3D3 | Modern textile, device |
| Accent | Green plant | #6B8E23 | Single indoor plant, bonsai |
| Accent | Tea brown | #A0522D | Cup of tea, warm drink |

**Lighting:** Clean natural daylight from windows, soft diffuse, minimal shadow.  
**Use when:** Modern meditation room, everyday life application, contemporary setting, urban mindfulness.

---

## 3. How to use in `visual_bible.json`

The `color_grading` field should reference specific palettes by letter:

```json
"color_grading": "Palette A (warm sacred) for temple interiors and monastery halls; Palette B (awakening) for outdoor dawn and morning scenes; Palette C (contemplative green) for forest and nature sequences; Palette D (sacred stillness) for night and moonlit scenes; Palette F (historical) for ancient Indian settings. Controlled contrast and physically plausible skin/material color throughout."
```

Only list the palettes that the specific video actually needs. A Short video about modern mindfulness might only need Palettes B and G.

---

## 4. Palette transition rules

| Rule | Rationale |
|---|---|
| Adjacent scenes may blend palettes when `lighting_timeline` specifies a time-of-day transition | Natural light evolution |
| Never jump from Palette D (night) directly to Palette A (warm interior) without a dawn/transition beat | Prevents jarring light discontinuity |
| The transition palette order generally follows: D → B → C or A → F → B → A | Natural time-of-day progression |
| One scene may combine elements of two palettes when the setting crosses types (e.g. temple courtyard at dawn = A+B) | Real settings are hybrid |
| The `film_look` anchor remains universal across all palettes | Unifying cinematic identity |

---

## 5. Integration with `lighting_timeline`

The `lighting_timeline` in `visual_bible.json` should map stage→palette:

```json
"lighting_timeline": [
  {"stage": "opening", "time_of_day": "dawn", "mood": "quiet awakening", "palette": "B"},
  {"stage": "body ch1-3", "time_of_day": "morning", "mood": "contemplative clarity", "palette": "A/C"},
  {"stage": "body ch4-6", "time_of_day": "midday to afternoon", "mood": "deep insight", "palette": "C/F"},
  {"stage": "synthesis", "time_of_day": "golden hour", "mood": "warm wisdom", "palette": "A/B"},
  {"stage": "ending", "time_of_day": "sunset to candlelit dusk", "mood": "peaceful resolution", "palette": "A/D"}
]
```

> **Note:** The `palette` key in `lighting_timeline` is a **reference annotation only** for the agent writing veo_prompts. It is NOT a schema field — do not add it to `visual_bible.schema.json`. The agent reads the palette reference from this guide document and applies the appropriate color direction in the veo_prompt text.

---

## 6. Usage contract

- This system provides **guidance**, not rigid rules. The agent applies palette direction through the `veo_prompt` text.
- Hex values are reference anchors for the agent's color vocabulary, not pixel-exact targets for Veo.
- The channel's warm identity is preserved: Palettes A and B are the "home" palettes that appear most often.
- This file does not change any final video JSON schema.
- No new schema fields are created; palette references live in the `color_grading` text string and in veo_prompt prose.
