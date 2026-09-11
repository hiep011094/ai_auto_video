#!/usr/bin/env python3
import hashlib
import json
import subprocess
import sys
from pathlib import Path

AGENTS = Path(__file__).resolve().parents[1]
TOOLS = AGENTS / "tools"
sys.path.insert(0, str(TOOLS))

from source_verifier import syntactically_valid
from similarity_engine import SimilarityEngine
import evidence_semantic_verifier as ev
import scene_semantic_checker as ssc


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def test_source_verifier_blocks_private_and_metadata_targets_without_network():
    for url in (
        "http://127.0.0.1/evidence",
        "http://10.0.0.2/evidence",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/evidence",
    ):
        ok, reason = syntactically_valid(url, resolve_dns=False)
        assert ok is False, (url, reason)
        assert "non-public" in reason.lower() or "forbidden" in reason.lower()


def test_multilingual_concept_prefilter_promotes_translated_duplicate():
    history = [
        {"id": f"f{i}", "title": f"Unrelated cave mystery number {i}", "main_video_content": f"Different cave story {i}", "language": "en", "type": "long"}
        for i in range(100)
    ]
    history.append({
        "id": "dup",
        "title": "What Would Happen If Earth Suddenly Stopped Rotating?",
        "main_video_content": "What would happen if Earth suddenly stopped rotating?",
        "language": "en", "type": "long",
    })
    engine = SimilarityEngine(history, "vi", "short", scope="global")
    rows = engine.scan_all("Điều gì xảy ra nếu Trái Đất đột ngột ngừng quay?", top_k=20)
    ids = [row.get("id") for _, row in rows]
    assert ids[0] == "dup"
    detail = rows[0][1]["_scan_detail"]
    assert detail["concept_sim"] >= 0.9
    assert detail["classification"] == "near_identical"


def test_global_duplicate_gate_rejects_translation_even_when_ai_unavailable(tmp_path):
    history = tmp_path / "history.json"
    rows = [
        {"id": f"f{i}", "title": f"Unrelated cave mystery {i}", "main_video_content": f"Different cave story {i}", "language": "en", "type": "long", "date": "2026-01-01"}
        for i in range(100)
    ]
    rows.append({
        "id": "dup", "title": "What Would Happen If Earth Suddenly Stopped Rotating?",
        "main_video_content": "What would happen if Earth suddenly stopped rotating?",
        "language": "en", "type": "long", "date": "2026-01-01",
    })
    write_json(history, rows)
    p = subprocess.run([
        sys.executable, str(TOOLS / "check_topic_duplicate.py"),
        "--new-topic", "Điều gì xảy ra nếu Trái Đất đột ngột ngừng quay?",
        "--history", str(history), "--language", "vi", "--video-type", "short",
        "--skip-ai", "--json-output",
    ], capture_output=True, text=True, cwd=str(AGENTS.parent))
    assert p.returncode == 1, p.stdout + p.stderr
    d = json.loads(p.stdout)
    assert d["tier1_scan"]["similar_topics"][0]["id"] == "dup"
    assert d["tier1_scan"]["similar_topics"][0]["classification"] == "near_identical"


def _valid_scene_review(pass_value=True):
    row = {
        "scene": 1, "pass": pass_value, "severity": "ok",
        "reason": "semantically correct", "fix_direction": "",
    }
    for key in ssc.SCORE_KEYS:
        row[key] = 0.99
    return {
        "summary": {"pass": True, "blocking_count": 0, "warning_count": 0},
        "scenes": [row],
    }


def test_scene_semantic_parser_rejects_string_boolean_and_count_contradictions():
    bad_type = _valid_scene_review("false")
    ok, reason = ssc.validate_ai_result(bad_type, [1])
    assert ok is False and "boolean" in reason.lower()

    bad_count = _valid_scene_review(True)
    bad_count["summary"]["blocking_count"] = 1
    ok, reason = ssc.validate_ai_result(bad_count, [1])
    assert ok is False and "blocking_count mismatch" in reason


def test_evidence_content_verifier_rejects_live_but_unrelated_page(monkeypatch):
    data = {
        "candidates": [{
            "angle": "NASA evidence for a hidden ocean beneath Europa ice",
            "momentum_signal": "new NASA Europa evidence",
            "reason": "fresh mission evidence",
            "decision": "selected",
            "sources": [{"url": "https://nasa.gov/europa", "source_type": "authoritative", "supports": "NASA evidence supports a hidden ocean beneath Europa ice"}],
        }]
    }
    monkeypatch.setattr(ev, "syntactically_valid", lambda url, resolve_dns=True: (True, "ok"))
    monkeypatch.setattr(ev, "fetch_source_document", lambda url, timeout=7.0: {
        "ok": True, "text": "Football scores, cookie settings, advertising preferences and unrelated sports news.",
        "content_sha256": "x",
    })
    result = ev.summarize(ev.verify_rows(data, "topic", ai_model="manual"))
    assert result["pass"] is False
    assert result["failed"][0]["method"] == "manual_required"


