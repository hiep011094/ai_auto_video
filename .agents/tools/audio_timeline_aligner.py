#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
.agents/tools/audio_timeline_aligner.py
Phân tích file audio [tong_hop_loi_thoai_vbee, tong_hop_loi_thoai].[wav,mp3] (hoặc scene_*.wav)
và căn khớp chính xác thời lượng (timeline) theo từng cảnh trong chapter_[n].json.

Hỗ trợ:
- Tốc độ tùy chỉnh (mặc định 1.15x hoặc tốc độ thực của audio).
- Căn khớp bằng Whisper Word Timestamps + Sequence Alignment (cho file tổng hợp).
- Căn khớp bằng File Duration (nếu có các file scene_*.wav).
- Ghi trường 'timeline' chuẩn xác vào từng scene trong tất cả chapter_[n].json.
"""

import os
import sys
import re
import json
import glob
import math
import shutil
import hashlib
import argparse
import unicodedata
from typing import List, Dict, Any, Tuple, Optional

# Cấu hình UTF-8 cho stdout trên Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# Tự động chuyển tiếp sang .venv nếu môi trường hiện tại không có whisper/torch
def _ensure_venv():
    try:
        import whisper
        import torch
    except ImportError:
        # Tìm .venv trong thư mục dự án
        curr = os.path.abspath(os.path.dirname(__file__))
        root = os.path.abspath(os.path.join(curr, "..", ".."))
        candidates = [
            os.path.join(root, ".venv", "Scripts", "python.exe"),
            os.path.join(root, ".venv", "bin", "python"),
            os.path.join(os.getcwd(), ".venv", "Scripts", "python.exe"),
            os.path.join(os.getcwd(), ".venv", "bin", "python"),
        ]
        for c in candidates:
            if os.path.isfile(c) and os.path.abspath(c) != os.path.abspath(sys.executable):
                import subprocess
                cmd = [c, os.path.abspath(__file__)] + sys.argv[1:]
                res = subprocess.run(cmd)
                sys.exit(res.returncode)

from difflib import SequenceMatcher

def normalize_text(text: str) -> str:
    """Chuẩn hóa chuỗi văn bản: xóa dấu câu, khoảng trắng thừa, đưa về chữ thường Unicode NFKC."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"[^\w\s\d]", " ", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip().lower()
    return text

def phrase_sim(phrase_a: str, phrase_b: str) -> float:
    """Tính độ tương đồng chuỗi cụm từ có hỗ trợ biến âm tiếng Việt."""
    if not phrase_a or not phrase_b:
        return 0.0
    if phrase_a == phrase_b:
        return 1.0
    if phrase_a in phrase_b or phrase_b in phrase_a:
        return 0.9
    return SequenceMatcher(None, phrase_a, phrase_b).ratio()


def format_timestamp(seconds: float) -> str:
    """Định dạng giây thành chuỗi mm:ss.sss hoặc hh:mm:ss.sss"""
    if seconds < 0:
        seconds = 0.0
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = seconds % 60
    if hrs > 0:
        return f"{hrs:02d}:{mins:02d}:{secs:06.3f}"
    return f"{mins:02d}:{secs:06.3f}"


def get_audio_duration_wave_or_ffprobe(file_path: str) -> float:
    """Lấy thời lượng chính xác của file audio bằng soundfile/wave/ffprobe."""
    try:
        import soundfile as sf
        info = sf.info(file_path)
        return float(info.duration)
    except Exception:
        pass

    if file_path.lower().endswith(".wav"):
        try:
            import wave
            with wave.open(file_path, "rb") as wf:
                frames = wf.getnframes()
                rate = wf.getframerate()
                if rate > 0:
                    return float(frames / rate)
        except Exception:
            pass

    try:
        import subprocess
        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            file_path
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        return float(res.stdout.strip())
    except Exception as e:
        raise RuntimeError(f"Không thể đo thời lượng file audio {file_path}: {e}")


