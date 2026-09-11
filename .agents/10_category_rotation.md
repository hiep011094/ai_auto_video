# 10 — Category Rotation System (Hệ Thống Luân Phiên Thể Loại)

**Purpose:** Đảm bảo mỗi phiên tạo video tự động chỉ chọn một trong đúng **2 thể loại ACTIVE** và luân phiên chúng, để không có hai phiên liên tiếp cùng một thể loại.

> Phạm vi của tài liệu này chỉ là **lựa chọn category/thể loại**. Kiểm tra trùng nội dung topic cụ thể vẫn thuộc `09_topic_uniqueness.md` và **không bị thay đổi**.
>
> Tài liệu này là nguồn quy định chính thức duy nhất cho category. `tools/category_keywords.py` là single source of truth cho code.

---

## 1. Hai thể loại ACTIVE duy nhất

| Category ID nội bộ | Tên thể loại hiển thị | Phạm vi | Ví dụ topic |
|---|---|---|---|
| `buddhist_life` | **Phật pháp sống** | Phật pháp ứng dụng vào cuộc sống, thiền, an yên, ngủ ngon, buông bỏ, chánh niệm, nhân quả, giải thích kinh/pháp theo cách dễ hiểu, bài học thực hành từ giáo lý | Buông bỏ để hạnh phúc, Thiền chánh niệm cho người bận rộn, Tứ Diệu Đế giải thích đơn giản, Nhân quả trong đời sống hàng ngày |
| `buddhist_wisdom` | **Trí tuệ Phật giáo** | Những câu chuyện Phật giáo – bài học nhân sinh, lịch sử Phật giáo, nhân vật, thánh tích, truyện tiền thân, dụ ngôn, trích dẫn kinh điển | Câu chuyện Đức Phật rời hoàng cung, Bồ Đề Đạo Tràng – thánh tích giác ngộ, Thiền sư Thích Nhất Hạnh, Truyện tiền thân Jataka |

### Category đã nghỉ

`space_science`, `world_mysteries`, `hypothesis`, `physics` và mọi category khác ngoài 2 ID trên đều là **retired/inactive** đối với lựa chọn chủ đề mới.

- Auto mode không được chọn chúng.
- Manual mode nếu truyền `category` ngoài 2 giá trị ACTIVE sẽ bị schema từ chối.
- History cũ vẫn được giữ nguyên; entry có category retired chỉ bị bỏ qua khi tính vòng ACTIVE.

---

## 2. HARD RULE — Strict 2-Category Alternation

Có đúng 2 category ACTIVE, vì vậy:

```text
ROTATION_LOCK_WINDOW = 1
```

Category của **video ACTIVE gần nhất bị khóa**. Video tiếp theo bắt buộc chọn category còn lại.

Invariant:

```text
Mọi cửa sổ 2 video ACTIVE hợp lệ = đủ 2 category, mỗi category đúng 1 lần.
```

Ví dụ hợp lệ:

```text
Video 01: buddhist_life       → Phật pháp sống
Video 02: buddhist_wisdom     → Trí tuệ Phật giáo
Video 03: buddhist_life       → Phật pháp sống
Video 04: buddhist_wisdom     → Trí tuệ Phật giáo
```

Ví dụ không hợp lệ:

```text
buddhist_life
buddhist_life   ❌ trùng thể loại với phiên ACTIVE ngay trước
```

---

## 3. Tương thích với history cũ

Hệ thống **không xóa, sửa hay migrate cưỡng bức** các entry lịch sử cũ.

- Entry **thiếu `category`**: fallback classifier phân loại vào 2 category ACTIVE dựa trên keywords.
- Entry có `category = space_science`, `world_mysteries`, `hypothesis`, `physics` hoặc category cũ/không hợp lệ: giữ nguyên trong `history.json` nhưng **bỏ qua khi tính rotation và balance ACTIVE**.

---

## 4. Thuật toán chuẩn

```python
ROTATION_LOCK_WINDOW = len(CATEGORY_ORDER) - 1  # 1

recent_categories = get_last_n_categories(history, n=ROTATION_LOCK_WINDOW)
locked = set(recent_categories)
available = [c for c in CATEGORY_ORDER if c not in locked]

selected = min(
    available,
    key=lambda c: (count_last_10(c), CATEGORY_ORDER.index(c))
)
```

Với 2 category ACTIVE, sau khi có ít nhất một video ACTIVE thì `available` luôn chỉ còn đúng một category, nên hệ thống tự luân phiên tuyệt đối.

---

## 5. Tích hợp workflow

### Auto mode

Bắt buộc chạy trước khi research topic:

```bash
python3 .agents/tools/category_selector.py \
    --history database/history.json \
    --output-json
```

Ví dụ khi video ACTIVE gần nhất là `buddhist_life`:

```json
{
  "selected_category": "buddhist_wisdom",
  "reason": "Strict 2-category alternation - buddhist_life occupies the last 1 active slot, so buddhist_wisdom is the only eligible category",
  "last_3_categories": ["buddhist_life"],
  "available_categories": ["buddhist_wisdom"],
  "rotation_lock_window": 1,
  "locked_categories": ["buddhist_life"],
  "rotation_mode": "strict_full_cycle"
}
```

Sau đó chỉ research topic trong `selected_category`:

### `buddhist_life` — Phật pháp sống

