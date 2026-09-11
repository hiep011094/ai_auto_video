# 08 — Definition of `last_hook_pattern` (Opening Patterns 1–5)

> **Status:** These 5 opening patterns have been defined for the channel's content style (the two Buddhist pillars — Phật pháp sống / Trí tuệ Phật giáo — with a serene cinematic documentary approach). They balance contemplative engagement with authenticity, and rotate across videos to keep the channel fresh for regular viewers.

## Purpose of `last_hook_pattern`

Records which type of opening (the first 3–5 seconds / first line of
`master_script.txt`) was used for the video just produced, so that next time
(especially when `generationMethod = auto`) the agent **rotates** between
patterns instead of repeating the same opening style across many videos in a
row — avoiding monotony for viewers who follow the channel regularly.

## The 5 opening patterns

| # | Pattern name | Description | Opening example (vi — `contemplative`) |
|---|---|---|---|
| 1 | **Câu hỏi chiêm nghiệm** | Opens with a reflective, relatable question that makes the viewer pause and look inward. Works best with contemplative/life-application topics. | "Bạn có bao giờ tự hỏi vì sao càng cố tìm hạnh phúc, lại càng thấy khổ?" <br><br>*"Điều gì khiến một người đã có tất cả lại bỏ hết để đi tìm sự thật?"* |
| 2 | **Trích dẫn kinh điển** | Opens with a powerful, verified teaching from canonical texts that feels immediately relevant to modern life. Best for Mode 2 topics grounded in sutras. | "Đức Phật dạy: 'Không ai cứu được ta ngoài chính ta. Không ai có thể và không ai được phép.'" <br><br>*"Trong Kinh Pháp Cú có viết: 'Tâm dẫn đầu mọi pháp. Tâm là chủ, tâm tạo tác tất cả.'"* |
| 3 | **Bối cảnh lịch sử sống động** | Opens with a specific historical moment/situation as if it's happening right now, then pulls back to explain the bigger meaning. Creates immediate immersion. | "2.500 năm trước, dưới gốc cây Bồ Đề, có một người đàn ông ngồi bất động suốt 49 ngày." <br><br>*"Đêm trăng tròn tháng Tư, thái tử Tất Đạt Đa lặng lẽ rời hoàng cung khi cả kinh thành đang say ngủ."* |
| 4 | **Nghịch lý nhân sinh** | Opens by pointing out a paradox or counter-intuitive truth about life that Buddhism addresses, creating motivation to keep watching to understand why. | "Người giàu nhất vương quốc bỏ tất cả để sống không một xu dính túi — và nói rằng đó mới là tự do." <br><br>*"Buông bỏ — nghe như mất mát. Nhưng Đức Phật lại bảo đó chính là cách nắm giữ hạnh phúc thật sự."* |
| 5 | **Bài học từ đời thường** | Opens with a concrete, relatable everyday situation that leads into a Buddhist teaching, tapping into shared human experience. Best for life-application topics. | "Có một người mỗi ngày đều tức giận với hàng xóm... cho đến khi nghe vị sư già nói một câu." <br><br>*"Một buổi sáng, có người đến gặp Đức Phật và mắng chửi rất nhiều. Nhưng Ngài chỉ im lặng, rồi hỏi lại một câu."* |

## Hook truthfulness guardrail

A hook may intensify **presentation**, never the underlying teaching. Before
accepting any hook:

- Any sutra reference, historical date, location, attribution to the Buddha
  or a specific teacher must be verified for the selected `mode` and current
  context.
- Do not copy a dramatic quote from the examples below into an unrelated
  topic. Examples demonstrate *pattern shape*, not reusable facts.
- For `mode = "1"`, reflective framings must stay honest and not claim
  canonical authority for personal interpretation.
- For `mode = "2"`, prefer the verified canonical teaching or historical fact
  itself over an embellished consequence.
- Teachings attributed to the Buddha should be verifiable in canonical texts.
  Do not fabricate quotes.

## How to use it in the workflow

1. When writing `master_script.txt` (Step 3, `01_workflow.md`), choose one
   of the 5 patterns above for the opening line/passage, matched to `topic`
   and `mode` (`1` — Chiêm nghiệm usually fits patterns 1/4/5; `2` — Kiến
   thức usually fits patterns 2/3).
2. If `generationMethod = auto`: read the `last_hook_pattern` of the most
   recent videos (up to 3) in `database/history.json`, and **prefer a
   different pattern** from the recent ones to keep things varied — unless
   the topic genuinely only fits one specific pattern.
3. If `generationMethod = manual`: still pick the pattern that fits the
   content best; rotation is not required (since the user already chose the
   topic deliberately).
4. Record the pattern number used (1–5) in the `last_hook_pattern` field
   when updating `database/history.json` (Step 11).