def find_project_audio(project_dir: str, explicit_audio: Optional[str] = None) -> Tuple[Optional[str], str]:
    """Tìm file audio phù hợp nhất trong thư mục dự án."""
    if explicit_audio:
        p = explicit_audio if os.path.isabs(explicit_audio) else os.path.join(project_dir, explicit_audio)
        if os.path.isfile(p):
            return p, "explicit"
        raise FileNotFoundError(f"Không tìm thấy file audio chỉ định: {explicit_audio}")

    candidates = [
        "tong_hop_loi_thoai_vbee.mp3",
        "tong_hop_loi_thoai_vbee.wav",
        "tong_hop_loi_thoai.wav",
        "tong_hop_loi_thoai.mp3",
    ]
    for cand in candidates:
        cand_path = os.path.join(project_dir, cand)
        if os.path.isfile(cand_path) and os.path.getsize(cand_path) > 0:
            return cand_path, "combined"

    scene_wavs = glob.glob(os.path.join(project_dir, "scene_*.wav"))
    if scene_wavs:
        return None, "individual_scenes"

    raise FileNotFoundError(f"Không tìm thấy file audio tổng hợp nào trong {project_dir}")


def _safe_dtw(x):
    """Pure-NumPy implementation of Dynamic Time Warping for robust execution on Windows."""
    import numpy as np
    N, M = x.shape
    cost = np.ones((N + 1, M + 1), dtype=np.float32) * np.inf
    trace = -np.ones((N + 1, M + 1), dtype=np.int32)

    cost[0, 0] = 0
    for j in range(1, M + 1):
        for i in range(1, N + 1):
            c0 = cost[i - 1, j - 1]
            c1 = cost[i - 1, j]
            c2 = cost[i, j - 1]

            if c0 < c1 and c0 < c2:
                c, t = c0, 0
            elif c1 < c0 and c1 < c2:
                c, t = c1, 1
            else:
                c, t = c2, 2

            cost[i, j] = x[i - 1, j - 1] + c
            trace[i, j] = t

    i, j = N, M
    trace_i, trace_j = [i - 1], [j - 1]
    while i > 1 or j > 1:
        t = trace[i, j]
        if t == 0:
            i -= 1
            j -= 1
        elif t == 1:
            i -= 1
        else:
            j -= 1
        trace_i.append(i - 1)
        trace_j.append(j - 1)

    return np.array(trace_i[::-1], dtype=np.int64), np.array(trace_j[::-1], dtype=np.int64)


def get_whisper_cache_path(audio_path: str, model_size: str) -> str:
    """Đường dẫn cache cho kết quả nhận diện Whisper."""
    curr = os.path.abspath(os.path.dirname(__file__))
    root = os.path.abspath(os.path.join(curr, "..", ".."))
    cache_dir = os.path.join(root, "data", ".agent_runtime", "_whisper_cache")
    os.makedirs(cache_dir, exist_ok=True)

    file_stat = os.stat(audio_path)
    key_src = f"{os.path.abspath(audio_path)}_{file_stat.st_size}_{int(file_stat.st_mtime)}_{model_size}"
    cache_hash = hashlib.md5(key_src.encode("utf-8")).hexdigest()[:12]
    base_name = re.sub(r"[^\w\-]", "_", os.path.splitext(os.path.basename(audio_path))[0])
    return os.path.join(cache_dir, f"{base_name}_{cache_hash}_{model_size}.json")


