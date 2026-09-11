#!/usr/bin/env python3
"""Regression tests for high-risk deterministic QA and anti-laziness gates."""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

AGENTS = Path(__file__).resolve().parents[1]
TOOLS = AGENTS / "tools"
sys.path.insert(0, str(TOOLS))
import qa_automation as qa  # noqa: E402
import category_selector as category_selector  # noqa: E402
import category_balance_checker as category_balance_checker  # noqa: E402
from semantic_receipts import scene_payload_hash, sha256_file, write_receipts  # noqa: E402

try:
    import pytest
except ImportError:  # custom script runner still works without pytest installed
    pytest = None

if pytest is not None:
    @pytest.fixture
    def tmp(tmp_path):
        return tmp_path


FILM_LOOK = "cinematic documentary, subtle film grain, high detail, realistic"
NEGATIVES = ["watermark", "text overlay", "logo", *qa.MANDATORY_SAFETY_NEGATIVES]
SINGLE_TAKE = qa.SINGLE_TAKE_ANCHOR
NO_EDIT_NEG = qa.NO_INTERNAL_EDIT_NEGATIVE


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def valid_visual_bible(ratio="9:16"):
    return {
        "story_anchor": "A coherent scientific visual investigation that remains grounded in the current narration and closes on the evidence.",
        "characters": [],
        "locations": [],
        "key_objects": [],
        "visual_style": {"aspect_ratio": ratio, "film_look": FILM_LOOK, "color_grading": "restrained cool blue scientific grade"},
        "lighting_timeline": [{"stage": "body", "time_of_day": "controlled interior", "mood": "scientific"}],
        "camera_style": {"lens": "35mm cinematic lens", "movement_notes": "slow controlled dolly and locked-off inserts"},
        "negative_keywords": NEGATIVES,
    }


def detailed_prompt(subject="a neutral scientific instrument", extra=""):
    body = (
        f"{SINGLE_TAKE} "
        f"Cinematic medium-wide eye-level shot of {subject} centered in a realistic research environment, "
        "the camera performs a slow controlled dolly-in on a straight axis while the instrument remains spatially stable. "
        "A 35mm lens with shallow depth of field keeps the primary mechanism crisp while the distant background falls into soft bokeh. "
        "Cool practical light from the left and a restrained rim light from the rear reveal brushed metal, glass reflections, fine surface wear, "
        "and physically plausible shadow direction. The mechanism performs one continuous visible process throughout the uninterrupted take: "
        "a calibrated indicator arm moves gradually across its range while a small status lamp changes intensity and a thin reflection travels across the glass. "
        "No new subject or location appears; scale, contact points, camera height, and light direction remain consistent from the opening frame to the end. "
        "The shot ends with the indicator settled at its final position and the camera slightly closer, creating a precise end-frame state for the next scene. "
        f"{extra} {FILM_LOOK}. Restrained cool blue scientific color grading, realistic materials, natural optical falloff, controlled contrast. "
        f"Negative: {', '.join(NEGATIVES)}, {NO_EDIT_NEG}"
    )
    assert len(body) >= 800
    return body


def base_scene(scene, words, sid=1, part="1/1", prompt=None):
    vo = " ".join(f"word{i}" for i in range(words))
    return {
        "scene": scene,
        "voiceover": vo,
        "sub": vo,
        "context_ref": vo + " extra context words",
        "sentence_id": sid,
        "part": part,
        "continuity_ref": "opening" if scene == 1 else "Previous end: the prior scientific subject is centered with light from camera-left and a stable camera axis. Current opening: the current scientific subject begins centered on the same axis under matching light. Editorial relationship: matched conceptual cut.",
        "shot_type": "wide" if scene % 2 else "close-up",
        "veo_prompt": prompt or detailed_prompt(f"scientific object {scene}"),
    }


def make_short_folder(tmp, name="x"):
    folder = tmp / "data" / "video_short" / name
    folder.mkdir(parents=True)
    (folder / "master_script.txt").write_text("one two three four five six seven eight nine ten", encoding="utf-8")
    write_json(folder / "visual_bible.json", valid_visual_bible())
    return folder


