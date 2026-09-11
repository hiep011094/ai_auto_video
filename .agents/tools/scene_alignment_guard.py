#!/usr/bin/env python3
"""Deterministic scene↔narration subject guard.

This is intentionally conservative: it catches obvious named-subject swaps before
AI semantic QA (Moon -> Mercury, Jupiter -> comet/black hole, etc.). It does not
attempt to replace semantic reasoning. No final project schema is changed.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Dict, List, Set, Tuple
import word_splitter as canonical_splitter


def _fold(text: str) -> str:
    text = unicodedata.normalize("NFKC", str(text or "")).casefold()
    text = text.replace("–", "-").replace("—", "-").replace("−", "-")
    return re.sub(r"\s+", " ", text).strip()


# Canonical subject -> aliases that may appear in narration or English Veo prompts.
# Keep aliases specific enough to avoid matching generic adjectives such as "solar".
ENTITY_ALIASES: Dict[str, Tuple[str, ...]] = {
    "moon": ("mặt trăng", "moon", "the moon", "earth's moon", "earth’s moon", "lunar globe"),
    "mercury": ("sao thủy", "mercury", "planet mercury", "mercury planet"),
    "venus": ("sao kim", "venus", "planet venus", "venus planet"),
    "earth": ("trái đất", "earth", "planet earth", "the earth", "earth globe"),
    "mars": ("sao hỏa", "mars", "planet mars", "the red planet mars", "mars planet"),
    "jupiter": ("sao mộc", "jupiter", "planet jupiter", "gas giant jupiter", "jupiter planet"),
    "saturn": ("sao thổ", "saturn", "planet saturn", "ringed saturn", "saturn planet"),
    "uranus": ("sao thiên vương", "uranus", "planet uranus", "uranus planet"),
    "neptune": ("sao hải vương", "neptune", "planet neptune", "neptune planet"),
    "sun": ("mặt trời", "sun", "the sun", "solar photosphere", "solar disk", "solar disc"),
    "pluto": ("sao diêm vương", "diêm vương", "dwarf planet pluto", "planet pluto"),
    "sirius": ("sirius",),
    "betelgeuse": ("betelgeuse",),
    "uy_scuti": ("uy scuti",),
    "vy_canis_majoris": ("vy canis majoris",),
    "stephenson_2_18": ("stephenson 2-18", "stephenson 2 18"),
    "black_hole": ("hố đen", "black hole", "event horizon", "photon ring"),
    "ton_618": ("ton 618",),
    "sagittarius_a_star": ("sagittarius a*", "sagittarius a star", "sgr a*"),
    "milky_way": ("dải ngân hà", "milky way"),
    "andromeda": ("thiên hà tiên nữ", "andromeda galaxy", "andromeda"),
    "ic_1101": ("ic 1101",),
    "local_group": ("nhóm địa phương", "local group"),
    "virgo_supercluster": ("siêu đám xử nữ", "virgo supercluster"),
    "laniakea": ("laniakea",),
    "hercules_corona_borealis_great_wall": (
        "hercules-corona borealis great wall",
        "hercules corona borealis great wall",
        "trường thành hercules-corona borealis",
        "vạn lý trường thành hercules-corona borealis",
    ),
    "observable_universe": (
        "vũ trụ quan sát được",
        "observable universe",
        "observable-universe",
    ),
}


def _contains_alias(text: str, alias: str) -> bool:
    text_f = _fold(text)
    alias_f = _fold(alias)
    if not alias_f:
        return False
    # ASCII alphanumeric aliases benefit from boundaries; Vietnamese phrases and
    # punctuation-rich names are safer as normalized substring matches.
    if re.fullmatch(r"[a-z0-9 *.+-]+", alias_f):
        # Prevent false entity matches on hyphenated prefixes (e.g. pre-JWST, post-Apollo)
        prefix_pattern = r"(?<![a-z0-9])" if alias_f.startswith("-") else r"(?<![a-z0-9-])"
        suffix_pattern = r"(?![a-z0-9])" if alias_f.endswith("-") else r"(?![a-z0-9-])"
        return re.search(prefix_pattern + re.escape(alias_f) + suffix_pattern, text_f) is not None
    return alias_f in text_f


def entity_alias_map_from_visual_bible(vb: dict) -> Dict[str, Tuple[str, ...]]:
    """Build dynamic named-entity aliases from recurring visual-bible subjects."""
    out: Dict[str, Tuple[str, ...]] = {}
    for group_key, prefix in (("characters", "character"), ("locations", "location"), ("key_objects", "object")):
        for item in vb.get(group_key, []) if isinstance(vb, dict) else []:
            name = str(item.get("name", "")).strip()
            if not name or name.casefold() in {"narrator", "narrator (off-screen, voice-only)"}:
                continue
            aliases = [name] + [str(x).strip() for x in item.get("aliases", []) if str(x).strip()]
            out[f"{prefix}:{_fold(name)}"] = tuple(dict.fromkeys(aliases))
    return out


def detect_entities(text: str, alias_map: Dict[str, Tuple[str, ...]] | None = None) -> Set[str]:
    found: Set[str] = set()
    cleaned_text = re.sub(r"\b(?:mass\s+of\s+(?:our|the)\s+sun|solar\s+mass(?:es)?|khối\s+lượng\s+mặt\s+trời)\b", " ", text, flags=re.I)
    merged = dict(ENTITY_ALIASES)
    if alias_map:
        merged.update(alias_map)
    for canonical, aliases in merged.items():
        if any(_contains_alias(cleaned_text, alias) for alias in aliases):
            found.add(canonical)
    return found


def _positive(prompt: str) -> str:
    return re.split(r"\bnegative\s*:", str(prompt or ""), maxsplit=1, flags=re.I)[0]


def deterministic_subject_issues(scene: dict, alias_map: Dict[str, Tuple[str, ...]] | None = None) -> List[str]:
    """Return blocking issues for obvious named-subject mismatch.

    Rules:
    - If CURRENT voiceover names one or more known subjects, each must be present
      in the positive visual prompt.
    - The prompt's opening/primary-subject zone must not replace them with a
      different known named subject.
    - If voiceover contains no named subject but is clearly anaphoric and the
      full context contains exactly one known subject, that subject is required.
    - When a scene crosses a sentence boundary, the V9 single-shot contract requires
      picking ONE bridge-compatible visual setup. The prompt must depict a subject
      from at least one of the sentence clauses, and opening on that subject is permitted.
    """
    vo = str(scene.get("voiceover", ""))
    ctx = str(scene.get("context_ref", ""))
    pos = _positive(str(scene.get("veo_prompt", "")))

    sentences = [s.strip() for s in canonical_splitter.split_sentences(vo) if s.strip()]
    is_boundary_crossing = len(sentences) > 1

    vo_entities = detect_entities(vo, alias_map)
    ctx_entities = detect_entities(ctx, alias_map)
    prompt_entities = detect_entities(pos, alias_map)
    opening_entities = detect_entities(pos[:900], alias_map)
    issues: List[str] = []

    if is_boundary_crossing:
        clause_entity_sets = []
        for s in sentences:
            e = detect_entities(s, alias_map)
            if not e:
                anaphora = re.search(
                    r"\b(nó|này|đó|chúng|vật thể này|ngôi sao này|hành tinh này|thiên thể này|"
                    r"it|its|this object|this star|this planet|this body|this structure|that object)\b",
                    _fold(s),
                    re.I,
                )
                if anaphora and len(ctx_entities) == 1:
                    e = set(ctx_entities)
            clause_entity_sets.append(e)

        has_unrestricted_clause = any(not c_ents for c_ents in clause_entity_sets)
        if has_unrestricted_clause:
            return []

        satisfied = any(c_ents & prompt_entities for c_ents in clause_entity_sets)
        if not satisfied:
            all_possible = sorted(set().union(*clause_entity_sets))
            issues.append(
                "named-subject lock: sentence boundary crossing voiceover requires a bridge subject from "
                + ", ".join(all_possible)
                + " but the positive prompt does not depict any of them"
            )

        all_allowed = set().union(*clause_entity_sets)
        conflicting_opening = sorted(opening_entities - all_allowed)
        if conflicting_opening and not (opening_entities & all_allowed):
            issues.append(
                "named-subject lock: prompt opens on conflicting subject(s) "
                + ", ".join(conflicting_opening)
                + " instead of boundary bridge subject(s) "
                + ", ".join(sorted(all_allowed))
            )
        return issues

    required = set(vo_entities)
    if not required:
        anaphora = re.search(
            r"\b(nó|này|đó|chúng|vật thể này|ngôi sao này|hành tinh này|thiên thể này|"
            r"it|its|this object|this star|this planet|this body|this structure|that object)\b",
            _fold(vo),
            re.I,
        )
        if anaphora and len(ctx_entities) == 1:
            required = set(ctx_entities)

    if not required:
        return []

    missing = sorted(required - prompt_entities)
    if missing:
        issues.append(
            "named-subject lock: current voiceover requires "
            + ", ".join(missing)
            + " but the positive prompt does not depict/name it"
        )

    conflicting_opening = sorted(opening_entities - required)
    if conflicting_opening and not (opening_entities & required):
        issues.append(
            "named-subject lock: prompt opens on conflicting subject(s) "
            + ", ".join(conflicting_opening)
            + " instead of current voiceover subject(s) "
            + ", ".join(sorted(required))
        )

    return issues


def unreliable_exact_count_issues(scene: dict) -> List[str]:
    """Block prompts that ask the generative model to visually count many copies.

    Exact large counts should be communicated via post-production graphics, not by
    asking Veo to render 109/760/1300 individually countable objects.
    """
    pos = _positive(str(scene.get("veo_prompt", "")))
    issues: List[str] = []
    patterns = [
        r"\b(?:line|row|grid|array|ring|chain|stack|formation)\s+of\s+(\d{2,})\s+",
        r"\b(?:show|showing|display|displaying|depict|depicting|render|rendering)\s+(?:exactly\s+)?(\d{2,})\s+",
        r"\b(\d{2,})\s+(?:miniature\s+)?(?:earth|planet|star|galaxy|sphere|copy|object)s?\b",
    ]
    for rx in patterns:
        m = re.search(rx, pos, re.I)
        if not m:
            continue
        try:
            count = int(m.group(1))
        except Exception:
            continue
        if count >= 20:
            issues.append(
                f"exact-count reliability lock: prompt asks Veo to render/count {count} repeated objects; use representative scale geometry and add the exact number in post"
            )
            break
    return issues
