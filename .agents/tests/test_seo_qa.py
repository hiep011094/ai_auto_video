#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path

AGENTS = Path(__file__).resolve().parents[1]
TOOL = AGENTS / "tools" / "seo_qa.py"
TAGS = ["Phật giáo", "chánh niệm", "từ bi", "buông bỏ", "vô thường", "Phật pháp", "thiền tập", "tỉnh thức", "sân hận", "an lạc", "trí tuệ", "tu tập", "kinh điển", "lòng biết ơn", "hiểu và thương"]


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def run_qa(folder: Path, lang="vi", video_type="short"):
    return subprocess.run(
        [sys.executable, str(TOOL), "--folder", str(folder), "--lang", lang, "--video-type", video_type],
        capture_output=True, text=True,
    )


def valid_desc(extra=""):
    return (
        "Cùng tìm hiểu cách chánh niệm giúp ta nhận biết cảm xúc và dừng lại trước khi phản ứng trong cơn giận. "
        "Video gợi mở thực hành Phật giáo trong đời sống, phân biệt lời kinh với diễn giải và câu chuyện minh họa. "
        + extra + "\n\n#PhatGiao #ChanhNiem #TuBi"
    )


def test_seo_short_valid_and_url_policy(tmp_path):
    folder = tmp_path / "data" / "video_short" / "seo"
    write_json(folder / "seo_optimized.json", {"short": {
        "title": "Chánh niệm giúp ta nhận diện và chuyển hóa những cơn giận",
        "description": valid_desc(),
        "keywords": TAGS,
    }})
    p = run_qa(folder)
    assert p.returncode == 0, p.stdout + p.stderr

    data = json.loads((folder / "seo_optimized.json").read_text(encoding="utf-8"))
    data["short"]["description"] = valid_desc("More: https://example.com/source ")
    write_json(folder / "seo_optimized.json", data)
    p = run_qa(folder)
    assert p.returncode == 1
    assert "outside project allow-list" in p.stderr


def test_seo_description_cap_is_utf8_bytes(tmp_path):
    folder = tmp_path / "data" / "video_short" / "bytes"
    write_json(folder / "seo_optimized.json", {"short": {
        "title": "Chánh niệm giúp ta nhận diện và chuyển hóa những cơn giận",
        "description": ("é" * 2600) + "\n#PhatGiao #ChanhNiem #TuBi",
        "keywords": TAGS,
    }})
    p = run_qa(folder)
    assert p.returncode == 1
    assert "5000 UTF-8 bytes" in p.stderr


def test_seo_long_timestamps_must_match_chapter_timelines(tmp_path):
    folder = tmp_path / "data" / "video_long" / "seo-long"
    write_json(folder / "chapter_01.json", [{"timeline": {"start": 0.0}}])
    write_json(folder / "chapter_02.json", [{"timeline": {"start": 60.0}}])
    desc = (
        "Tìm hiểu chánh niệm và lòng từ bi qua thực hành Phật giáo, nhận biết cảm xúc và nuôi dưỡng cách ứng xử bình an.\n\n"
        "00:00 Nhận diện cảm xúc\n01:00 Thực hành chánh niệm\n\n"
        "#PhatGiao #ChanhNiem #TuBi"
    )
    write_json(folder / "seo_optimized.json", {"long": {
        "title": "Chánh niệm và từ bi trong thực hành Phật giáo hằng ngày",
        "description": desc,
        "keywords": TAGS,
    }})
    p = run_qa(folder, video_type="long")
    assert p.returncode == 0, p.stdout + p.stderr

    data = json.loads((folder / "seo_optimized.json").read_text(encoding="utf-8"))
    data["long"]["description"] = desc.replace("01:00 Thực", "01:01 Thực")
    write_json(folder / "seo_optimized.json", data)
    p = run_qa(folder, video_type="long")
    assert p.returncode == 1
    assert "do not match timeline starts" in p.stderr
