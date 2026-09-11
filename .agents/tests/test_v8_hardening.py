#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path

AGENTS = Path(__file__).resolve().parents[1]
TOOLS = AGENTS / "tools"


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def test_source_verifier_rejects_placeholder_without_network(tmp_path):
    ledger = tmp_path / "topic.json"
    write_json(ledger, {
        "selected_category": "buddhist_wisdom",
        "mode": "2",
        "checked_at": "2026-08-29T10:00:00+07:00",
        "candidates": [{
            "angle": "A fabricated but structurally valid topic",
            "freshness_window": "7d",
            "momentum_signal": "fake signal",
            "visual_richness": 5,
            "source_strength": 5,
            "novelty": 5,
            "category_fit": 5,
            "sources": [{"url": "https://example.org/fake", "source_type": "authoritative", "published_at": "2026-08-29", "supports": "fake support"}],
            "decision": "selected",
            "reason": "fake selection"
        }]
    })
    p = subprocess.run([sys.executable, str(TOOLS / "source_verifier.py"), "--file", str(ledger), "--kind", "topic"], capture_output=True, text=True)
    assert p.returncode == 1
    assert "placeholder" in (p.stdout + p.stderr).lower()


def test_duplicate_gate_blocks_same_topic_across_lane(tmp_path):
    history = tmp_path / "history.json"
    write_json(history, [{
        "title": "Tứ Diệu Đế và con đường giải thoát khổ đau",
        "main_video_content": "Tứ Diệu Đế và con đường giải thoát khổ đau",
        "category": "buddhist_wisdom",
        "language": "vi",
        "type": "long",
        "date": "2026-01-01",
        "id": "old"
    }])
    p = subprocess.run([
        sys.executable, str(TOOLS / "check_topic_duplicate.py"),
        "--new-topic", "Tứ Diệu Đế và con đường giải thoát khổ đau",
        "--history", str(history), "--language", "vi", "--video-type", "short",
        "--skip-ai", "--json-output"
    ], capture_output=True, text=True, cwd=str(AGENTS.parent))
    assert p.returncode == 1, p.stdout + p.stderr
    d = json.loads(p.stdout)
    assert d["global_keyword_check"]["is_unique"] is False
    assert d["tier1_scan"]["lane"] == "global"


def test_topic_gate_verify_sources_rejects_fake_selected_urls(tmp_path):
    ledger = tmp_path / "topic.json"
    candidates = []
    for i in range(8):
        candidates.append({
            "angle": f"Candidate research angle number {i}",
            "freshness_window": "7d",
            "momentum_signal": "fresh verified-looking momentum",
            "visual_richness": 5,
            "source_strength": 5,
            "novelty": 5,
            "category_fit": 5,
            "sources": [
                {"url": "https://example.org/fake-a", "source_type": "authoritative", "published_at": "2026-08-29", "supports": "supports candidate"},
                {"url": "https://example.com/fake-b", "source_type": "news", "published_at": "2026-08-29", "supports": "supports candidate"},
            ],
            "decision": "selected" if i == 0 else "reject",
            "reason": "fresh evidence and visual value"
        })
    write_json(ledger, {"selected_category": "buddhist_wisdom", "mode": "2", "checked_at": "2026-08-29T10:00:00+07:00", "candidates": candidates})
    p = subprocess.run([sys.executable, str(TOOLS / "topic_research_gate.py"), "--file", str(ledger), "--verify-sources"], capture_output=True, text=True)
    assert p.returncode == 1
    assert "could not be verified" in (p.stdout + p.stderr).lower()