def test_part_gate(tmp):
    folder = make_short_folder(tmp, "part")
    write_json(folder / "chapter_01.json", [base_scene(1, 10, 1, "9/2")])
    assert qa.check_part_sequences(folder) is False
    write_json(folder / "chapter_01.json", [base_scene(1, 10, 1, "1/2"), base_scene(2, 4, 1, "2/2")])
    assert qa.check_part_sequences(folder) is True


def test_word_gate(tmp):
    folder = make_short_folder(tmp, "words")
    write_json(folder / "chapter_01.json", [base_scene(1, 9, 1, "1/2"), base_scene(2, 4, 1, "2/2")])
    assert qa.check_word_counts_and_sub(folder, "short", "en") is False
    write_json(folder / "chapter_01.json", [base_scene(1, 10, 1, "1/2"), base_scene(2, 4, 1, "2/2")])
    assert qa.check_word_counts_and_sub(folder, "short", "en") is True


def test_aspect_gate(tmp):
    folder = make_short_folder(tmp, "aspect")
    write_json(folder / "chapter_01.json", [base_scene(1, 10)])
    write_json(folder / "visual_bible.json", valid_visual_bible("16:9"))
    assert qa.check_visual_bible_contract(folder, "short") is False
    write_json(folder / "visual_bible.json", valid_visual_bible("9:16"))
    assert qa.check_visual_bible_contract(folder, "short") is True


def test_schema_extra_field(tmp):
    scene = base_scene(1, 10)
    scene["unexpected_field"] = "must fail"
    chapter = tmp / "chapter.json"; write_json(chapter, [scene])
    proc = subprocess.run([
        sys.executable, str(TOOLS / "schema_validator.py"),
        "--schema", str(AGENTS / "schemas" / "chapter.schema.json"),
        "--file", str(chapter),
    ], capture_output=True, text=True)
    assert proc.returncode == 1, proc.stdout + proc.stderr
    assert "unexpected field" in proc.stderr


def test_cross_category_duplicate(tmp):
    history = tmp / "history.json"
    write_json(history, [{
        "title": "Câu chuyện Đức Phật rời hoàng cung",
        "main_video_content": "Câu chuyện Đức Phật rời hoàng cung",
        "category": "buddhist_wisdom",
        "language": "vi",
        "type": "short",
        "date": "2026-01-01",
        "id": "old"
    }])
    proc = subprocess.run([
        sys.executable, str(TOOLS / "check_topic_duplicate.py"),
        "--new-topic", "Câu chuyện Đức Phật rời hoàng cung",
        "--history", str(history),
        "--category", "buddhist_life",
        "--language", "vi",
        "--video-type", "short",
        "--skip-ai", "--json-output"
    ], capture_output=True, text=True, cwd=str(AGENTS.parent))
    assert proc.returncode == 1, proc.stdout + proc.stderr
    data = json.loads(proc.stdout)
    assert data["global_keyword_check"]["is_unique"] is False


def test_master_coverage_gate(tmp):
    folder = make_short_folder(tmp, "coverage")
    master = "one two three four five six seven eight nine ten"
    write_json(folder / "chapter_01.json", [base_scene(1, 10)])
    assert qa.check_master_script_scene_coverage(folder) is False
    scene = base_scene(1, 10)
    scene["voiceover"] = master
    scene["sub"] = master
    write_json(folder / "chapter_01.json", [scene])
    assert qa.check_master_script_scene_coverage(folder) is True


def test_history_array_not_smart_validated(tmp):
    history = tmp / "history_array.json"
    write_json(history, [])
    proc = subprocess.run([
        sys.executable, str(TOOLS / "schema_validator.py"),
        "--schema", str(AGENTS / "schemas" / "history.schema.json"),
        "--file", str(history),
    ], capture_output=True, text=True)
    assert proc.returncode == 1, proc.stdout + proc.stderr
    assert "wrong type" in proc.stderr


