# 09 — Topic Uniqueness & Anti-Duplication System

**Purpose:** Automatically check if a new topic duplicates existing videos and suggest alternative angles

---

## Overview

The anti-duplication system prevents repeated viewer experiences by combining:
1. A **mandatory global-history** keyword check across every prior video in `database/history.json`
2. AI semantic reasoning to catch paraphrases, repeated patterns, cross-language repeats and clickbait retitling
3. An optional **same-category deep pass** when `--category` is supplied — category never narrows or bypasses the global check
4. Alternative-angle guidance when duplication or fatigue risk is detected

`tools/check_topic_duplicate.py` is the primary workflow tool. The lower-level
`topic_uniqueness_checker.py` remains a fast/offline keyword fallback and diagnostic utility.

---

## When to Use

### Automatic Mode (`generationMethod = "auto"`)

**MANDATORY** — use the comprehensive checker before writing the script:

```bash
NEW_TOPIC="Hố đen siêu khổng lồ ở trung tâm thiên hà"

python3 .agents/tools/check_topic_duplicate.py \
    --new-topic "$NEW_TOPIC" \
    --history database/history.json \
    --category <selected_category> \
    --ai-model <agy|codex>

# Exit 0 → global + semantic checks passed
# Exit 1 → duplicate: materially change the angle and re-check
# Exit 2 → warning / AI unavailable: NOT a confirmed pass; review manually
```

The command always checks the entire history first. `--category` only adds a
stricter category-local fatigue check; moving the same idea to another category
does not make it unique.

### Manual Mode (`generationMethod = "manual"`)

**OPTIONAL** - User provides topic, but checking is still recommended:

```bash
# User topic from queue.json
USER_TOPIC="Black hole at center of Milky Way"

# Optional check
python .agents/tools/topic_uniqueness_checker.py \
    --new-topic "$USER_TOPIC" \
    --history database/history.json

# If duplicate warning → inform user, let them decide
```

---

## How It Works

### 1. Text Normalization

```python
"Hố Đen Siêu Khổng Lồ" → "ho den sieu khong lo"
```

**Steps:**
- Lowercase
- Remove Vietnamese diacritics
- Remove special characters
- Normalize spaces

### 2. Keyword Extraction

```python
"Hố đen siêu khổng lồ ở trung tâm thiên hà"
→ {"ho", "den", "sieu", "khong", "lo", "trung", "tam", "thien", "ha"}

# Stopwords removed: "ở"
```

### 3. Similarity Calculation

**Jaccard Similarity Formula:**

```
Similarity = |Keywords_A ∩ Keywords_B| / |Keywords_A ∪ Keywords_B|
```

**Example:**

```
Topic A: "Hố đen siêu khổng lồ"
Keywords A: {ho, den, sieu, khong, lo}

Topic B: "Hố đen chạy trốn khỏi thiên hà"
Keywords B: {ho, den, chay, tron, khoi, thien, ha}

Intersection: {ho, den} = 2 words
Union: {ho, den, sieu, khong, lo, chay, tron, khoi, thien, ha} = 10 words

Similarity = 2/10 = 0.2 = 20%
```

### 4. Duplicate Detection

**Threshold:** Default 50% (configurable)

- **< 50%**: Topics are different enough ✅
- **≥ 50%**: Topics too similar ⚠️ need new angle

**Checked against:**
- `title` field in history.json
- `main_video_content` field in history.json
- Uses **max** similarity between both fields

---

## Similarity Levels

| Score | Meaning | Action |
|-------|---------|--------|
| 0-29% | Very different | ✅ Proceed |
| 30-49% | Somewhat similar | ✅ Proceed (but monitor) |
| 50-69% | Similar | ⚠️ Need different angle |
| 70-89% | Very similar | ⚠️ Strong alternative needed |
| 90-100% | Nearly identical | ❌ Must change topic |

---

## Usage Examples

### Example 1: Unique Topic ✅

```bash
$ python topic_uniqueness_checker.py \
    --new-topic "Ý nghĩa của chánh niệm trong đời sống hiện đại" \
    --history database/history.json

======================================================================
TOPIC UNIQUENESS CHECK
======================================================================

New topic: Ý nghĩa của chánh niệm trong đời sống hiện đại
Threshold: 50.0%
Max similarity found: 12.5%

✅ RESULT: UNIQUE - Can proceed

This topic has not been covered before.
```

**Exit code:** 0 ✅

---

### Example 2: Duplicate Topic ⚠️

