#!/usr/bin/env python3
"""Small deterministic VI↔EN concept normalizer for topic retrieval.

This is not a translator. It canonicalizes high-value concepts used by the two
active pillars (buddhist_life and buddhist_wisdom) so cross-language duplicates
reach the semantic AI checker instead of being lost by lexical top-k ranking.
"""
from __future__ import annotations

import re
import unicodedata
from functools import lru_cache
from typing import Set

_NON_ALNUM_HYPHEN_RE = re.compile(r"[^a-z0-9\s-]")


@lru_cache(maxsize=8192)
def norm(text: str) -> str:
    t = unicodedata.normalize("NFKD", str(text)).casefold()
    t = "".join(c for c in t if not unicodedata.combining(c)).replace("đ", "d")
    t = _NON_ALNUM_HYPHEN_RE.sub(" ", t)
    return " ".join(t.split())

# Longest phrases first. Keep canonical labels language-neutral and stable.
PHRASES = {
    # Cross-domain legacy duplicate anchors retained for global history safety.
    # The active channel scope is Buddhist-only; these do NOT participate in
    # category selection. They only prevent old translated topics from slipping
    # past the global duplicate gate.
    "trai dat": "earth", "earth": "earth",
    "ngung quay": "stop_rotation", "stopped rotating": "stop_rotation", "stop rotating": "stop_rotation",
    "dot ngot": "suddenly", "suddenly": "suddenly",
    "dieu gi xay ra": "what_happens", "what would happen": "what_happens", "what happens": "what_happens",
    # Core Buddhism — teachings & concepts
    "duc phat": "buddha", "the buddha": "buddha", "buddha": "buddha",
    "thich ca": "shakyamuni", "shakyamuni": "shakyamuni", "siddhartha": "siddhartha",
    "gautama": "siddhartha",
    "phat giao": "buddhism", "buddhism": "buddhism", "buddhist": "buddhism",
    "tu dieu de": "four_noble_truths", "four noble truths": "four_noble_truths",
    "bat chanh dao": "eightfold_path", "eightfold path": "eightfold_path",
    "ngu gioi": "five_precepts", "five precepts": "five_precepts",
    "vo thuong": "impermanence", "impermanence": "impermanence", "anicca": "impermanence",
    "vo nga": "non_self", "non-self": "non_self", "anatta": "non_self",
    "duyen khoi": "dependent_origination", "dependent origination": "dependent_origination",
    "nhan qua": "karma", "karma": "karma",
    "luan hoi": "samsara", "samsara": "samsara", "rebirth": "samsara",
    "niet ban": "nirvana", "nirvana": "nirvana", "nibbana": "nirvana",
    "giai thoat": "liberation", "liberation": "liberation",
    "giac ngo": "enlightenment", "enlightenment": "enlightenment", "awakening": "enlightenment",
    "chanh niem": "mindfulness", "mindfulness": "mindfulness", "sati": "mindfulness",
    "tu bi": "compassion", "compassion": "compassion", "karuna": "compassion",
    "tri tue": "wisdom", "wisdom": "wisdom", "prajna": "wisdom",
    "buong bo": "letting_go", "buong xa": "letting_go", "letting go": "letting_go",
    "tam an": "inner_peace", "inner peace": "inner_peace", "binh an": "inner_peace",
    "hanh phuc": "happiness", "happiness": "happiness",
    "kho dau": "suffering", "suffering": "suffering", "dukkha": "suffering",

    # Meditation & practice
    "thien": "meditation", "meditation": "meditation",
    "thien dinh": "samadhi", "samadhi": "samadhi", "concentration": "samadhi",
    "vipassana": "vipassana", "insight meditation": "vipassana",
    "samatha": "samatha", "calm meditation": "samatha",
    "hoi tho": "breath", "breathing": "breath", "anapanasati": "breath_meditation",

    # Buddhist texts & traditions
    "kinh phap cu": "dhammapada", "dhammapada": "dhammapada",
    "kinh pali": "pali_canon", "pali canon": "pali_canon",
    "dai tang kinh": "tripitaka", "tripitaka": "tripitaka",
    "dai thua": "mahayana", "mahayana": "mahayana",
    "tieu thua": "theravada", "theravada": "theravada",
    "phat giao nguyen thuy": "theravada",
    "thien tong": "zen", "zen": "zen",
    "tinh do": "pure_land", "pure land": "pure_land",
    "mat tong": "vajrayana", "vajrayana": "vajrayana", "tantra": "vajrayana",

    # Historical figures & places
    "bo de dao trang": "bodh_gaya", "bodh gaya": "bodh_gaya",
    "lumbini": "lumbini",
    "sarnath": "sarnath",
    "kushinagar": "kushinagar",
    "thich nhat hanh": "thich_nhat_hanh",
    "dat lai lat ma": "dalai_lama", "dalai lama": "dalai_lama",
    "a nan": "ananda", "ananda": "ananda",
    "xa loi phat": "sariputta", "sariputta": "sariputta",
    "muc kien lien": "moggallana", "moggallana": "moggallana",
    "truc lam": "truc_lam", "yen tu": "yen_tu",
    "tran nhan tong": "tran_nhan_tong",

    # Buddhist stories
    "tien than": "jataka", "jataka": "jataka",
    "cau chuyen phat giao": "buddhist_story", "buddhist story": "buddhist_story",
    "bai hoc nhan sinh": "life_lesson", "life lesson": "life_lesson",

    # Places & objects
    "chua": "temple", "temple": "temple", "pagoda": "temple",
    "thien vien": "monastery", "monastery": "monastery",
    "thanh tich": "sacred_site", "sacred site": "sacred_site",
    "bao thap": "stupa", "stupa": "stupa",
    "hoa sen": "lotus", "lotus": "lotus",
    "tuong phat": "buddha_statue", "buddha statue": "buddha_statue",
    "cay bo de": "bodhi_tree", "bodhi tree": "bodhi_tree",

    # Nature & contemplative imagery
    "thien nhien": "nature", "nature": "nature",
    "nui": "mountain", "mountain": "mountain",
    "suoi": "stream", "stream": "stream",
    "ho": "lake", "lake": "lake",
    "rung": "forest", "forest": "forest",
}