def test_audio_is_hard_fail(tmp):
    folder = make_short_folder(tmp, "audio")
    scene = base_scene(1, 10, prompt=detailed_prompt(extra="Music swells in the background."))
    write_json(folder / "chapter_01.json", [scene])
    assert qa.check_no_audio_mention(folder) is False
    scene["veo_prompt"] = detailed_prompt()
    write_json(folder / "chapter_01.json", [scene])
    assert qa.check_no_audio_mention(folder) is True


def test_prompt_craft_contract(tmp):
    folder = make_short_folder(tmp, "craft")
    write_json(folder / "chapter_01.json", [base_scene(1, 10)])
    assert qa.check_prompt_craft_contract(folder) is True
    bad = base_scene(1, 10, prompt=(SINGLE_TAKE + " Cinematic view of an object. " + "useful detail " * 60 + f"Negative: {', '.join(NEGATIVES)}, {NO_EDIT_NEG}"))
    write_json(folder / "chapter_01.json", [bad])
    assert qa.check_prompt_craft_contract(folder) is False


def test_exact_prompt_duplicate_gate(tmp):
    folder = make_short_folder(tmp, "dupe")
    p = detailed_prompt()
    write_json(folder / "chapter_01.json", [base_scene(1, 10, 1, "1/2", p), base_scene(2, 4, 1, "2/2", p)])
    assert qa.check_exact_prompt_duplicates(folder) is False


def test_batch_guard_pass_and_checkpoint(tmp):
    folder = make_short_folder(tmp, "batch")
    master = "one two three four five six seven eight nine ten"
    (folder / "master_script.txt").write_text(master, encoding="utf-8")
    scenes = [base_scene(1, 10, 1, "1/2", detailed_prompt("instrument alpha")),
              base_scene(2, 4, 1, "2/2", detailed_prompt("instrument beta", "A different physical geometry and camera subject maintain visual progression. The second instrument uses a tall copper vacuum chamber with braided hoses, a lateral gauge assembly, frost crystals on the lower flange, a side-lit inspection window, a low three-quarter camera angle, and a gentle lateral tracking move that emphasizes depth rather than repeating the previous frontal composition. Fine condensation drifts near the base while the gauge needle settles, producing a clearly distinct visual proof beat."))]
    write_json(folder / "chapter_01.json", scenes)
    proc = subprocess.run([
        sys.executable, str(TOOLS / "veo_batch_guard.py"), "--folder", str(folder),
        "--start", "1", "--end", "2", "--checkpoint"
    ], capture_output=True, text=True)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    state = tmp / "data" / ".agent_runtime" / "_veo_progress_batch.json"
    assert state.exists()
    data = json.loads(state.read_text(encoding="utf-8"))
    assert data["last_completed_scene"] == 2


def test_batch_guard_blocks_lazy_prompt(tmp):
    folder = make_short_folder(tmp, "lazy")
    scene = base_scene(1, 10, prompt=f"{SINGLE_TAKE} Cinematic shot of a planet. Negative: watermark, text overlay, logo, {NO_EDIT_NEG}")
    write_json(folder / "chapter_01.json", [scene])
    proc = subprocess.run([
        sys.executable, str(TOOLS / "veo_batch_guard.py"), "--folder", str(folder),
        "--start", "1", "--end", "1"
    ], capture_output=True, text=True)
    assert proc.returncode == 1, proc.stdout + proc.stderr



def test_positive_richness_ignores_negative(tmp):
    folder=make_short_folder(tmp,"positive")
    pos=("Cinematic 35mm camera shot with deep focus and cool practical lighting. " + "controlled visual detail "*20 + "The shot ends with the object centered. ")
    prompt=SINGLE_TAKE+" "+pos+"Negative: "+("watermark, text overlay, logo, "+NO_EDIT_NEG+", ")*30
    write_json(folder/"chapter_01.json",[base_scene(1,10,prompt=prompt)])
    assert qa.check_positive_visual_richness(folder) is False


