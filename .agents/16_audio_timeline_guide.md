# 16 — Hướng dẫn Phân tích Audio và Đồng bộ Timeline Cảnh (`audio_timeline_aligner.py`)

## 0. Mục tiêu

Công cụ `.agents/tools/audio_timeline_aligner.py` cập nhật `timeline` cho từng scene trong `chapter_[n].json` từ một file audio tổng hợp hoặc từ các file `scene_*.wav`. Đây là **công cụ căn biên theo ASR có confidence gate**, không được mô tả như một forced-aligner tuyệt đối.

## 1. Cơ chế thực tế

### 1.1 Audio tổng hợp

1. Whisper (`word_timestamps=True`) tạo chuỗi từ cùng timestamp.
2. Mỗi biên scene có một vị trí kỳ vọng theo tỷ lệ số từ của narration.
3. Công cụ tìm quanh vị trí kỳ vọng và so khớp tail/head phrase của hai scene kề nhau bằng fuzzy sequence similarity.
4. Biên tốt nhất được chọn nhưng phải đạt `--min-boundary-confidence` (mặc định `0.35`). Nếu confidence thấp, công cụ **FAIL thay vì âm thầm ghi timeline đáng ngờ**.
5. Scene 1 bắt đầu `0.0`; các scene liền nhau dùng chung biên; scene cuối kết thúc đúng thời lượng file audio. Đây là tính liên tục timeline do code cưỡng chế, không phải tuyên bố ASR luôn nhận dạng hoàn hảo.

Nếu Whisper không trả word timestamp, mặc định công cụ FAIL. `--allow-proportional-fallback` chỉ dùng khi người vận hành chủ động chấp nhận fallback tỷ lệ; không nên dùng cho bản production cần khớp lời thoại chính xác.

### 1.2 Audio từng scene

Khi project có `scene_*.wav`, công cụ có thể lấy duration từng file và ghép timeline tuần tự. Nhánh này không cần khởi tạo Whisper/Torch.

### 1.3 Speed factor

- `--speed-mode apply`: audio là bản 1.0x nhưng editor phát ở tốc độ `S`; timestamp video = timestamp audio / `S`.
- `--speed-mode recorded`: file audio đã render ở tốc độ đích; giữ nguyên timestamp đo từ file.
- `--speed` phải là số hữu hạn > 0. Giá trị không hợp lệ bị từ chối trước khi tính timeline.

## 2. Contract `timeline`

```json
{
  "timeline": {
    "start": 0.0,
    "end": 2.73,
    "duration": 2.73,
    "start_formatted": "00:00.000",
    "end_formatted": "00:02.730",
    "speed": 1.15
  }
}
```

`qa_automation.py` kiểm cross-field sau schema validation: `end >= start`, `duration == end-start`, scene sau bắt đầu đúng tại end của scene trước, formatted timestamp phải khớp số giây, speed hợp lệ, và nếu một scene có timeline thì toàn bộ project phải có timeline hoàn chỉnh.

## 3. CLI

### Audio tổng hợp

```bash
python .agents/tools/audio_timeline_aligner.py \
  --folder "data/video_long/[title-slug]" \
  --audio "tong_hop_loi_thoai_vbee.mp3" \
  --speed 1.15 \
  --min-boundary-confidence 0.35
```

### Dry run

```bash
python .agents/tools/audio_timeline_aligner.py \
  --folder "data/video_long/[title-slug]" \
  --speed 1.15 \
  --dry-run
```

### Audio đã được render ở tốc độ đích

```bash
python .agents/tools/audio_timeline_aligner.py \
  --folder "data/video_long/[title-slug]" \
  --speed 1.15 \
  --speed-mode recorded
```

### Fallback tỷ lệ — chỉ khi chủ động chấp nhận độ chính xác thấp hơn

```bash
python .agents/tools/audio_timeline_aligner.py \
  --folder "data/video_long/[title-slug]" \
  --allow-proportional-fallback
```

## 4. Tham số

| Tham số | Ý nghĩa | Mặc định |
|---|---|---|
| `--folder`, `-f` | Project folder/slug | bắt buộc |
| `--audio`, `-a` | Audio tổng hợp cụ thể | auto-detect |
| `--speed`, `-s` | Speed factor, phải > 0 | `1.15` |
| `--speed-mode` | `apply` hoặc `recorded` | `apply` |
| `--model` | Whisper `tiny`, `base`, `small`, `medium`, `large` | `base` |
| `--device` | `auto`, `cuda`, `cpu` | `auto` |
| `--min-boundary-confidence` | Ngưỡng fuzzy-match biên scene, 0..1 | `0.35` |
| `--allow-proportional-fallback` | Cho phép fallback khi ASR không có word timestamp | `False` |
| `--dry-run` | Không ghi file | `False` |
| `--no-backup` | Không tạo `.bak` trước khi ghi | `False` |

## 5. Quy tắc production

- Không gọi kết quả là “forced alignment chính xác tuyệt đối”.
- Không hạ confidence chỉ để ép tool PASS nếu chưa kiểm tra audio.
- Sau khi ghi timeline, luôn chạy `qa_automation.py` của project.
- SEO chapter timestamps chỉ được tạo từ timeline đã PASS; nếu không có nguồn timing đáng tin cậy thì bỏ chapter timestamp thay vì bịa.