def transcribe_whisper_word_timestamps(audio_path: str, model_size: str = "base", device: str = "auto", no_cache: bool = False) -> List[Dict[str, Any]]:
    """Sử dụng Whisper để nhận diện lời thoại và trích xuất word-level timestamps (hỗ trợ cache)."""
    cache_path = get_whisper_cache_path(audio_path, model_size)
    if not no_cache and os.path.isfile(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                cached_words = json.load(f)
            if isinstance(cached_words, list) and len(cached_words) > 0:
                print(f"-> [Whisper Cache] Đã nạp {len(cached_words)} từ thoại có timestamp từ cache: {os.path.basename(cache_path)}")
                return cached_words
        except Exception as e:
            print(f"-> [Whisper Cache] Không thể nạp cache ({e}), tiến hành phân tích lại...")

    # Whisper/Torch are needed only for combined-audio ASR. Individual scene WAV
    # duration mode must remain usable without importing heavyweight ASR deps.
    _ensure_venv()
    try:
        import whisper
        import whisper.timing
        import torch
        whisper.timing.dtw_cpu = _safe_dtw
        whisper.timing.dtw = _safe_dtw
    except ImportError:
        raise RuntimeError("Cần cài đặt thư viện openai-whisper và torch để phân tích audio tổng hợp!")

    if device == "auto":
        dev = "cuda" if torch.cuda.is_available() else "cpu"
    else:
        dev = device

    print(f"-> [Whisper] Đang tải mô hình '{model_size}' trên thiết bị '{dev}'...")
    model = whisper.load_model(model_size, device=dev)

    print(f"-> [Whisper] Đang phân tích word-level timestamps file: {os.path.basename(audio_path)}...")
    result = model.transcribe(
        audio_path,
        word_timestamps=True,
        verbose=False,
        fp16=(dev == "cuda")
    )

    words = []
    for segment in result.get("segments", []):
        for w in segment.get("words", []):
            raw_word = w.get("word", "").strip()
            norm = normalize_text(raw_word)
            if norm:
                words.append({
                    "word": raw_word,
                    "norm": norm,
                    "start": float(w.get("start", 0.0)),
                    "end": float(w.get("end", 0.0))
                })

    print(f"-> [Whisper] Hoàn thành! Nhận diện được {len(words)} từ thoại có timestamp.")

    try:
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(words, f, ensure_ascii=False, indent=2)
        print(f"-> [Whisper Cache] Đã lưu cache kết quả ASR: {os.path.basename(cache_path)}")
    except Exception as e:
        print(f"-> [Whisper Cache] Không thể lưu cache: {e}")

    return words


def align_scenes_with_words(scenes: List[Dict[str, Any]], words: List[Dict[str, Any]], total_audio_duration: float, min_boundary_confidence: float = 0.35, allow_proportional_fallback: bool = False) -> List[Dict[str, Any]]:
    """
    Căn khớp danh sách scenes với chuỗi từ của Whisper theo thứ tự tuần tự tuyệt đối.
    Sử dụng proportional expected anchors + local fuzzy tail/head matching.
    Đây là heuristic alignment có confidence gate, không phải forced alignment tuyệt đối.
    """
    if not scenes:
        return []

    # Chuẩn hóa danh sách từ của từng scene
    scene_word_lists = []
    cum_script_words = []
    accum = 0
    for s in scenes:
        v_norm = normalize_text(s.get("voiceover", ""))
        w_list = v_norm.split()
        scene_word_lists.append(w_list)
        accum += len(w_list)
        cum_script_words.append(accum)

    total_scenes = len(scenes)
    total_words = len(words)
    total_script_words = accum or 1

    if not math.isfinite(total_audio_duration) or total_audio_duration <= 0:
        raise ValueError("total_audio_duration must be a finite number > 0")

    if total_words:
        prev_start = -1.0
        for i, w in enumerate(words):
            start = float(w.get("start", 0.0)); end = float(w.get("end", 0.0))
            if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end < start:
                raise ValueError(f"Invalid Whisper timestamp at word index {i}: start={start}, end={end}")
            if start + 1e-6 < prev_start:
                raise ValueError(f"Whisper word timestamps are not monotonic at index {i}")
            prev_start = start

    if total_words == 0:
        if not allow_proportional_fallback:
            raise RuntimeError("Whisper returned zero timestamped words; refusing to fabricate an aligned timeline. Re-run with a better ASR setup or explicitly use --allow-proportional-fallback.")
        print("⚠️ Whisper returned zero words; explicit proportional fallback enabled. Timeline is estimated, not speech-aligned.")
        current_time = 0.0
        timelines = []
        for w_list in scene_word_lists:
            dur = (len(w_list) / total_script_words) * total_audio_duration
            timelines.append({"start": current_time, "end": current_time + dur})
            current_time += dur
        return timelines

    # Khớp tuần tự: tìm ranh giới (start_idx, end_idx) trong mảng `words` cho từng scene
    scene_boundaries = []
    boundary_confidences = []
    w_idx = 0

    for s_idx in range(total_scenes):
        s_words = scene_word_lists[s_idx]
        if len(s_words) == 0:
            scene_boundaries.append((w_idx, w_idx))
            continue

        if s_idx == total_scenes - 1:
            # Cảnh cuối cùng nhận toàn bộ các từ còn lại đến hết file
            scene_boundaries.append((w_idx, total_words - 1))
            break

        # Mốc kết thúc kỳ vọng: kết hợp giữa tiến độ cục bộ từ w_idx và tiến độ toàn thể
        local_expected = w_idx + len(s_words)
        progress_ratio = cum_script_words[s_idx] / total_script_words
        global_expected = int(round(progress_ratio * total_words))
        expected_anchor = int(round(0.7 * local_expected + 0.3 * global_expected))

        # Giới hạn an toàn: đảm bảo mỗi cảnh tiếp theo còn ít nhất 1 từ
        min_cut = w_idx + 1
        max_cut = total_words - (total_scenes - s_idx - 1)

        win_left = min(local_expected, global_expected) - 30
        win_right = max(local_expected, global_expected) + 30
        search_start = max(min_cut, win_left)
        search_end = min(max_cut, win_right)
        if search_start > search_end:
            search_start = min_cut
            search_end = max_cut

        # Lấy tối đa 6 từ cuối của scene hiện tại và 6 từ đầu của scene tiếp theo để so khớp anchor
        tail_n = min(6, len(s_words))
        next_words = scene_word_lists[s_idx + 1] if (s_idx + 1 < total_scenes) else []
        head_n = min(6, len(next_words))

        curr_tail = " ".join(s_words[-tail_n:]) if tail_n > 0 else ""
        next_head = " ".join(next_words[:head_n]) if head_n > 0 else ""

        best_cut = max(min_cut, min(expected_anchor, max_cut))
        best_score = -999999.0
        best_confidence = 0.0

        for candidate_cut in range(search_start, search_end + 1):
            if candidate_cut <= w_idx or candidate_cut > max_cut:
                continue

            # Mẫu tail trước candidate_cut
            tail_sample_start = max(w_idx, candidate_cut - tail_n)
            tail_words_sample = [w["norm"] for w in words[tail_sample_start:candidate_cut]]
            tail_sample_str = " ".join(tail_words_sample)
            tail_score = phrase_sim(curr_tail, tail_sample_str) if curr_tail else 1.0

            # Mẫu head sau candidate_cut
            head_score = 0.0
            if next_head:
                head_sample_end = min(total_words, candidate_cut + head_n)
                head_words_sample = [w["norm"] for w in words[candidate_cut:head_sample_end]]
                head_sample_str = " ".join(head_words_sample)
                head_score = phrase_sim(next_head, head_sample_str)

            # Tổng điểm với độ phạt nhỏ nếu lệch xa mốc tiến độ (ưu tiên neo cục bộ)
            score = (tail_score * 4.0) + (head_score * 4.0) - (abs(candidate_cut - expected_anchor) * 0.03)

            if score > best_score:
                best_score = score
                best_cut = candidate_cut
                best_confidence = (tail_score + (head_score if next_head else tail_score)) / 2.0

        # Đảm bảo best_cut nằm trong khoảng an toàn tuyệt đối
        best_cut = max(min_cut, min(best_cut, max_cut))
        scene_boundaries.append((w_idx, best_cut - 1))
        boundary_confidences.append(best_confidence)
        w_idx = best_cut

    low = [(i + 1, c) for i, c in enumerate(boundary_confidences) if c < min_boundary_confidence]
    if low:
        preview = ", ".join(f"scene {i} boundary={c:.2f}" for i, c in low[:8])
        raise RuntimeError(f"Low-confidence speech alignment ({preview}); threshold={min_boundary_confidence:.2f}. Use a better Whisper model/audio, or lower --min-boundary-confidence only after manual inspection.")
    if boundary_confidences:
        print(f"-> [Alignment QA] Boundary confidence min={min(boundary_confidences):.2f}, avg={sum(boundary_confidences)/len(boundary_confidences):.2f}, threshold={min_boundary_confidence:.2f}")

    # Chuyển đổi boundary (start_w_idx, end_w_idx) sang timestamp thời gian (seconds)
    raw_timelines = []
    for s_idx, (b_start, b_end) in enumerate(scene_boundaries):
        if b_start < len(words):
            s_time = words[b_start]["start"]
        else:
            s_time = raw_timelines[-1]["end"] if raw_timelines else 0.0

        if b_end < len(words) and b_end >= b_start:
            e_time = words[b_end]["end"]
        else:
            e_time = s_time + 0.4

        if e_time < s_time + 0.3:
            e_time = s_time + 0.3

        raw_timelines.append({"start": s_time, "end": e_time})

    # Khử gap và overlap: scene sau nối tiếp scene trước, scene 1 bắt đầu từ 0.0, scene cuối kết thúc tại total_audio_duration
    continuous_timelines = []
    for s_idx, t in enumerate(raw_timelines):
        if s_idx == 0:
            c_start = 0.0
        else:
            c_start = continuous_timelines[s_idx - 1]["end"]

        if s_idx == total_scenes - 1:
            c_end = total_audio_duration
        else:
            next_t = raw_timelines[s_idx + 1]
            if next_t["start"] >= t["end"]:
                # Đặt điểm chuyển giao vào khoảng lặng âm thanh giữa 2 cảnh
                c_end = (t["end"] + next_t["start"]) / 2.0
            else:
                c_end = max(c_start + 0.4, t["end"])

        continuous_timelines.append({
            "start": round(c_start, 3),
            "end": round(c_end, 3)
        })

    # Đảm bảo điểm kết thúc scene cuối cùng chính xác tuyệt đối = total_audio_duration
    if continuous_timelines:
        continuous_timelines[-1]["end"] = round(total_audio_duration, 3)

    return continuous_timelines


def align_scenes_with_individual_wavs(project_dir: str, scenes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Căn khớp timeline từ các file scene_1.wav ... scene_N.wav có sẵn trong dự án.
    """
    timelines = []
    current_time = 0.0

    for s in scenes:
        sid = s.get("scene", 1)
        wav_file = os.path.join(project_dir, f"scene_{sid}.wav")
        if not os.path.isfile(wav_file):
            raise FileNotFoundError(f"Không tìm thấy file audio riêng lẻ: {wav_file}")

        dur = get_audio_duration_wave_or_ffprobe(wav_file)
        start_t = current_time
        end_t = start_t + dur
        timelines.append({
            "start": round(start_t, 3),
            "end": round(end_t, 3)
        })
        current_time = end_t

    return timelines


def validate_raw_timelines(timelines: List[Dict[str, Any]], expected_count: int) -> None:
    """Fail early on impossible/non-contiguous raw timelines before writing files."""
    if len(timelines) != expected_count:
        raise RuntimeError(f"Timeline count mismatch: {len(timelines)} != scene count {expected_count}")
    prev_end = None
    for i, tl in enumerate(timelines):
        start = float(tl.get("start", -1)); end = float(tl.get("end", -1))
        if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end < start:
            raise RuntimeError(f"Invalid raw timeline at scene index {i}: start={start}, end={end}")
        if prev_end is not None and abs(start - prev_end) > 0.005:
            raise RuntimeError(f"Non-contiguous raw timeline at scene index {i}: start={start}, previous_end={prev_end}")
        prev_end = end


def process_project_timeline(
    project_dir: str,
    speed: float = 1.15,
    speed_mode: str = "apply",
    explicit_audio: Optional[str] = None,
    model_size: str = "base",
    device: str = "auto",
    dry_run: bool = False,
    backup: bool = True,
    min_boundary_confidence: float = 0.35,
    allow_proportional_fallback: bool = False,
    no_cache: bool = False
) -> Dict[str, Any]:
    """
    Xử lý toàn bộ dự án: đọc chapter_*.json, phân tích audio, tính timeline theo tốc độ, và cập nhật chapter_*.json.
    """
    if not os.path.isdir(project_dir):
        raise NotADirectoryError(f"Thư mục dự án không tồn tại: {project_dir}")
    if not math.isfinite(speed) or speed <= 0:
        raise ValueError("--speed phải là số hữu hạn > 0")
    if not (0.0 <= min_boundary_confidence <= 1.0):
        raise ValueError("--min-boundary-confidence phải nằm trong khoảng 0..1")

    # Tìm các file chapter_*.json
    chapter_files = glob.glob(os.path.join(project_dir, "chapter_*.json"))
    if not chapter_files:
        raise FileNotFoundError(f"Không tìm thấy file chapter_*.json nào trong {project_dir}")

    def chapter_sort_key(p: str) -> int:
        name = os.path.basename(p)
        nums = re.findall(r"\d+", name)
        return int(nums[0]) if nums else 0

    chapter_files.sort(key=chapter_sort_key)

    # Đọc tất cả chapters
    chapters_data = []
    all_scenes = []
    for cf in chapter_files:
        with open(cf, "r", encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, list):
                raise ValueError(f"File {cf} không chứa JSON array scene hợp lệ!")
            chapters_data.append({"file": cf, "scenes": data})
            all_scenes.extend(data)

    print(f"-> Tìm thấy {len(chapter_files)} chapter(s) với tổng cộng {len(all_scenes)} scenes.")

    # Tìm nguồn audio
    audio_path, audio_source_type = find_project_audio(project_dir, explicit_audio)

    # Tính toán raw timelines (ở tốc độ của audio gốc)
    if audio_source_type == "individual_scenes":
        print("-> [Nguồn Audio] Phát hiện các file 'scene_*.wav' riêng lẻ từng cảnh.")
        raw_timelines = align_scenes_with_individual_wavs(project_dir, all_scenes)
    else:
        print(f"-> [Nguồn Audio] Sử dụng file tổng hợp: {os.path.basename(audio_path)}")
        total_duration = get_audio_duration_wave_or_ffprobe(audio_path)
        print(f"-> Tổng thời lượng file audio gốc: {total_duration:.3f} giây ({format_timestamp(total_duration)})")
        words = transcribe_whisper_word_timestamps(audio_path, model_size=model_size, device=device, no_cache=no_cache)
        raw_timelines = align_scenes_with_words(
            all_scenes, words, total_duration,
            min_boundary_confidence=min_boundary_confidence,
            allow_proportional_fallback=allow_proportional_fallback,
        )

    validate_raw_timelines(raw_timelines, len(all_scenes))

    # Áp dụng hệ số tốc độ (speed)
    # speed_mode == "apply": Audio gốc ở tốc độ 1.0x, khi vào video được tăng tốc speed (vd: 1.15x) -> thời gian chia cho speed
    # speed_mode == "recorded": Audio gốc ĐÃ ĐƯỢC render ở tốc độ speed -> thời gian giữ nguyên
    speed_factor = speed if speed_mode == "apply" else 1.0

    print(f"-> [Cấu hình tốc độ] Speed = {speed}x | Chế độ: '{speed_mode}' (Hệ số quy đổi: {speed_factor:.2f}x)")

    final_timelines = []
    for raw in raw_timelines:
        s_val = round(raw["start"] / speed_factor, 3)
        e_val = round(raw["end"] / speed_factor, 3)
        d_val = round(e_val - s_val, 3)
        final_timelines.append({
            "start": s_val,
            "end": e_val,
            "duration": d_val,
            "start_formatted": format_timestamp(s_val),
            "end_formatted": format_timestamp(e_val),
            "speed": speed
        })

    # Cập nhật trường 'timeline' vào từng scene
    scene_idx = 0
    total_final_duration = final_timelines[-1]["end"] if final_timelines else 0.0

    print("\n" + "="*80)
    print(f"📊 BẢNG TỔNG HỢP TIMELINE CHI TIẾT TỪNG CẢNH (Tốc độ {speed}x)")
    print("="*80)
    print(f"{'Scene':<7} | {'Bắt đầu':<10} | {'Kết thúc':<10} | {'Thời lượng':<10} | {'Lời thoại (voiceover)':<40}")
    print("-" * 80)

    for ch_item in chapters_data:
        for s in ch_item["scenes"]:
            tl = final_timelines[scene_idx]
            s["timeline"] = tl
            vo_preview = s.get("voiceover", "")
            if len(vo_preview) > 37:
                vo_preview = vo_preview[:34] + "..."
            print(f"Scene {s.get('scene', scene_idx+1):<2} | {tl['start_formatted']:<10} | {tl['end_formatted']:<10} | {tl['duration']:>5.3f}s     | {vo_preview}")
            scene_idx += 1

    print("="*80)
    print(f"🎬 TỔNG THỜI LƯỢNG VIDEO: {total_final_duration:.3f}s ({format_timestamp(total_final_duration)})")
    print("="*80 + "\n")

    if not dry_run:
        # Ghi đè lại các file chapter_*.json
        for ch_item in chapters_data:
            cf_path = ch_item["file"]
            if backup:
                bak_path = cf_path + ".bak"
                shutil.copy2(cf_path, bak_path)

            with open(cf_path, "w", encoding="utf-8") as f:
                json.dump(ch_item["scenes"], f, ensure_ascii=False, indent=2)
            print(f"✅ Đã cập nhật timeline vào: {os.path.basename(cf_path)}")

    return {
        "project_dir": project_dir,
        "total_scenes": len(all_scenes),
        "total_duration": total_final_duration,
        "speed": speed,
        "audio_file": audio_path
    }


def resolve_project_path(target: str) -> str:
    """Tự động resolve đường dẫn dự án từ slug hoặc full path."""
    if os.path.isdir(target):
        return os.path.abspath(target)

    # Thử tìm trong data/video_long hoặc data/video_short
    candidate_dai = os.path.join("data", "video_long", target)
    if os.path.isdir(candidate_dai):
        return os.path.abspath(candidate_dai)

    candidate_short = os.path.join("data", "video_short", target)
    if os.path.isdir(candidate_short):
        return os.path.abspath(candidate_short)

    raise FileNotFoundError(f"Không tìm thấy thư mục dự án: '{target}'")


def main():
    parser = argparse.ArgumentParser(
        description="Phân tích audio và tạo timeline scene có kiểm tra continuity/confidence; không tuyên bố forced-alignment tuyệt đối"
    )
    parser.add_argument(
        "--folder", "-f",
        type=str,
        required=True,
        help="Đường dẫn thư mục dự án hoặc slug thư mục trong data/video_long hoặc data/video_short"
    )
    parser.add_argument(
        "--speed", "-s",
        type=float,
        default=1.15,
        help="Tốc độ đọc giọng nói (mặc định: 1.15x)"
    )
    parser.add_argument(
        "--speed-mode",
        type=str,
        choices=["apply", "recorded"],
        default="apply",
        help="'apply': audio gốc 1.0x quy đổi sang tốc độ target; 'recorded': audio gốc đã ở tốc độ target"
    )
    parser.add_argument(
        "--audio", "-a",
        type=str,
        default=None,
        help="Chỉ định file audio cụ thể (tùy chọn)"
    )
    parser.add_argument(
        "--model",
        type=str,
        default="base",
        choices=["tiny", "base", "small", "medium", "large"],
        help="Whisper model size (mặc định: 'base')"
    )
    parser.add_argument(
        "--device",
        type=str,
        default="auto",
        choices=["auto", "cuda", "cpu"],
        help="Thiết bị chạy Whisper ('auto', 'cuda', 'cpu')"
    )
    parser.add_argument(
        "--min-boundary-confidence",
        type=float,
        default=0.35,
        help="Ngưỡng confidence tối thiểu cho mỗi ranh giới scene khi dùng audio tổng hợp (0..1, mặc định 0.35)"
    )
    parser.add_argument(
        "--allow-proportional-fallback",
        action="store_true",
        help="Cho phép ước lượng theo tỷ lệ số từ nếu Whisper không trả word timestamps; kết quả chỉ là estimate"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Chỉ in bảng kết quả timeline, không ghi đè file chapter_[n].json"
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="Không tạo file .bak trước khi ghi đè"
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Không sử dụng cache Whisper ASR đã lưu, bắt buộc nhận diện lại từ đầu"
    )

    args = parser.parse_args()

    try:
        project_path = resolve_project_path(args.folder)
        process_project_timeline(
            project_dir=project_path,
            speed=args.speed,
            speed_mode=args.speed_mode,
            explicit_audio=args.audio,
            model_size=args.model,
            device=args.device,
            dry_run=args.dry_run,
            backup=not args.no_backup,
            min_boundary_confidence=args.min_boundary_confidence,
            allow_proportional_fallback=args.allow_proportional_fallback,
            no_cache=args.no_cache
        )
    except Exception as e:
        print(f"\n❌ [LỖI] {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