```bash
$ python topic_uniqueness_checker.py \
    --new-topic "Hố đen siêu lớn trung tâm thiên hà" \
    --history database/history.json

======================================================================
TOPIC UNIQUENESS CHECK
======================================================================

New topic: Hố đen siêu lớn trung tâm thiên hà
Threshold: 50.0%
Max similarity found: 72.3%

⚠️  RESULT: DUPLICATE - Need different angle

Found 2 similar topic(s):

1. [72.3%] Hố Đen Siêu Khổng Lồ Sagittarius A*
   Content: Hố đen khổng lồ ở trung tâm Dải Ngân Hà
   Date: 2026-05-12 | Type: short | Lang: vi

2. [58.1%] Bí Ẩn Trung Tâm Thiên Hà
   Content: Khám phá trung tâm thiên hà và hố đen siêu khổng lồ
   Date: 2026-06-03 | Type: long | Lang: vi

🎯 SUGGESTIONS FOR NEW ANGLE:

Similar topics found: 2 videos

Consider these different approaches:
1. Focus on a SPECIFIC ASPECT (not covered in past videos)
2. Use a DIFFERENT TIME PERIOD (recent discovery vs historical)
3. Change PERSPECTIVE (from observer to participant)
4. Add COMPARISON (vs other phenomena)
5. Focus on IMPLICATIONS (what this means for humanity)

Example transformations:
  Original: Hố Đen Siêu Khổng Lồ Sagittarius A*
  → Angle 1: [Ảnh Chụp Đầu Tiên Năm 2022] Hố Đen Sagittarius A*
  → Angle 2: [Âm Thanh Lạ] Từ Hố Đen Trung Tâm Thiên Hà
  → Angle 3: [So Sánh Với M87*] Hai Hố Đen Khổng Lồ Nhất
  → Angle 4: [Nguy Cơ] Hố Đen Trung Tâm Có Ảnh Hưởng Đến Trái Đất?
  → Angle 5: [Phát Hiện 2026] Hoạt Động Bất Thường Của Sgr A*
```

**Exit code:** 1 ⚠️

---

## JSON Output (for Automation)

```bash
python topic_uniqueness_checker.py \
    --new-topic "Topic" \
    --history database/history.json \
    --json-output
```

**Output:**

```json
{
  "is_unique": false,
  "max_similarity": 0.723,
  "threshold": 0.5,
  "similar_count": 2,
  "similar_topics": [
    {
      "id": "abc123",
      "title": "Hố Đen Siêu Khổng Lồ Sagittarius A*",
      "main_video_content": "...",
      "similarity": 0.723,
      "date": "2026-05-12",
      "type": "short",
      "language": "vi"
    }
  ]
}
```

**Use in scripts:**

```bash
if python topic_uniqueness_checker.py --new-topic "$TOPIC" --json-output > result.json; then
    echo "✅ Topic is unique"
else
    echo "⚠️ Topic is duplicate"
    cat result.json
fi
```

---

## Alternative Angle Strategies

### Strategy 1: Specific Aspect

**Generic:** "Hố đen khổng lồ"  
**Specific:** "Cách hố đen khổng lồ **bẻ cong ánh sáng**"

### Strategy 2: Time-based

**Generic:** "Tàu Voyager 1"  
**Time:** "Tàu Voyager 1 **năm 2026**: Sắp mất liên lạc hoàn toàn"

### Strategy 3: Perspective Change

**Observer:** "Hố đen nuốt ngôi sao"  
**Participant:** "**Nếu bạn rơi vào** hố đen nuốt ngôi sao"

### Strategy 4: Comparison

**Single:** "Hành tinh Kim Cương"  
**Compare:** "Hành tinh Kim Cương **vs** Hành tinh Mưa Thủy Tinh"

### Strategy 5: Implications

**Fact:** "James Webb phát hiện thiên hà xa nhất"  
**Impact:** "Kinh Pháp Cú **dạy ta cách sống an yên giữa nghịch cảnh**"

---

## Integration with Workflow

### Update `01_workflow.md` Step 2:

```markdown
## Step 2 — Determine the topic

- `generationMethod = auto`:
  1. Build a current candidate pool using the trend-quality process in `01_workflow.md Step 2.2`
  2. Generate/select the strongest specific angle
  3. Run the primary global + semantic uniqueness check:
     ```bash
     python3 .agents/tools/check_topic_duplicate.py \
         --new-topic "$CANDIDATE_TOPIC" \
         --history database/history.json \
         --category "$SELECTED_CATEGORY" \
         --ai-model "$AI_MODEL"
     ```
  4. Exit 0 → proceed
  5. Exit 1 → apply a materially different angle → re-check → repeat
  6. Exit 2 → do not treat as AI-confirmed unique; manually review or strengthen the angle
  7. Pick the final topic only after the global check is cleared
  
- `generationMethod = manual`:
  Use `topic` from queue.json
  Optional: Run uniqueness check and warn user if duplicate
```

---

## Configuration

### Threshold Tuning

**Default:** 0.5 (50%)

**Adjust based on needs:**

```bash
# Stricter (less duplicates, more rejections)
--threshold 0.4  # 40%

# More lenient (allow more similar topics)
--threshold 0.6  # 60%
```

**Recommended:**
- **Short videos:** 0.5 (50%) - stricter, fast turnover
- **Long videos:** 0.4 (40%) - more lenient, in-depth coverage