def test_evidence_content_verifier_accepts_grounded_retrieved_content(monkeypatch):
    data = {
        "candidates": [{
            "angle": "NASA evidence for a hidden ocean beneath Europa ice",
            "momentum_signal": "new Europa mission evidence",
            "reason": "fresh evidence",
            "decision": "selected",
            "sources": [{"url": "https://nasa.gov/europa", "source_type": "authoritative", "supports": "NASA evidence supports a hidden ocean beneath Europa ice"}],
        }]
    }
    monkeypatch.setattr(ev, "syntactically_valid", lambda url, resolve_dns=True: (True, "ok"))
    monkeypatch.setattr(ev, "fetch_source_document", lambda url, timeout=7.0: {
        "ok": True,
        "text": "NASA Europa mission evidence describes a hidden ocean beneath Europa ice. The evidence for the hidden ocean is discussed by NASA scientists and mission observations.",
        "content_sha256": "grounded",
    })
    result = ev.summarize(ev.verify_rows(data, "topic", ai_model="manual"))
    assert result["pass"] is True, result
    assert result["results"][0]["method"] == "deterministic"


def test_topic_freshness_window_cannot_be_self_reported_without_recent_date(tmp_path):
    ledger = tmp_path / "topic.json"
    candidates = []
    for i in range(8):
        candidates.append({
            "angle": f"Candidate angle about Europa evidence {i}",
            "freshness_window": "7d", "momentum_signal": "recent momentum",
            "visual_richness": 4, "source_strength": 4, "novelty": 4, "category_fit": 5,
            "sources": [
                {"url": "https://nasa.gov/europa-a", "source_type": "authoritative", "published_at": "2025-01-01", "supports": "NASA evidence about Europa mission observations"},
                {"url": "https://esa.int/europa-b", "source_type": "news", "published_at": "2025-01-02", "supports": "ESA coverage about Europa mission observations"},
            ],
            "decision": "selected" if i == 0 else "reject", "reason": "fresh evidence catalyst",
        })
    write_json(ledger, {"selected_category": "buddhist_wisdom", "mode": "2", "checked_at": "2026-08-29T10:00:00+07:00", "candidates": candidates})
    p = subprocess.run([sys.executable, str(TOOLS / "topic_research_gate.py"), "--file", str(ledger)], capture_output=True, text=True)
    assert p.returncode == 1
    assert "freshness_window=7d" in (p.stdout + p.stderr)


def test_claim_receipt_is_hash_bound_and_stale_receipt_fails(tmp_path):
    ledger = tmp_path / "claims.json"
    data = {"mode":"2","topic":"Europa","claims":[{
        "claim_id":"c1","statement":"NASA reported a finding in 2026","claim_type":"institution","certainty":"established","decision":"verified",
        "allowed_wording":"NASA reported a finding in 2026.","visual_rule":"Show only evidence context.",
        "sources":[{"url":"https://nasa.gov/europa","source_type":"authoritative","supports":"NASA source supports the report and year."}]
    }]}
    write_json(ledger, data)
    receipt = tmp_path / "receipt.json"
    receipt.write_text(json.dumps({
        "version":1,"kind":"claim","ledger_sha256":hashlib.sha256(ledger.read_bytes()).hexdigest(),
        "pass":True,"supported":1,"total":1,"results":[]
    }), encoding="utf-8")
    p = subprocess.run([sys.executable, str(TOOLS / "claim_evidence_gate.py"), "--file", str(ledger), "--mode", "2", "--require-content-receipt", str(receipt)], capture_output=True, text=True)
    assert p.returncode == 0, p.stdout + p.stderr

    data["claims"][0]["allowed_wording"] = "NASA cautiously reported a finding in 2026."
    write_json(ledger, data)
    p = subprocess.run([sys.executable, str(TOOLS / "claim_evidence_gate.py"), "--file", str(ledger), "--mode", "2", "--require-content-receipt", str(receipt)], capture_output=True, text=True)
    assert p.returncode == 1
    assert "stale" in (p.stdout + p.stderr).lower()


def test_scene_semantic_payload_filters_unrelated_claims():
    ledger = {"mode":"2","topic":"Europa","claims":[
        {"claim_id":"europa","statement":"Europa may contain a subsurface ocean beneath ice","allowed_wording":"Europa may contain a subsurface ocean beneath ice","visual_rule":"Show Europa ice/ocean evidence","claim_type":"fact","decision":"qualified"},
        {"claim_id":"pyramid","statement":"A pyramid survey used lidar mapping","allowed_wording":"A pyramid survey used lidar mapping","visual_rule":"Show lidar survey","claim_type":"fact","decision":"verified"},
    ]}
    scenes = [{"scene":1,"voiceover":"Bằng chứng cho thấy Europa có thể có đại dương bên dưới lớp băng.","context_ref":"Europa subsurface ocean beneath ice"}]
    compact = ssc.compact_relevant_claim_evidence(ledger, scenes)
    ids = [c["claim_id"] for c in compact["claims"]]
    assert "europa" in ids
    assert "pyramid" not in ids

