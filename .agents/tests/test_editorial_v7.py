#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path

AGENTS = Path(__file__).resolve().parents[1]
TOOLS = AGENTS / "tools"


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def lock_data(video_type="short", language="vi"):
    revs = [
        "Sứ mệnh DART cố tình va chạm với Dimorphos để thử một phương pháp phòng thủ hành tinh.",
        "Cú va chạm làm thay đổi chu kỳ quỹ đạo của Dimorphos quanh Didymos.",
    ]
    if video_type == "long":
        revs += [
            "Quan sát sau va chạm cho thấy vật chất bị bắn ra cũng góp phần truyền động lượng.",
            "Ý nghĩa chính là con người đã thử nghiệm được một kỹ thuật làm lệch chuyển động của thiên thể.",
        ]
    return {
        "topic": "DART planetary defense",
        "language": language,
        "video_type": video_type,
        "central_question": "Con người có thể chủ động làm lệch chuyển động của một tiểu hành tinh hay không?",
        "core_message": "DART cho thấy một cú va chạm được tính toán có thể thay đổi chuyển động của một thiên thể nhỏ.",
        "viewer_value": "Người xem hiểu DART đã thử điều gì, đo kết quả ra sao và vì sao điều đó quan trọng với phòng thủ hành tinh.",
        "audience_assumption": "Khán giả phổ thông tò mò về khoa học và không cần kiến thức thiên văn chuyên ngành.",
        "key_revelations": revs,
        "epistemic_boundary": {
            "known": "DART đã va chạm Dimorphos và phép đo quỹ đạo cho thấy chu kỳ của nó thay đổi.",
            "uncertain": "Hiệu quả của cùng kỹ thuật với một thiên thể đe dọa thật còn phụ thuộc kích thước, cấu trúc và thời gian cảnh báo."
        },
        "ending_takeaway": "Thí nghiệm không chứng minh mọi thiên thạch đều dễ xử lý, nhưng nó biến ý tưởng làm lệch quỹ đạo thành một kỹ thuật đã được thử ngoài không gian.",
        "do_not_overclaim": []
    }


def run_gate(lock, script=None, video_type="short", language="vi", mode="2"):
    cmd = [sys.executable, str(TOOLS / "editorial_script_gate.py"), "--lock", str(lock), "--video-type", video_type, "--language", language, "--mode", mode]
    if script:
        cmd += ["--script", str(script)]
    return subprocess.run(cmd, capture_output=True, text=True)


def test_editorial_lock_preflight(tmp_path):
    lock = tmp_path / "lock.json"
    write_json(lock, lock_data())
    proc = run_gate(lock)
    assert proc.returncode == 0, proc.stdout + proc.stderr


def test_editorial_gate_blocks_dense_hype_long(tmp_path):
    lock = tmp_path / "lock.json"
    d = lock_data("long")
    write_json(lock, d)
    # Long enough for character gate, deliberately article-like/hype-heavy.
    sentence = (
        "Sứ mệnh DART là một thí nghiệm phòng thủ hành tinh vô cùng chấn động và cực kỳ kinh hoàng, trong đó tàu vũ trụ cố tình va chạm Dimorphos để kiểm tra liệu con người có thể làm thay đổi chuyển động của một thiên thể nhỏ trong thực tế hay không, đồng thời các kính thiên văn theo dõi quỹ đạo sau va chạm để đo kết quả và giải thích ý nghĩa của phép thử đối với những tình huống phòng thủ hành tinh trong tương lai."
    )
    text = " ".join([sentence] * 35)
    script = tmp_path / "master_script.txt"
    script.write_text(text, encoding="utf-8")
    proc = run_gate(lock, script, "long")
    assert proc.returncode == 1
    assert "cadence" in (proc.stderr + proc.stdout).lower() or "hype" in (proc.stderr + proc.stdout).lower()


def test_claim_gate_blocks_uncertain_claim_upgraded_to_proof(tmp_path):
    ledger = tmp_path / "claims.json"
    write_json(ledger, {
        "mode": "1",
        "topic": "holographic principle",
        "claims": [{
            "claim_id": "c1",
            "statement": "AdS/CFT proposes a duality between a gravitational theory and a conformal field theory.",
            "claim_type": "hypothesis",
            "certainty": "hypothetical",
            "decision": "speculative",
            "allowed_wording": "AdS/CFT proposes a mathematical duality in a specific theoretical setting.",
            "visual_rule": "Use a conceptual simulation; do not depict our universe as proven to be a hologram.",
            "sources": [{
                "url": "https://example.org/paper",
                "source_type": "peer_reviewed",
                "supports": "The source presents the duality as a theoretical proposal in its stated setting."
            }]
        }]
    })
    script = tmp_path / "script.txt"
    script.write_text("AdS/CFT đã chứng minh rằng một lý thuyết hấp dẫn tương đương với một lý thuyết trường ở biên.", encoding="utf-8")
    proc = subprocess.run([
        sys.executable, str(TOOLS / "claim_evidence_gate.py"), "--file", str(ledger), "--mode", "1", "--script", str(script)
    ], capture_output=True, text=True)
    assert proc.returncode == 1
    assert "absolute certainty" in (proc.stderr + proc.stdout).lower()



def test_claim_gate_blocks_qualified_causation_without_qualifier(tmp_path):
    ledger = tmp_path / "claims-cause.json"
    write_json(ledger, {
        "mode": "2",
        "topic": "space weather",
        "claims": [{
            "claim_id": "cause1",
            "statement": "The ionospheric disturbance may contribute to GPS positioning errors during the event.",
            "claim_type": "causation",
            "certainty": "preliminary",
            "decision": "qualified",
            "allowed_wording": "The disturbance may contribute to GPS positioning errors under these conditions.",
            "visual_rule": "Show a qualified conceptual link, not a guaranteed direct failure.",
            "sources": [{
                "url": "https://example.org/official",
                "source_type": "authoritative",
                "supports": "The source supports a possible contribution to positioning error, not deterministic failure."
            }]
        }]
    })
    bad = tmp_path / "bad.txt"
    bad.write_text("Nhiễu loạn tầng điện ly gây ra sai số định vị GPS trong sự kiện này.", encoding="utf-8")
    proc = subprocess.run([sys.executable, str(TOOLS / "claim_evidence_gate.py"), "--file", str(ledger), "--mode", "2", "--script", str(bad)], capture_output=True, text=True)
    assert proc.returncode == 1

    good = tmp_path / "good.txt"
    good.write_text("Nhiễu loạn tầng điện ly có thể gây ra sai số định vị GPS trong những điều kiện như vậy.", encoding="utf-8")
    proc = subprocess.run([sys.executable, str(TOOLS / "claim_evidence_gate.py"), "--file", str(ledger), "--mode", "2", "--script", str(good)], capture_output=True, text=True)
    # Cross-language claim matching is conservative; this sentence must at
    # minimum not fail for losing the uncertainty qualifier.
    assert "lost its uncertainty qualifier" not in (proc.stderr + proc.stdout).lower()


def test_editorial_gate_long_60000_chars_is_below_hard_floor(tmp_path):
    lock = tmp_path / "lock.json"
    write_json(lock, lock_data("long"))
    script = tmp_path / "master_script.txt"
    script.write_text("a" * 60000, encoding="utf-8")
    proc = run_gate(lock, script, "long")
    combined = (proc.stdout + proc.stderr).lower()
    assert proc.returncode == 1
    assert "too short" in combined
    assert "60000" in combined