def test_domain_and_camera_physics_gate(tmp):
    folder=make_short_folder(tmp,"domain")
    bad=detailed_prompt("desert landscape", "A drone shot moves into a detailed scientific cross-section of the crust while a crane rises thousands of meters.")
    write_json(folder/"chapter_01.json",[base_scene(1,10,prompt=bad)])
    assert qa.check_visual_domain_and_camera_physics(folder) is False
    write_json(folder/"chapter_01.json",[base_scene(1,10,prompt=detailed_prompt("geological cross-section", "A virtual cross-section camera tracks upward within the same exposed stratigraphic simulation."))])
    assert qa.check_visual_domain_and_camera_physics(folder) is True


def test_positive_negative_conflict_gate(tmp):
    folder=make_short_folder(tmp,"conflict")
    bad=detailed_prompt("heritage plaque", "An official logo and engraved lettering reading the institution name remain clearly visible.")
    write_json(folder/"chapter_01.json",[base_scene(1,10,prompt=bad)])
    assert qa.check_positive_negative_conflicts(folder) is False
    write_json(folder/"chapter_01.json",[base_scene(1,10,prompt=detailed_prompt("blank commemorative plaque", "Its unlabeled bronze surface catches a controlled reflection."))])
    assert qa.check_positive_negative_conflicts(folder) is True


def test_continuity_structured_handoff(tmp):
    folder=make_short_folder(tmp,"continuity")
    a=base_scene(1,10,1,"1/2")
    b=base_scene(2,4,1,"2/2"); b['continuity_ref']='transitioning to a new laboratory view'
    write_json(folder/"chapter_01.json",[a,b])
    assert qa.check_continuity_handoff_format(folder) is False
    b['continuity_ref']='Previous end: the instrument is centered under cool light. Current opening: the next instrument begins centered under matched cool light. Editorial relationship: matched conceptual cut.'
    write_json(folder/"chapter_01.json",[a,b])
    assert qa.check_continuity_handoff_format(folder) is True


def test_claim_evidence_gate(tmp):
    ledger=tmp/'claims.json'
    write_json(ledger,{"mode":"2","topic":"test","claims":[{"claim_id":"c1","statement":"Agency X designated the site in 2026","claim_type":"institution","certainty":"established","decision":"verified","allowed_wording":"Agency X designated the site in 2026.","visual_rule":"Show the site and an unlabeled recognition context; do not invent a second institution.","sources":[{"url":"https://example.org/official","source_type":"authoritative","supports":"Official source directly supports the designation and date."}]}]})
    proc=subprocess.run([sys.executable,str(TOOLS/'claim_evidence_gate.py'),'--file',str(ledger),'--mode','2'],capture_output=True,text=True)
    assert proc.returncode==0,proc.stdout+proc.stderr
    d=json.loads(ledger.read_text()); d['claims'][0]['sources']=[{"url":"https://example.com/blog","source_type":"community_signal"}]; write_json(ledger,d)
    proc=subprocess.run([sys.executable,str(TOOLS/'claim_evidence_gate.py'),'--file',str(ledger),'--mode','2'],capture_output=True,text=True)
    assert proc.returncode==1



def test_strict_no_internal_transition_gate(tmp):
    folder = make_short_folder(tmp, "no_transition")
    bad = detailed_prompt("a scientific instrument", "Then the scene changes to another laboratory and dissolves into a second setup.")
    write_json(folder / "chapter_01.json", [base_scene(1, 10, prompt=bad)])
    assert qa.check_no_internal_transitions(folder) is False
    write_json(folder / "chapter_01.json", [base_scene(1, 10, prompt=detailed_prompt())])
    assert qa.check_no_internal_transitions(folder) is True


def test_named_subject_swap_gate(tmp):
    folder = make_short_folder(tmp, "subject_swap")
    scene = base_scene(1, 10, prompt=detailed_prompt("planet Mercury"))
    scene["voiceover"] = "Mặt Trăng có đường kính khoảng ba nghìn bốn trăm ki lô mét."
    scene["sub"] = scene["voiceover"]
    scene["context_ref"] = scene["voiceover"]
    write_json(folder / "chapter_01.json", [scene])
    assert qa.check_named_subject_and_count_lock(folder) is False
    scene["veo_prompt"] = detailed_prompt("the Moon")
    write_json(folder / "chapter_01.json", [scene])
    assert qa.check_named_subject_and_count_lock(folder) is True