# Additional single-word aliases not safely expressed as phrases.
WORDS = {
    "thien": "meditation", "meditation": "meditation",
    "phat": "buddha", "buddha": "buddha",
    "kinh": "sutra", "sutra": "sutra",
    "phap": "dharma", "dharma": "dharma",
    "tang": "sangha", "sangha": "sangha",
    "nghiep": "karma", "karma": "karma",
    "thien": "meditation",
    "tu": "practice", "practice": "practice",
    "tam": "mind", "mind": "mind",
    "sen": "lotus", "lotus": "lotus",
}


# PHRASES is a static table: norm(phrase) and its word-boundary regex never
# change at runtime, so both are precomputed once here instead of being
# rebuilt from scratch on every concepts() call. concepts() is called at
# least once per compared history entry (and again per scan by callers such
# as similarity_engine.py), so this removes repeated norm()+regex-build
# operations per call for identical matching behavior.
_COMPILED_PHRASES = [
    (re.compile(rf"(?<![a-z0-9]){re.escape(norm(phrase))}(?![a-z0-9])"), canonical)
    for phrase, canonical in PHRASES.items()
]


@lru_cache(maxsize=8192)
def concepts(text: str) -> Set[str]:
    t = norm(text)
    out: Set[str] = set()
    # Phrase matching with word boundaries prevents accidental substrings.
    for pattern, canonical in _COMPILED_PHRASES:
        if pattern.search(t):
            out.add(canonical)
    for w in t.split():
        if w in WORDS:
            out.add(WORDS[w])
        # Identifiers with digits survive language translation.
        if any(c.isdigit() for c in w) and len(w) >= 3:
            out.add("id:" + w)
    return out


def similarity(a: str, b: str) -> float:
    ca, cb = concepts(a), concepts(b)
    if not ca or not cb:
        return 0.0
    inter = ca & cb
    union = ca | cb
    j = len(inter) / len(union)
    # Strong exact concept bundles deserve a floor: 3 shared concepts with very
    # little disagreement is generally the same core subject across languages.
    if len(inter) >= 3 and len(union) <= len(inter) + 2:
        return max(j, 0.78)
    if len(inter) >= 2 and len(union) <= len(inter) + 1:
        return max(j, 0.68)
    return j
