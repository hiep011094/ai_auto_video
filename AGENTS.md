<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# AGENTS.md — Operating Guide for the AI CLI Agent (project `vutru_ai`)

> **IMPORTANT:** This file provides a quick overview. For the complete, detailed agent operating instructions, all CLI agents (agy CLI, Codex CLI, or equivalent) working in the root of the `vutru_ai` project **MUST read the comprehensive documentation in the `.agents/` folder**, starting with `.agents/AGENTS.md`, before processing any task from `queue.json`.

## Quick Start for CLI Agents

1. **Read the full documentation:**
   ```bash
   # Start here - this is your entry point
   cat .agents/AGENTS.md
   
   # Then read in exact order (01 → 11):
   cat .agents/01_workflow.md
   cat .agents/02_content_style.md
   cat .agents/03_data_schemas.md
   cat .agents/04_scene_splitting_rules.md
   cat .agents/05_visual_bible_guide.md
   cat .agents/06_veo_prompt_guide.md
   cat .agents/07_qa_checklist.md
   cat .agents/08_hook_patterns.md
   cat .agents/09_topic_uniqueness.md
   cat .agents/10_category_rotation.md
   cat .agents/11_temp_file_management.md
   ```

2. **Validate queue.json:**
   ```bash
   python3 .agents/tools/schema_validator.py \
     --schema .agents/schemas/queue.schema.json \
     --file queue.json
   ```

3. **Follow the 11-step workflow in `.agents/01_workflow.md`**

## Project Context

The `vutru_ai` project produces YouTube videos (Short/Long) on the theme of Buddhist wisdom — dharma teachings, Buddhist stories, meditation, history, and sacred sites — in a serene cinematic-documentary style for the channel **ĐƯỜNG VỀ TỈNH THỨC**. Language: Vietnamese only. The agent receives a task via `queue.json` (submitted by the user from the web dashboard) and runs the entire pipeline autonomously.

## Key Tools

- **`.agents/tools/word_splitter.py`** — Splits narration into scenes at exact word counts (never hand-count)
- **`.agents/tools/schema_validator.py`** — Validates all JSON outputs against schemas (mandatory before completion)

## Directory Structure

```
vutru_ai/
├── .agents/              ← FULL DOCUMENTATION HERE (read this folder!)
│   ├── AGENTS.md         ← Detailed entry point
│   ├── 01-08_*.md        ← Step-by-step guides
│   ├── schemas/          ← JSON schemas for validation
│   ├── templates/        ← Starting templates
│   └── tools/            ← Python tools
├── queue.json            ← INPUT: task from web UI
├── database/
│   └── history.json      ← History of all videos
└── data/
    ├── video_short/
    │   └── [title-slug]/
    │       ├── master_script.txt
    │       ├── metadata.json
    │       ├── visual_bible.json
    │       └── chapter_01.json
    └── video_long/
        └── [title-slug]/
            ├── master_script.txt
            ├── metadata.json
            ├── visual_bible.json
            └── chapter_01...N.json
```

## Hard Rules (Never Break These)

1. **Word count per scene is absolute** — always use `word_splitter.py`, never count by eye
2. **All JSON files MUST validate** — run `schema_validator.py` before marking task complete
3. **`context_ref` is internal only** — never appears in viewer-facing content
4. **`visual_bible.json` created before veo_prompts** — single source of truth for visual consistency
5. **All timestamps in Vietnam time (UTC+7)**

## For Web Developers

This AGENTS.md file is for CLI agent automation. The Next.js web UI components are separate:
- See `app/` folder for UI components
- See `app/api/` for API routes
- Next.js documentation: `node_modules/next/docs/`
