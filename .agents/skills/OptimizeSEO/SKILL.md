---
name: OptimizeSEO
description: Produces a validated YouTube SEO package from an existing video project without adding undeclared fields to canonical metadata.json.
---

# Optimize SEO Skill

This is a **separate downstream optimization step**. It must not change the canonical 11-step generation flow or add project settings to `metadata.json`.

## Source-of-truth contract

Resolve inputs in this order:

1. `metadata.json` → only `title`, `description`, `keywords` are canonical.
2. Project folder path → `data/video_short/...` means `videoType=short`; `data/video_long/...` means `videoType=long`.
3. `database/history.json` → match the project by exact `folder` name and read `language`, `voiceStyle`, `mode`, `type`. This is the preferred source after normal Step 11 completion.
4. If history has not yet been written, use the active triggering task context (`queue.json`/caller context) for those same fields. Do not invent fallback values.
5. `chapter_*.json` → `voiceover` is the content source; optional `timeline` is the timestamp source.
6. `master_script.txt` → global content context when needed.

Never expect `metadata.json` to contain `videoType`, `language`, `voiceStyle`, `mode`, or `sources`; its schema explicitly forbids those fields.

## Language lock

Lock the resolved project language before writing:

- `vi`: Vietnamese output; internationally recognized proper names/acronyms may remain unchanged.
- `en`: native English output. No Vietnamese prose or Vietnamese diacritics.

Apply the lock to title, description, chapter names, hashtags, and backend tags.

## Chapter timestamps for Long videos

When valid `timeline` data exists in all chapter scenes:

- Chapter 1 starts at `00:00`.
- Each later chapter uses the `timeline.start` of its first scene.
- Timestamps must increase strictly and must exactly match chapter data after second-level formatting.
- Derive each chapter name from that chapter's `voiceover`, 4–8 useful words, in the locked language.

If no timeline exists, an audio-duration fallback may be used only when the required audio files are present and measurable. If no trustworthy timing source exists, omit the chapter block rather than fabricating timestamps.

## Tone alignment

Canonical `voiceStyle` value is:

- `contemplative`: calm, contemplative, serene Vietnamese narration; respectful Buddhist tone in SEO metadata. No hype, no sensationalism.

Do not branch on undeclared styles such as `street_humor`, `mystery`, `science`, or `epic`.

## YouTube limits and project targets

Use these current platform caps and the project's tighter editorial targets:

### Title

- YouTube cap: **100 characters**.
- Project ideal: **50–70 characters** where natural; quality/readability beats padding.
- Short: end with `#shorts` only if the project publishing convention requires it; keep within 100 characters.
- Long: do not append `#shorts`/`#short`.
- Put the primary concept early, but do not force awkward keyword stuffing.

### Description

- YouTube Data API cap: **5,000 UTF-8 bytes**, not 5,000 Unicode characters.
- Project ideal: **300–1,000 characters** for concise metadata unless a useful Long-video chapter block needs more.
- First ~125 characters should clearly state the topic/payoff.
- End with 3–5 relevant, unique hashtags; avoid generic spam-style tags such as `#fyp` or `#viral`.
- Project editorial policy: do not add external source URLs to the public description. This is a project cleanliness/safety choice, **not a claim that YouTube universally forbids external links**. The configured channel/subscribe URL may be used where the channel template explicitly requires it.

### Backend tags (`keywords`)

- Project target: 15–20 useful tags.
- YouTube API combined tag budget: **500 characters using YouTube's counting rules** (commas count; tags containing spaces are effectively quoted for limit calculation).
- Prefer a working budget ≤400 characters to preserve margin.
- Keep tags readable and topic-specific. Do not duplicate near-identical keyword variants just to fill count.
- Project sanitizer: letters, numbers, and spaces only; remove punctuation listed in `seo_agent/channels_config.json`.

## Output structure

Save only to `seo_optimized.json`:

Short:
```json
{
  "short": {
    "title": "...",
    "description": "...",
    "keywords": ["..."]
  }
}
```

Long:
```json
{
  "long": {
    "title": "...",
    "description": "...",
    "keywords": ["..."]
  }
}
```

Do not overwrite canonical `metadata.json` unless a separate caller explicitly requests that downstream action.

## Mandatory pre-save audit

Before saving:

1. Re-resolve `language` and `videoType` from canonical sources; do not read them from metadata.
2. Verify title ≤100 characters.
3. Verify `len(description.encode("utf-8")) <= 5000`.
4. Verify 3–5 unique hashtags and no project-forbidden spam hashtags.
5. Verify 15–20 tags and YouTube combined tag budget ≤500; prefer ≤400.
6. Verify tag sanitizer rules.
7. For Long videos with chapter timestamps, compare every emitted timestamp against `chapter_*.json` again; chapter 1 must be `00:00` and later starts strictly increase.
8. Verify language purity, especially chapter names.
9. Verify no unsupported factual certainty is introduced by title/description beyond the completed script.
10. Save `seo_optimized.json`, then run the deterministic gate:

```bash
python3 .agents/tools/seo_qa.py \
  --folder "<project-folder>" \
  --lang <vi|en> \
  --video-type <short|long>
```

11. The SEO task is complete only when `seo_qa.py` exits 0. This gate checks structure, platform caps, hashtag/tag rules, language drift, URL allow-list policy, and timeline-derived chapter timestamps. Semantic ranking quality and factual certainty still require the editorial checks above.