---

## Edge Cases

### Case 1: Empty History

```bash
# First video ever
→ All topics are unique ✅
```

### Case 2: Similar But Different Language

```
Topic A (vi): "Hố đen siêu khổng lồ"
Topic B (en): "Why Letting Go Is Not the Same as Giving Up"
→ Similarity: ~80% (same concept, different language)
```

**Decision:** Still flag as duplicate ⚠️

**Why:** Global history can contain translated or differently phrased versions of the same Buddhist-life insight; avoid repeating the same core promise across wording variants

### Case 3: Same Topic, Different Angle

```
Topic A: "Hố đen trung tâm thiên hà"
Topic B: "Âm thanh lạ từ hố đen trung tâm thiên hà"
→ Similarity: ~60%
```

**Decision:** Flagged ⚠️, but with suggestions

**Agent action:** Apply angle transformation, re-check

---

## Best Practices

### For AI Agents

1. **Always check** in auto mode before writing script
2. **Apply 1-2 angle transformations** if duplicate
3. **Re-check** after transformation
4. **Loop max 3 times**, then pick best candidate
5. **Document** final topic in `main_video_content`

### For Manual Review

1. Check similarity score, not just binary result
2. If 50-59%: Slight angle change may be enough
3. If 60-79%: Need significant angle change
4. If 80%+: Consider completely different topic

---

## Maintenance

### Update Stopwords

Edit `topic_uniqueness_checker.py` line ~60:

```python
stopwords = {
    # Add domain-specific stopwords
    'video', 'bi', 'an', 'kham', 'pha', ...
}
```

### Adjust Algorithm

Current: Jaccard similarity on keywords

Alternative options:
- Cosine similarity with TF-IDF
- Embedding-based (requires model)
- N-gram overlap

---

## Troubleshooting

### Issue: Too many false positives

**Symptom:** Unique topics flagged as duplicates

**Solution:**
1. Increase threshold: `--threshold 0.6`
2. Add more stopwords
3. Check if history.json has many similar topics

### Issue: Too many false negatives

**Symptom:** Obvious duplicates not detected

**Solution:**
1. Decrease threshold: `--threshold 0.4`
2. Check text normalization working correctly
3. Verify history.json has complete data

---

## Examples by Scenario

### Scenario 1: Auto Mode, First Check

```bash
# Agent generates a topic after the Step 2.2 trend-quality discovery process
TOPIC="Câu Chuyện Đức Phật Rời Hoàng Cung"

# Check
python3 .agents/tools/check_topic_duplicate.py --new-topic "$TOPIC" --history database/history.json --category buddhist_wisdom --ai-model agy
# → Exit 1 (global/semantic duplicate)

# Apply angle
NEW_TOPIC="Đêm Xuất Gia: Điều Gì Đã Thay Đổi Trong Tâm Thái Tử Tất Đạt Đa?"

# Re-check
python3 .agents/tools/check_topic_duplicate.py --new-topic "$NEW_TOPIC" --history database/history.json --category buddhist_wisdom --ai-model agy
# → Exit 0 (global + semantic uniqueness cleared)

# Proceed to write script ✅
```

### Scenario 2: Manual Mode, Warning User

```bash
# User submits via queue.json
USER_TOPIC="Voyager 1 Spacecraft"

# Agent checks (optional)
python topic_uniqueness_checker.py --new-topic "$USER_TOPIC" --history database/history.json
# → Exit 1 (duplicate found)

# Agent logs warning but proceeds (user decision)
echo "WARNING: Similar topic found in history (72% match)"
echo "User topic: $USER_TOPIC"
echo "Similar video: Tàu Voyager 1 Đang Tắt Nguồn (2026-08-01)"
echo "Proceeding as per manual mode..."
```

---

## Performance

**Speed:** ~10-50ms for 100 history entries

**Scalability:** O(n) where n = history size

**No external dependencies** (pure Python stdlib)

---

**Version:** 1.0  
**Created:** 2026-08-13  
**Optimized for:** Vietnamese Buddhist dharma/wisdom content


## Production V9 — global-first multilingual duplicate scope

The final duplicate decision is **global across `database/history.json`**, not isolated by `(language, videoType)`. Language/type remain useful for same-lane fatigue analysis, but they are not an escape hatch. A Vietnamese Long and an English Short about the same core phenomenon can still be duplicates. `check_topic_duplicate.py` therefore runs a global Tier-1 scan + global keyword/AI semantic check, then attaches same-lane and same-category signals.

Topic research evidence must also pass `topic_research_gate.py --verify-sources --verify-content --ai-model <queue.aiModel>`. V9 rejects unsafe/unreachable sources and verifies source content, freshness claims, and support notes. The Tier-1 duplicate scan also canonicalizes high-value VI↔EN concepts before top-k AI review, so translations are not discarded simply because their surface words differ.
