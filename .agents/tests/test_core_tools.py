#!/usr/bin/env python3
import sys
from pathlib import Path

import pytest

AGENTS = Path(__file__).resolve().parents[1]
TOOLS = AGENTS / "tools"
sys.path.insert(0, str(TOOLS))

import word_splitter as ws  # noqa: E402
import audio_timeline_aligner as ata  # noqa: E402
import qa_automation as qa  # noqa: E402


def test_word_splitter_abbreviation_and_offsets():
    text = "Dr. Smith studies black holes carefully every night. The telescope records a second signal tonight."
    sentences = ws.split_sentences(text)
    assert len(sentences) == 2
    scenes, next_scene, next_sentence = ws.build_scenes(text, 10, scene_start=7, sentence_start=20)
    assert scenes[0]["scene"] == 7
    assert next_scene == 7 + len(scenes)
    assert next_sentence == 22
    assert sum(len(s["voiceover"].split()) for s in scenes) == len(text.split())
    assert all(s["sub"] == s["voiceover"] for s in scenes)


def test_word_splitter_decimal_and_numbered_list_preserve_text():
    text = "The value is 8. 3 units in this notation. There are 2 ideas: 1. First idea remains plausible. 2. Second idea remains open."
    scenes, _, _ = ws.build_scenes(text, 10)
    out = " ".join(s["voiceover"] for s in scenes)
    assert out.split() == text.split()
    for sid in {s["sentence_id"] for s in scenes}:
        parts = [s["part"] for s in scenes if s["sentence_id"] == sid]
        denoms = {int(p.split("/")[1]) for p in parts}
        assert len(denoms) == 1
        assert [int(p.split("/")[0]) for p in parts] == list(range(1, len(parts) + 1))


def test_audio_alignment_exact_synthetic_words():
    scenes = [
        {"scene": 1, "voiceover": "alpha beta gamma delta"},
        {"scene": 2, "voiceover": "epsilon zeta eta theta"},
    ]
    raw = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"]
    words = [
        {"word": w, "norm": w, "start": i * 0.5, "end": i * 0.5 + 0.4}
        for i, w in enumerate(raw)
    ]
    timelines = ata.align_scenes_with_words(scenes, words, 4.0, min_boundary_confidence=0.8)
    assert len(timelines) == 2
    assert timelines[0]["start"] == 0.0
    assert timelines[1]["start"] == timelines[0]["end"]
    assert timelines[-1]["end"] == 4.0
    ata.validate_raw_timelines(timelines, 2)


def test_audio_alignment_refuses_zero_word_fabrication_by_default():
    scenes = [{"scene": 1, "voiceover": "alpha beta"}]
    with pytest.raises(RuntimeError):
        ata.align_scenes_with_words(scenes, [], 2.0)
    fallback = ata.align_scenes_with_words(scenes, [], 2.0, allow_proportional_fallback=True)
    assert fallback == [{"start": 0.0, "end": 2.0}]


def test_audio_timeline_validation_rejects_gap():
    with pytest.raises(RuntimeError):
        ata.validate_raw_timelines([{"start": 0.0, "end": 1.0}, {"start": 1.2, "end": 2.0}], 2)


def test_long_master_script_requires_strictly_more_than_60000_chars(tmp_path):
    folder = tmp_path / "video_long" / "sample"
    folder.mkdir(parents=True)
    script = folder / "master_script.txt"

    script.write_text("a" * 60000, encoding="utf-8")
    assert qa.check_master_script_length(folder, "long") is False

    script.write_text("a" * 60001, encoding="utf-8")
    assert qa.check_master_script_length(folder, "long") is True

    script.write_text("a" * 65000, encoding="utf-8")
    assert qa.check_master_script_length(folder, "long") is True