Keyword seed/phạm vi gợi ý:

```text
phật pháp, ứng dụng, cuộc sống, tâm, thiền, chánh niệm, buông bỏ, an yên,
từ bi, trí tuệ, nhân quả, nghiệp, karma, vô thường, vô ngã, tứ diệu đế,
bát chánh đạo, giải thoát, ngũ giới, tĩnh tâm, hơi thở, vipassana,
ngủ ngon, thư giãn, duyên khởi, trung đạo, niết bàn...
```

### `buddhist_wisdom` — Trí tuệ Phật giáo

Keyword seed/phạm vi gợi ý:

```text
câu chuyện, bài học, nhân sinh, truyện phật, tiền thân, jataka, đức phật,
thích ca, lịch sử, thánh tích, bồ đề đạo tràng, lumbini, chùa, thiền viện,
phật giáo nguyên thủy, đại thừa, thiền tông, tịnh độ, trích dẫn, pháp cú,
dhammapada, thích nhất hạnh, trúc lâm, yên tử, trần nhân tông...
```

Category selector chỉ quyết định **thể loại phiên làm việc**. Topic research và topic uniqueness vẫn quyết định **chủ đề cụ thể** bên trong thể loại đó.

---

## 6. Ranh giới lựa chọn chủ đề

Để hai thể loại không bị chồng chéo:

1. **`buddhist_life`** = ứng dụng, thực hành, trải nghiệm, giải thích giáo lý. Hỏi: "Người xem có thể áp dụng điều này vào cuộc sống không?" → Nếu có → `buddhist_life`.
2. **`buddhist_wisdom`** = câu chuyện, nhân vật, lịch sử, sự kiện, thánh tích. Hỏi: "Đây có phải kể về một câu chuyện/nhân vật/địa điểm/sự kiện cụ thể?" → Nếu có → `buddhist_wisdom`.
3. Topic có thể thuộc cả hai: ưu tiên theo góc tiếp cận. VD: "Bài học từ câu chuyện Đức Phật rời hoàng cung" → `buddhist_wisdom` (vì kể chuyện). "Cách buông bỏ như Đức Phật dạy" → `buddhist_life` (vì ứng dụng).
4. Nếu topic không phù hợp rõ ràng với một trong hai phạm vi, **không ép category để sản xuất**; chọn candidate khác trong category đã được selector cấp.

---

## 7. Balance

Với strict 2-category alternation, phân bố dài hạn tự tiến gần:

```text
buddhist_life     ≈ 50%
buddhist_wisdom   ≈ 50%
```

`category_balance_checker.py` dùng target động `100 / số category ACTIVE` với tolerance ±5%, nhưng balance **không được override rotation lock**.

```bash
python3 .agents/tools/category_balance_checker.py \
    --history database/history.json \
    --window 20
```

---

## 8. Schema cho phiên mới

Các giá trị category được phép cho task/entry mới:

```text
buddhist_life
buddhist_wisdom
```

Không thêm field mới vào `history.json`, `queue.json`, `metadata.json`.

Các phần sau **không bị thay đổi logic**:

- topic duplicate engine
- script generation
- scene splitting
- visual bible
- GenerateVeoPrompts / `veo_prompt`
- audio/timeline
- SEO
- CapCut-related outputs

---

## 9. Manual mode

Manual mode vẫn ưu tiên topic người dùng yêu cầu, nhưng `category` nếu được truyền phải thuộc đúng 2 category ACTIVE.

Nếu manual task không có `category`, agent phân loại topic vào một trong 2 category ACTIVE trước khi ghi history.

Rotation lock là hard rule của **auto mode**. Manual task có `category` ACTIVE do người dùng chỉ định vẫn được phép lặp category của video trước; không được tự đổi topic/category người dùng chỉ để ép alternation.

---

## 10. Tests bắt buộc

### Test A — bootstrap + alternation

```text
history=[]                           → buddhist_life
[buddhist_life]                      → buddhist_wisdom
[buddhist_life, buddhist_wisdom]     → buddhist_life
```

### Test B — không repeat category ACTIVE liền trước

```text
selected_category != previous_active_category
```

### Test C — mọi 2 ACTIVE video đủ 2 category

```text
set(any 2 consecutive ACTIVE categories) == ALL_CATEGORIES
```

### Test D — deterministic

Cùng history phải trả cùng `selected_category` bất kể `PYTHONHASHSEED`.

### Test E — history cũ có retired/invalid category

Entry retired/invalid được giữ nguyên nhưng không khóa hay chiếm slot trong vòng ACTIVE.

---

## 11. Production rule tóm tắt

```text
AUTO SESSION
    ↓
read database/history.json
    ↓
ignore explicit retired/invalid categories for ACTIVE rotation
    ↓
get last 1 ACTIVE category
    ↓
LOCK it
    ↓
select the other ACTIVE category
    ↓
search topics only inside selected category
    ↓
continue existing topic research + uniqueness workflow
```

**Invariant quan trọng:**

> Trong auto mode, hai phiên video ACTIVE liên tiếp không bao giờ được cùng thể loại. Hệ thống luân phiên giữa **Phật pháp sống** và **Trí tuệ Phật giáo**.

---

**Version:** 5.0 — Buddhist Content 2-Category Strict Alternation
**Updated:** 2026-09-07