def test_large_exact_count_gate(tmp):
    folder = make_short_folder(tmp, "exact_count")
    bad = detailed_prompt("a scale comparison", "A straight line of 109 miniature Earth spheres remains individually countable.")
    write_json(folder / "chapter_01.json", [base_scene(1, 10, prompt=bad)])
    assert qa.check_named_subject_and_count_lock(folder) is False
    good = detailed_prompt("a representative scale comparison", "A few representative Earth-sized spheres establish the magnitude while exact numeric annotation is reserved for post-production.")
    write_json(folder / "chapter_01.json", [base_scene(1, 10, prompt=good)])
    assert qa.check_named_subject_and_count_lock(folder) is True


def test_batch_guard_requires_semantic_receipt_before_advancing(tmp):
    folder = make_short_folder(tmp, "semantic_chain")
    (folder / "master_script.txt").write_text("one two three four five six seven eight nine ten", encoding="utf-8")
    scenes = [
        base_scene(1, 10, 1, "1/2", detailed_prompt("instrument alpha")),
        base_scene(2, 4, 1, "2/2", detailed_prompt("instrument beta", "A different physical geometry and camera subject maintain visual progression. The second instrument uses a tall copper vacuum chamber with braided hoses, a lateral gauge assembly, frost crystals on the lower flange, a side-lit inspection window, a low three-quarter camera angle, and a gentle lateral tracking move that emphasizes depth rather than repeating the previous frontal composition. Fine condensation drifts near the base while the gauge needle settles, producing a clearly distinct visual proof beat.")),
        base_scene(3, 10, 2, "1/1", detailed_prompt("instrument gamma")),
    ]
    write_json(folder / "chapter_01.json", scenes)
    proc = subprocess.run([sys.executable, str(TOOLS / "veo_batch_guard.py"), "--folder", str(folder), "--start", "1", "--end", "2", "--checkpoint"], capture_output=True, text=True)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    proc = subprocess.run([sys.executable, str(TOOLS / "veo_batch_guard.py"), "--folder", str(folder), "--start", "3", "--end", "3"], capture_output=True, text=True)
    assert proc.returncode == 2, proc.stdout + proc.stderr
    assert "semantic PASS receipt" in (proc.stdout + proc.stderr)



def test_batch_guard_accepts_current_semantic_receipt_and_rejects_stale(tmp):
    folder = make_short_folder(tmp, "semantic_receipt_ok")
    scenes = [
        base_scene(1, 10, 1, "1/2", detailed_prompt("instrument alpha")),
        base_scene(2, 4, 1, "2/2", detailed_prompt("instrument beta", "A tall copper vacuum chamber dominates this distinct beat, with braided hoses hanging from a side manifold, frost crystals building across the lower flange, an amber inspection window, a lateral gauge assembly and matte ceramic supports. The camera tracks gently from right to left at a low three-quarter angle rather than approaching frontally, allowing foreground tubing to create parallax while the rear wall remains soft. A narrow side light skims the copper cylinder, condensation drifts downward, the pressure needle settles slowly, and a small mechanical valve rotates a few degrees before stopping. The composition emphasizes vertical height, asymmetric negative space and layered depth, making the geometry, motion pattern and screen direction materially different from the prior instrument shot while preserving the same documentary film world.")),
        base_scene(3, 10, 2, "1/1", detailed_prompt("instrument gamma")),
    ]
    write_json(folder / "chapter_01.json", scenes)
    proc = subprocess.run([sys.executable, str(TOOLS / "veo_batch_guard.py"), "--folder", str(folder), "--start", "1", "--end", "2", "--checkpoint"], capture_output=True, text=True)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    write_receipts(folder, {
        "video_folder": folder.name,
        "receipts": [{
            "start": 1, "end": 2, "status": "pass", "ai_model": "test", "semantic_ruleset": "strict-scene-lock-v5",
            "scene_payload_sha256": scene_payload_hash(scenes[:2]),
            "master_script_sha256": sha256_file(folder / "master_script.txt"),
            "visual_bible_sha256": sha256_file(folder / "visual_bible.json"),
            "passed_at_vn": "2026-01-01T00:00:00+07:00"
        }]
    })
    proc = subprocess.run([sys.executable, str(TOOLS / "veo_batch_guard.py"), "--folder", str(folder), "--start", "3", "--end", "3"], capture_output=True, text=True)
    assert proc.returncode == 0, proc.stdout + proc.stderr

    # Editing a previously semantically approved prompt invalidates the receipt.
    scenes[0]["veo_prompt"] = detailed_prompt("instrument alpha changed", "A visibly different housing geometry invalidates the old semantic receipt hash while retaining the same source script and bible.")
    write_json(folder / "chapter_01.json", scenes)
    proc = subprocess.run([sys.executable, str(TOOLS / "veo_batch_guard.py"), "--folder", str(folder), "--start", "3", "--end", "3"], capture_output=True, text=True)
    assert proc.returncode == 2, proc.stdout + proc.stderr
    assert "semantic PASS receipt" in (proc.stdout + proc.stderr)



