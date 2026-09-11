#!/usr/bin/env python3
import hashlib
import json
import re
from pathlib import Path

AGENTS = Path(__file__).resolve().parents[1]


def text(rel):
    return (AGENTS / rel).read_text(encoding="utf-8")


def test_process_queue_preserves_canonical_order():
    s = text("skills/ProcessQueue/SKILL.md")
    markers = [
        "5. **Split",
        "6. **Create",
        "7. **Split each",
        "8. **Write `continuity_ref`",
        "9. **Validate",
        "10. **Run final QA",
        "11. **Append",
    ]
    positions = [s.index(m) for m in markers]
    assert positions == sorted(positions)


def test_metadata_schema_and_skills_agree():
    schema = json.loads(text("schemas/metadata.schema.json"))
    assert set(schema["properties"]) == {"title", "description", "keywords"}
    assert schema["additionalProperties"] is False
    gen = text("skills/GenerateVeoPrompts/SKILL.md")
    seo = text("skills/OptimizeSEO/SKILL.md")
    assert "Never expect `metadata.json` to contain `videoType`, `language`, `voiceStyle`, `mode`, or `sources`" in seo
    assert "never from undeclared metadata fields" in gen


def test_generate_veo_contract_has_exact_relationships_and_semantic_chain():
    s = text("skills/GenerateVeoPrompts/SKILL.md")
    for allowed in ("continuous action", "matched conceptual cut", "intentional location/time shift"):
        assert f"`{allowed}`" in s
    assert "scene_semantic_checker.py" in s
    assert "--mode 1" not in s.replace("Never hard-code `--mode 1`", "")


def test_no_dangerous_codex_bypass():
    assert "dangerously-bypass-approvals-and-sandbox" not in text("tools/ai_semantic_checker.py")


def test_visual_bible_story_anchor_is_required():
    schema = json.loads(text("schemas/visual_bible.schema.json"))
    assert "story_anchor" in schema["required"]


def test_progression_is_blocking_semantic_metric():
    # Static guard against accidentally keeping a score that is reported but not enforced.
    s = text("tools/scene_semantic_checker.py")
    assert '"progression_score": 0.85' in s


def test_seo_docs_do_not_reintroduce_metadata_context_drift():
    joined = "\n".join(text(x) for x in (
        "seo_agent/README.md", "skills/OptimizeSEO/SKILL.md"
    ))
    assert "metadata.json → language" not in joined
    assert "Read: language, videoType" not in joined
    assert "Required: language, videoType" not in joined


def test_generate_veo_full_regeneration_is_mandatory():
    s = text("skills/GenerateVeoPrompts/SKILL.md")
    assert "Full-regeneration contract — mandatory on EVERY invocation" in s
    assert "veo_regeneration_prepare.py" in s
    assert "Existing values of any of these six fields must never be reused" in s
    for field in ("context_ref", "sentence_id", "part", "continuity_ref", "shot_type", "veo_prompt"):
        assert f"`{field}`" in s

def test_final_qa_rederives_splitter_owned_alignment():
    s = text("tools/qa_automation.py")
    assert "check_canonical_scene_alignment" in s
    assert "canonical_splitter.build_scenes" in s


def test_no_duplicate_top_level_markdown_headings():
    # Guard against version-drift renumbering bugs like the duplicate
    # "## G." (07_qa_checklist.md) and "## 8." (13_long_job_quality_guard.md)
    # headings found by external audit — each top-level "## " heading label
    # inside a single guide file must be unique so cross-file "§X" references
    # stay unambiguous.
    guide_files = sorted(AGENTS.glob("[0-1][0-9]_*.md")) + [AGENTS / "AGENTS.md"]
    offenders = {}
    for path in guide_files:
        if not path.exists():
            continue
        headings = re.findall(r"(?m)^## (.+)$", path.read_text(encoding="utf-8"))
        seen = set()
        dupes = set()
        for h in headings:
            if h in seen:
                dupes.add(h)
            seen.add(h)
        if dupes:
            offenders[path.name] = sorted(dupes)
    assert not offenders, f"Duplicate '## ' headings found: {offenders}"


def test_release_manifest_schema_hashes_match_actual_files():
    # Guard against the manifest going stale relative to the shipped schema
    # files, as found by external audit (0/8 schema_sha256 values matched
    # the actual on-disk bytes at the time of that review).
    manifest = json.loads(text("RELEASE_MANIFEST_V10.json"))
    recorded = manifest["compatibility"]["schema_sha256"]
    mismatches = {}
    for rel_path, recorded_hash in recorded.items():
        actual_hash = hashlib.sha256((AGENTS / rel_path).read_bytes()).hexdigest()
        if actual_hash != recorded_hash:
            mismatches[rel_path] = {"recorded": recorded_hash, "actual": actual_hash}
    assert not mismatches, f"RELEASE_MANIFEST_V10.json schema_sha256 is stale: {mismatches}"
