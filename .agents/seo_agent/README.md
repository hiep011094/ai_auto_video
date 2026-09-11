# SEO Agent — Usage Guide

`seo_agent` is the downstream YouTube metadata subsystem for projects created by `.agents`.
It runs **after** a video project already exists; it never changes the canonical 11-step
generation flow and never adds fields to `metadata.json`.

## Source of truth

`../skills/OptimizeSEO/SKILL.md` is the **only** authoritative contract (resolution order,
language/tone lock, platform caps, output schema, pre-save audit). This README is a short
pointer only — do not duplicate SKILL.md's rules here; edit the Skill if the contract changes.
`../tools/seo_qa.py` is the deterministic gate that enforces that contract.

The canonical project `metadata.json` contains only:

```json
{
  "title": "...",
  "description": "",
  "keywords": []
}
```

Do **not** expect `language`, `videoType`, `voiceStyle`, `mode`, or research sources in
metadata. Resolve them from the canonical folder path, matching `database/history.json`
record, or active task context as defined by the Skill.

## Output

The SEO step creates/overwrites only `<project>/seo_optimized.json`, with exactly one root
key (`short` or `long`) containing `title`, `description`, `keywords`. Full caps and rules:
see `../skills/OptimizeSEO/SKILL.md`.

## Validate

```bash
python3 .agents/tools/seo_qa.py \
  --folder "data/video_short/<slug>" \
  --lang en \
  --video-type short
```

or use `video_long`/`long` as appropriate. Exit 0 is required before SEO output is considered
complete.

## Configuration

`channels_config.json` contains the VI/EN channel names, handles, allow-listed channel URLs,
CTA text, thematic seeds, platform/project limits, tag sanitizer punctuation, and
project-spam hashtags. Keep it configuration-only; do not duplicate workflow state inside it.