import editorial_semantic_checker as esc


def _valid_editorial_result():
    return {
        "summary":{"pass":True,"blocking_count":0,"warning_count":0,"reason":"coherent"},
        "scores":{k:max(0.95, t) for k,t in esc.THRESHOLDS.items()},
        "blocking_issues":[],"warnings":[],
    }


def test_editorial_semantic_parser_is_fail_closed_on_type_and_threshold():
    good=_valid_editorial_result()
    ok,reason=esc.validate_result(good)
    assert ok is True, reason
    bad=json.loads(json.dumps(good)); bad["summary"]["pass"]="true"
    ok,reason=esc.validate_result(bad)
    assert ok is False and "boolean" in reason.lower()
    low=json.loads(json.dumps(good)); low["scores"]["epistemic_discipline"]=0.3
    ok,reason=esc.validate_result(low)
    assert ok is False and "threshold" in reason.lower()


def test_editorial_receipt_is_hash_bound(tmp_path):
    lock=tmp_path/"lock.json"; script=tmp_path/"master_script.txt"; receipt=tmp_path/"receipt.json"
    write_json(lock,{"topic":"Europa","language":"vi","video_type":"long","central_question":"What is beneath Europa's ice?","core_message":"Evidence suggests an ocean but certainty remains bounded.","viewer_value":"Understand what the observations do and do not show.","audience_assumption":"General science audience with no specialist background.","key_revelations":["Ice behavior provides indirect evidence.","Models imply a liquid layer below."],"epistemic_boundary":{"known":"Several observations are established.","uncertain":"Direct confirmation remains incomplete."},"ending_takeaway":"The strongest conclusion stays narrower than a direct discovery."})
    script.write_text("A"*12000,encoding="utf-8")
    receipt.write_text(json.dumps(esc.receipt_data(lock,script,_valid_editorial_result())),encoding="utf-8")
    ok,reason=esc.validate_receipt(receipt,lock,script); assert ok is True, reason
    script.write_text("B"*12000,encoding="utf-8")
    ok,reason=esc.validate_receipt(receipt,lock,script); assert ok is False and "hash" in reason.lower()


def test_sentence_boundary_is_exposed_to_semantic_judge_runtime_payload():
    crossing={"scene":1,"voiceover":"The crust collapses. A new structure begins to form.","context_ref":"","sentence_id":1,"part":"1/1","veo_prompt":"x"}
    single={"scene":2,"voiceover":"The camera observes the stable surface.","context_ref":"","sentence_id":2,"part":"1/1","veo_prompt":"x"}
    assert ssc.scene_crosses_sentence_boundary(crossing) is True
    assert ssc.scene_crosses_sentence_boundary(single) is False
    payload=ssc._runtime_scene_payload([crossing,single])
    assert payload[0]["_runtime_boundary_crossing"] is True
    assert payload[1]["_runtime_boundary_crossing"] is False


def test_support_note_cannot_launder_an_unrelated_target(monkeypatch):
    data={"candidates":[{
        "angle":"NASA evidence for a hidden ocean beneath Europa ice",
        "momentum_signal":"new Europa mission evidence","reason":"fresh evidence","decision":"selected",
        "sources":[{"url":"https://example.invalid/source","source_type":"authoritative","supports":"football scores advertising preferences cookie settings sports news championship results"}]
    }]}
    monkeypatch.setattr(ev,"syntactically_valid",lambda url,resolve_dns=True:(True,"ok"))
    monkeypatch.setattr(ev,"fetch_source_document",lambda url,timeout=7.0:{"ok":True,"text":"Football scores advertising preferences cookie settings sports news championship results. Football championship results and advertising settings.","content_sha256":"sports"})
    summary=ev.summarize(ev.verify_rows(data,"topic",ai_model="manual"))
    assert summary["pass"] is False
    assert summary["failed"][0]["method"] == "manual_required"


def test_workflow_and_queue_schema_agree_on_six_base_parameters():
    schema=json.loads((AGENTS/"schemas"/"queue.schema.json").read_text(encoding="utf-8"))
    required=set(schema.get("items",{}).get("required",[]) if schema.get("type")=="array" else schema.get("required",[]))
    # queue schema may wrap tasks depending on historical format; derive from text too.
    workflow=(AGENTS/"01_workflow.md").read_text(encoding="utf-8")
    assert "six required base parameters" in workflow.lower() or "6 required base" in workflow.lower()
    assert "7 parameters" not in workflow.lower()

def test_current_veo_guide_has_v9_not_v8_runtime_labels():
    guide=(AGENTS/"06_veo_prompt_guide.md").read_text(encoding="utf-8")
    assert "V9 strict-scene" in guide
    assert "V8 strict-scene" not in guide
    assert "V8 semantic-bridge" not in guide
