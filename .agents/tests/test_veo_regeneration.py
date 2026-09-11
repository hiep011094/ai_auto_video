#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path

import pytest

AGENTS = Path(__file__).resolve().parents[1]
TOOLS = AGENTS / "tools"
sys.path.insert(0, str(TOOLS))
import word_splitter as ws  # noqa: E402
import qa_automation as qa  # noqa: E402


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def project(tmp_path):
    folder = tmp_path / "data" / "video_short" / "regen"
    folder.mkdir(parents=True)
    text = "Chánh niệm giúp ta nhận biết những cảm xúc đang có trong tâm. Từ bi mở lối cho người đang học cách buông bỏ sân hận."
    (folder / "master_script.txt").write_text(text, encoding="utf-8")
    scenes, _, _ = ws.build_scenes(text, 14)
    for i, s in enumerate(scenes):
        s["context_ref"] = "STALE CONTEXT"
        s["sentence_id"] = 999
        s["part"] = "9/9"
        s["continuity_ref"] = "opening" if i == 0 else "STALE"
        s["shot_type"] = "wide"
        s["veo_prompt"] = "OLD PROMPT " * 100
        s["timeline"] = {"start": i * 8.0, "end": (i + 1) * 8.0, "duration": 8.0, "start_formatted": f"00:0{i*8}", "end_formatted": f"00:{(i+1)*8:02d}", "speed": 1.0}
    write_json(folder / "chapter_01.json", scenes)
    runtime = tmp_path / "data" / ".agent_runtime"
    runtime.mkdir(parents=True)
    write_json(runtime / "_veo_progress_regen.json", {"old": True})
    write_json(runtime / "_veo_semantic_receipts_regen.json", {"receipts": []})
    write_json(folder / "all_veo_prompt.json", [{"scene": 1, "veo_prompt": "old"}])
    return folder, text


def test_full_regeneration_prepare_rebuilds_and_invalidates(tmp_path):
    folder, text = project(tmp_path)
    proc = subprocess.run([
        sys.executable, str(TOOLS / "veo_regeneration_prepare.py"),
        "--folder", str(folder), "--type", "short", "--lang", "vi",
    ], capture_output=True, text=True)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    rows = json.loads((folder / "chapter_01.json").read_text(encoding="utf-8"))
    expected, _, _ = ws.build_scenes(text, 14)
    for got, exp in zip(rows, expected):
        assert got["context_ref"] == exp["context_ref"]
        assert got["sentence_id"] == exp["sentence_id"]
        assert got["part"] == exp["part"]
        assert got["voiceover"] == exp["voiceover"]
        assert got["sub"] == exp["sub"]
        assert "timeline" in got
        assert "continuity_ref" not in got
        assert "shot_type" not in got
        assert "veo_prompt" not in got
    assert not (tmp_path / "data" / ".agent_runtime" / "_veo_progress_regen.json").exists()
    assert not (tmp_path / "data" / ".agent_runtime" / "_veo_semantic_receipts_regen.json").exists()
    assert not (folder / "all_veo_prompt.json").exists()


def test_regeneration_prepare_dry_run_is_non_mutating(tmp_path):
    folder, _ = project(tmp_path)
    before = (folder / "chapter_01.json").read_bytes()
    proc = subprocess.run([
        sys.executable, str(TOOLS / "veo_regeneration_prepare.py"),
        "--folder", str(folder), "--type", "short", "--lang", "vi", "--dry-run",
    ], capture_output=True, text=True)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert (folder / "chapter_01.json").read_bytes() == before
    assert (folder / "all_veo_prompt.json").exists()


def test_regeneration_prepare_refuses_master_mismatch_without_mutation(tmp_path):
    folder, _ = project(tmp_path)
    before = (folder / "chapter_01.json").read_bytes()
    (folder / "master_script.txt").write_text("different source", encoding="utf-8")
    proc = subprocess.run([
        sys.executable, str(TOOLS / "veo_regeneration_prepare.py"),
        "--folder", str(folder), "--type", "short", "--lang", "vi",
    ], capture_output=True, text=True)
    assert proc.returncode == 1
    assert (folder / "chapter_01.json").read_bytes() == before
    assert (folder / "all_veo_prompt.json").exists()


def test_final_qa_alignment_gate_detects_post_regeneration_tampering(tmp_path):
    folder, text = project(tmp_path)
    expected, _, _ = ws.build_scenes(text, 14)
    rows = json.loads((folder / "chapter_01.json").read_text(encoding="utf-8"))
    for got, exp in zip(rows, expected):
        got["context_ref"] = exp["context_ref"]
        got["sentence_id"] = exp["sentence_id"]
        got["part"] = exp["part"]
    write_json(folder / "chapter_01.json", rows)
    assert qa.check_canonical_scene_alignment(folder, "short", "vi") is True
    rows[0]["context_ref"] = "tampered"
    write_json(folder / "chapter_01.json", rows)
    assert qa.check_canonical_scene_alignment(folder, "short", "vi") is False