def test_final_semantic_receipt_coverage_gate(tmp):
    folder = make_short_folder(tmp, "receipt_coverage")
    scenes = [
        base_scene(1, 10, 1, "1/2", detailed_prompt("instrument alpha")),
        base_scene(2, 4, 1, "2/2", detailed_prompt("instrument beta", "A tall copper vacuum chamber dominates this second beat, with braided hoses on a side manifold, frost crystals spreading across the lower flange, matte ceramic supports, an amber inspection window and a lateral gauge assembly. The camera tracks from right to left at a low three-quarter angle rather than approaching frontally, using foreground tubing for parallax while the rear wall stays soft. A narrow side light skims the copper cylinder, condensation drifts downward, the pressure needle settles slowly and a small valve rotates a few degrees before stopping. The composition emphasizes vertical height, asymmetric negative space, layered depth and opposite screen movement so the geometry, motion pattern and viewing angle are materially distinct while the same documentary world remains intact.")),
    ]
    write_json(folder / "chapter_01.json", scenes)
    proc = subprocess.run([sys.executable, str(TOOLS / "veo_batch_guard.py"), "--folder", str(folder), "--start", "1", "--end", "2", "--checkpoint"], capture_output=True, text=True)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert qa.check_semantic_receipt_coverage(folder) is False
    write_receipts(folder, {
        "video_folder": folder.name,
        "receipts": [{
            "start": 1, "end": 2, "status": "pass", "ai_model": "test", "semantic_ruleset": "strict-scene-lock-v5",
            "scene_payload_sha256": scene_payload_hash(scenes),
            "master_script_sha256": sha256_file(folder / "master_script.txt"),
            "visual_bible_sha256": sha256_file(folder / "visual_bible.json"),
            "passed_at_vn": "2026-01-01T00:00:00+07:00"
        }]
    })
    assert qa.check_semantic_receipt_coverage(folder) is True




def _category_entry(category, index):
    return {
        "title": f"video-{index}-{category}",
        "main_video_content": f"content for {category}",
        "category": category,
        "language": "vi",
        "type": "long",
        "date": f"2026-01-{index:02d}",
        "created_at": f"2026-01-{index:02d}T00:00:00+07:00",
    }


def test_category_selector_strict_full_cycle(tmp):
    history = []
    expected_cycle = ["buddhist_life", "buddhist_wisdom"]
    generated = []

    for index in range(1, 13):
        result = category_selector.select_next_category(history)
        selected = result["selected_category"]
        generated.append(selected)

        # HARD invariant: next ACTIVE category must differ from the previous ACTIVE category.
        if history:
            assert selected != history[-1]["category"], (generated, result)
        assert result["rotation_mode"] == "strict_full_cycle"
        assert result["rotation_lock_window"] == 1

        history.append(_category_entry(selected, index))

    # Every completed pair contains both ACTIVE categories exactly once.
    for start in range(0, len(generated), 2):
        block = generated[start:start + 2]
        assert block == expected_cycle, generated
        assert set(block) == set(expected_cycle)

    # Stronger rolling-window invariant across cycle boundaries.
    for start in range(0, len(generated) - 1):
        assert set(generated[start:start + 2]) == set(expected_cycle), generated


