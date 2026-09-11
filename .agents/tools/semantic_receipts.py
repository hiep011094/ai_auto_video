#!/usr/bin/env python3
"""Shared semantic-pass receipt helpers for hard-gating Veo micro-batches."""
from __future__ import annotations

from quality_archive import runtime_file
import hashlib
import json
from pathlib import Path
from typing import Iterable, List

CURRENT_SEMANTIC_RULESET = "strict-scene-lock-v5"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def scene_payload_hash(scenes: Iterable[dict]) -> str:
    fields = []
    for s in scenes:
        fields.append({
            "scene": s.get("scene"),
            "voiceover": s.get("voiceover", ""),
            "sub": s.get("sub", ""),
            "context_ref": s.get("context_ref", ""),
            "sentence_id": s.get("sentence_id"),
            "part": s.get("part", ""),
            "continuity_ref": s.get("continuity_ref", ""),
            "shot_type": s.get("shot_type", ""),
            "veo_prompt": s.get("veo_prompt", ""),
        })
    raw = json.dumps(fields, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def runtime_dir_for_folder(folder: Path) -> Path:
    # Expected: <project>/data/video_long|video_short/<slug>
    project_root = folder.resolve().parent.parent.parent
    runtime = project_root / "data" / ".agent_runtime"
    runtime.mkdir(parents=True, exist_ok=True)
    return runtime


def receipt_path(folder: Path) -> Path:
    return runtime_dir_for_folder(folder) / f"_veo_semantic_receipts_{folder.name}.json"


def load_receipts(folder: Path) -> dict:
    path = runtime_file(folder, "_veo_semantic_receipts", scoped_only=True)
    if not path.exists():
        return {"video_folder": folder.name, "receipts": []}
    return json.loads(path.read_text(encoding="utf-8"))


def write_receipts(folder: Path, data: dict) -> Path:
    path = receipt_path(folder)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def matching_receipt(folder: Path, start: int, end: int, scenes: List[dict], master_path: Path, vb_path: Path, expected_ruleset: str = CURRENT_SEMANTIC_RULESET):
    expected_hash = scene_payload_hash(scenes)
    master_hash = sha256_file(master_path)
    vb_hash = sha256_file(vb_path)
    data = load_receipts(folder)
    for rec in data.get("receipts", []):
        if rec.get("start") != start or rec.get("end") != end:
            continue
        if rec.get("status") != "pass":
            continue
        if expected_ruleset and rec.get("semantic_ruleset") != expected_ruleset:
            continue
        if rec.get("scene_payload_sha256") != expected_hash:
            continue
        if rec.get("master_script_sha256") != master_hash:
            continue
        if rec.get("visual_bible_sha256") != vb_hash:
            continue
        return rec
    return None
