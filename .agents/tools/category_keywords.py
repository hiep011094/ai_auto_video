#!/usr/bin/env python3
"""
category_keywords.py — Single source of truth for ACTIVE content categories
and their keyword lists.

ACTIVE content categories are intentionally limited to exactly two:
1) buddhist_life     -> Phật pháp sống
2) buddhist_wisdom   -> Trí tuệ Phật giáo

Channel: ĐƯỜNG VỀ TỈNH THỨC
Language: Vietnamese only

Previous categories (space_science, world_mysteries) are retired.
Old history entries with an explicit retired/unknown category are preserved
as-is and ignored by ACTIVE rotation. Old entries missing `category` are
classified into one of the two ACTIVE categories only.
"""

# Canonical deterministic ACTIVE category order. Keep this order stable:
# selectors use it as the final tie-breaker so identical history always
# produces identical output.
CATEGORY_ORDER = (
    'buddhist_life',
    'buddhist_wisdom',
)
ALL_CATEGORIES = set(CATEGORY_ORDER)

CATEGORY_KEYWORDS = {
    'buddhist_life': [
        # Phật pháp ứng dụng vào cuộc sống
        'phật pháp', 'ứng dụng', 'cuộc sống', 'tâm', 'tâm an',
        'hạnh phúc', 'khổ đau', 'buông bỏ', 'buông xả', 'chấp nhận',
        'từ bi', 'trí tuệ', 'chánh niệm', 'tỉnh thức', 'giác ngộ',
        'nhân quả', 'nghiệp', 'karma', 'luân hồi', 'giải thoát',
        'tham sân si', 'phiền não', 'chấp trước', 'vô minh', 'tâm bình an',
        'sống tốt', 'hành trì', 'tu tập', 'cư sĩ', 'phật tử',
        'lòng biết ơn', 'tha thứ', 'nhẫn nhục', 'tinh tấn', 'hỷ xả',
        # Thiền, an yên, ngủ ngon, buông bỏ
        'thiền', 'thiền định', 'thiền quán', 'vipassana', 'samatha',
        'an yên', 'tĩnh tâm', 'ngủ ngon', 'thư giãn', 'bình an',
        'cân bằng', 'nội tâm', 'tâm tĩnh', 'hơi thở', 'chánh định',
        'thở sâu', 'chánh niệm hơi thở', 'anapanasati', 'quán chiếu',
        'buông', 'xả ly', 'thanh tịnh', 'an lạc', 'tự tại',
        # Giải thích kinh/pháp theo cách dễ hiểu
        'kinh', 'pháp', 'tứ diệu đế', 'bát chánh đạo', 'ngũ giới',
        'lục độ', 'ba la mật', 'vô thường', 'vô ngã', 'duyên khởi',
        'trung đạo', 'niết bàn', 'bồ đề', 'tam bảo', 'quy y',
        'thập nhị nhân duyên', 'ngũ uẩn', 'tứ niệm xứ', 'thất giác chi',
        'tam pháp ấn', 'tứ vô lượng tâm', 'từ bi hỷ xả',
    ],
    'buddhist_wisdom': [
        # Những câu chuyện Phật giáo – bài học nhân sinh
        'câu chuyện', 'bài học', 'nhân sinh', 'truyện phật', 'tích phật',
        'tiền thân', 'jataka', 'ngụ ngôn', 'ví dụ', 'dụ ngôn',
        'đệ tử', 'a nan', 'xá lợi phất', 'mục kiền liên', 'ca diếp',
        'tu sĩ', 'thiền sư', 'trưởng lão', 'truyện cổ phật giáo',
        'gương sáng', 'hạnh nguyện', 'câu chuyện thiền',
        'trích dẫn', 'phật dạy', 'lời phật dạy', 'pháp cú', 'dhammapada',
        'pháp bảo đàn kinh', 'bách dụ kinh',
        # Lịch sử Phật giáo, nhân vật, thánh tích
        'lịch sử', 'đức phật', 'thích ca', 'siddhartha', 'gautama',
        'bồ đề đạo tràng', 'bodh gaya', 'lumbini', 'sarnath', 'kushinagar',
        'chùa', 'thiền viện', 'thánh tích', 'di tích', 'bảo tháp',
        'phật giáo nguyên thủy', 'đại thừa', 'tiểu thừa', 'thiền tông',
        'tịnh độ', 'mật tông', 'nam truyền', 'bắc truyền',
        'thích nhất hạnh', 'ajahn chah', 'long thọ', 'thế thân',
        'tam tạng kinh', 'đại tạng kinh', 'kinh pali',
        'phật giáo việt nam', 'trúc lâm', 'yên tử',
        'trần nhân tông', 'vạn hạnh', 'khuông việt',
        'angkor wat', 'borobudur', 'bagan', 'phật giáo tây tạng',
        'đạt lai lạt ma', 'phật giáo nhật bản', 'zen',
    ],
}

CATEGORY_NAMES_VI = {
    'buddhist_life': 'Phật pháp sống',
    'buddhist_wisdom': 'Trí tuệ Phật giáo',
}


def auto_classify_category(title: str, main_content: str) -> str:
    """
    Fallback classifier for OLD history entries missing the `category` field.

    It can only return one of the two currently ACTIVE categories. Entries
    already carrying an explicit retired/invalid category are handled by the
    rotation/reporting tools and are not remapped into the active cycle.
    """
    text = (title + ' ' + main_content).lower()

    scores = {}
    for category, keywords in CATEGORY_KEYWORDS.items():
        scores[category] = sum(1 for kw in keywords if kw in text)

    if max(scores.values()) > 0:
        best = max(scores.values())
        return next(cat for cat in CATEGORY_ORDER if scores.get(cat, 0) == best)

    # Keep the channel default deterministic.
    return 'buddhist_life'