def test_category_selector_legacy_history_recovers_without_reusing_locked_category(tmp):
    # Legacy/non-compliant ACTIVE sequence ending in buddhist_life: next must be buddhist_wisdom.
    history = [
        _category_entry("buddhist_life", 1),
        _category_entry("buddhist_wisdom", 2),
        _category_entry("buddhist_life", 3),
    ]
    result = category_selector.select_next_category(history)
    assert set(result["locked_categories"]) == {"buddhist_life"}
    assert result["selected_category"] == "buddhist_wisdom"
    assert result["selected_category"] not in result["last_3_categories"]
    assert set(result["available_categories"]) == {"buddhist_wisdom"}


def test_category_selector_ignores_retired_or_invalid_history_category(tmp):
    history = [
        _category_entry("buddhist_life", 1),
        _category_entry("hypothesis", 2),  # retired category must be ignored
        _category_entry("buddhist_wisdom", 3),
    ]
    result = category_selector.select_next_category(history)
    assert result["rotation_lock_window"] == 1
    assert set(result["locked_categories"]) == {"buddhist_wisdom"}
    assert result["selected_category"] == "buddhist_life"


def test_category_balance_checker_flags_repeat_within_two_active_videos(tmp):
    compliant = [
        _category_entry("buddhist_life", 1),
        _category_entry("buddhist_wisdom", 2),
    ]
    ok = category_balance_checker.check_balance(compliant, window=20)
    assert ok["violations"] == []
    assert ok["recommendation"] == "buddhist_life"

    non_compliant = [
        _category_entry("buddhist_life", 1),
        _category_entry("buddhist_life", 2),
    ]
    bad = category_balance_checker.check_balance(non_compliant, window=20)
    assert bad["violations"], bad
    assert any(v["category"] == "buddhist_life" and v["distance"] == 1 for v in bad["violations"])


def test_category_selector_is_deterministic(tmp):
    history = tmp / "history.json"
    write_json(history, [{
        "title": "Old item", "main_video_content": "Old item about dharma", "category": "buddhist_life",
        "language": "vi", "type": "short", "date": "2026-01-01", "created_at": "2026-01-01T00:00:00+07:00"
    }])
    results = set()
    for seed in ("1", "2", "3", "4", "99"):
        env = dict(__import__("os").environ)
        env["PYTHONHASHSEED"] = seed
        proc = subprocess.run([
            sys.executable, str(TOOLS / "category_selector.py"), "--history", str(history), "--output-json"
        ], capture_output=True, text=True, env=env)
        assert proc.returncode == 0, proc.stdout + proc.stderr
        results.add(json.loads(proc.stdout)["selected_category"])
    assert len(results) == 1, results


def test_malformed_history_is_not_first_video(tmp):
    history = tmp / "history.json"
    write_json(history, {"unexpected": "object"})
    proc = subprocess.run([
        sys.executable, str(TOOLS / "category_selector.py"), "--history", str(history), "--output-json"
    ], capture_output=True, text=True)
    assert proc.returncode == 2
    assert "Unexpected history root" in proc.stderr


def test_english_language_gate_rejects_ascii_vietnamese(tmp):
    folder = make_short_folder(tmp, "lang_ascii_vi")
    bad = detailed_prompt(extra=("Mot canh quay khoa hoc trong phong thi nghiem voi thiet bi o trung tam va anh sang on dinh. " * 8))
    write_json(folder / "chapter_01.json", [base_scene(1, 10, prompt=bad)])
    assert qa.check_veo_prompt_language(folder) is False
    write_json(folder / "chapter_01.json", [base_scene(1, 10, prompt=detailed_prompt())])
    assert qa.check_veo_prompt_language(folder) is True


def test_timeline_integrity_gate(tmp):
    folder = make_short_folder(tmp, "timeline")
    a = base_scene(1, 10, 1, "1/2")
    b = base_scene(2, 4, 1, "2/2")
    a["timeline"] = {"start":0.0,"end":1.5,"duration":1.5,"start_formatted":"00:00.000","end_formatted":"00:01.500","speed":1.15}
    b["timeline"] = {"start":1.5,"end":3.0,"duration":1.5,"start_formatted":"00:01.500","end_formatted":"00:03.000","speed":1.15}
    write_json(folder / "chapter_01.json", [a,b])
    assert qa.check_timeline_integrity(folder) is True
    b["timeline"]["start"] = 1.7
    write_json(folder / "chapter_01.json", [a,b])
    assert qa.check_timeline_integrity(folder) is False


def test_claim_script_coverage_gate(tmp):
    ledger = tmp / "claims_coverage.json"
    script = tmp / "master_script.txt"
    script.write_text("NASA reported the object in 2026, and its measured distance was 42 km.", encoding="utf-8")
    write_json(ledger, {"mode":"2","topic":"test","claims":[{
        "claim_id":"c1","statement":"NASA reported the object in 2026 and measured a distance of 42 km.",
        "claim_type":"number","certainty":"established","decision":"verified",
        "allowed_wording":"NASA reported the object in 2026 and measured a distance of 42 km.",
        "visual_rule":"Show an unlabeled measurement context without inventing extra institutions.",
        "sources":[{"url":"https://example.org/official","source_type":"authoritative","supports":"Supports the NASA attribution, year, and 42 km measurement."}]
    }]})
    proc = subprocess.run([sys.executable, str(TOOLS / "claim_evidence_gate.py"), "--file", str(ledger), "--mode", "2", "--script", str(script)], capture_output=True, text=True)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    script.write_text("NASA reported the object in 2026, and its measured distance was 77 km.", encoding="utf-8")
    proc = subprocess.run([sys.executable, str(TOOLS / "claim_evidence_gate.py"), "--file", str(ledger), "--mode", "2", "--script", str(script)], capture_output=True, text=True)
    assert proc.returncode == 1

def main():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        test_part_gate(tmp)
        test_word_gate(tmp)
        test_aspect_gate(tmp)
        test_master_coverage_gate(tmp)
        test_schema_extra_field(tmp)
        test_history_array_not_smart_validated(tmp)
        test_cross_category_duplicate(tmp)
        test_audio_is_hard_fail(tmp)
        test_prompt_craft_contract(tmp)
        test_exact_prompt_duplicate_gate(tmp)
        test_batch_guard_pass_and_checkpoint(tmp)
        test_batch_guard_blocks_lazy_prompt(tmp)
        test_positive_richness_ignores_negative(tmp)
        test_domain_and_camera_physics_gate(tmp)
        test_positive_negative_conflict_gate(tmp)
        test_continuity_structured_handoff(tmp)
        test_claim_evidence_gate(tmp)
        test_strict_no_internal_transition_gate(tmp)
        test_named_subject_swap_gate(tmp)
        test_large_exact_count_gate(tmp)
        test_batch_guard_requires_semantic_receipt_before_advancing(tmp)
        test_batch_guard_accepts_current_semantic_receipt_and_rejects_stale(tmp)
        test_final_semantic_receipt_coverage_gate(tmp)
        test_category_selector_strict_full_cycle(tmp)
        test_category_selector_legacy_history_recovers_without_reusing_locked_category(tmp)
        test_category_selector_ignores_retired_or_invalid_history_category(tmp)
        test_category_balance_checker_flags_repeat_within_two_active_videos(tmp)
        test_category_selector_is_deterministic(tmp)
        test_malformed_history_is_not_first_video(tmp)
        test_english_language_gate_rejects_ascii_vietnamese(tmp)
        test_timeline_integrity_gate(tmp)
        test_claim_script_coverage_gate(tmp)
    print("ALL QUALITY-GATE REGRESSION TESTS PASSED")


if __name__ == "__main__":
    main()
