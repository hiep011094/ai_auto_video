#!/usr/bin/env python3
"""
qa_automation.py — Deterministic final QA for video output files.

This is the non-semantic quality gate. It is deliberately independent from
the writing agent so it can catch structural mistakes introduced after scene
splitting. Meaning-level QA is performed batch-by-batch by scene_semantic_checker.py before final QA; this tool verifies current hash-bound receipt coverage so a duplicate full-video AI pass is unnecessary.

USAGE:
    python3 .agents/tools/qa_automation.py --folder data/video_short/example-slug --lang vi
    python3 .agents/tools/qa_automation.py --folder data/video_long/example-slug --lang en --mode 2

EXIT CODES:
    0 = deterministic checks passed
    1 = one or more checks failed
    2 = system/input error

HARD CHECKS INCLUDE:
    - SHORT master_script character limits; LONG >60,000-character minimum with no fixed character ceiling
    - schema validation, including closed final-output objects/no undeclared fields
    - sequential scenes and non-resetting sentence_id
    - valid/sequential part=x/N labels per sentence_id
    - exact master_script -> scene voiceover lossless coverage
    - whitespace word-count rule + voiceover/sub integrity
    - exact canonical re-derivation of context_ref/sentence_id/part
    - context_ref viewer-facing leak/expansion detection
    - SHORT=9:16 / LONG=16:9 and Long multi-chapter story_anchor
    - named recurring visual-bible entities reuse canonical anchors verbatim
    - every prompt contains the complete visual_bible Negative list
    - veo_prompt 900..4,000 Unicode characters + >=800 positive visual characters before Negative
    - canonical film-look anchor exactly once + lens/camera/lighting/focus craft contract
    - no duplicated canonical anchors and no exact prompt reuse
    - continuity_ref structured Previous-end/Current-opening handoff
    - stable visual-domain + physically plausible camera-scale checks
    - positive↔Negative conflict and exact generated-typography/logo blocking
    - one-shot/no-transition format with exact single-take + Negative edit locks
    - deterministic named-subject swap / unreliable large exact-count blocking
    - hash-matching semantic PASS receipt coverage for every micro-batch
    - English-only visual prompt contract and no audio/sound/dialogue instructions

WARNING-ONLY HEURISTICS INCLUDE:
    - near-duplicate consecutive prompts / vague continuity handoffs
    - repeated shot_type
    - obvious policy-risk wording (manual policy judgment still required)

MEANING-LEVEL QA REQUIRED BEFORE FINAL QA:
    - each generation batch must already pass scene_semantic_checker.py for scene↔voiceover fidelity, part
      progression, semantic identity drift, continuity and physics
    - final QA verifies hash-current semantic receipt coverage and reruns AI only for stale/changed ranges
    - manually decide ambiguous style/mode/policy/lighting cases
"""

from quality_archive import runtime_file, archive_verified_inputs
from channel_scope_gate import validate_scope
import argparse
import difflib
import json
import re
import sys
import subprocess
from pathlib import Path

from scene_alignment_guard import deterministic_subject_issues, unreliable_exact_count_issues, entity_alias_map_from_visual_bible
from semantic_receipts import matching_receipt
import word_splitter as canonical_splitter

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Script-length policy (from 02_content_style.md).
# SHORT remains bounded for format discipline. LONG has a strict >60,000-char
# floor and no maximum. The floor is a format requirement, while completeness,
# evidence, anti-padding, and narrative-quality gates still decide whether the
# content genuinely deserves the length.
LONG_MIN_CHARS_EXCLUSIVE = 60000
LONG_RECOMMENDED_CHARS = 65000
CHAR_LIMITS = {
    "short": (900, 1200),
    "long": (LONG_MIN_CHARS_EXCLUSIVE + 1, None),
}

# User/pipeline hard ceiling for every final veo_prompt. Count Unicode code
# points exactly as Python len() on the JSON string value.
VEO_PROMPT_MIN_CHARS = 900
VEO_PROMPT_MAX_CHARS = 4000
VEO_POSITIVE_MIN_CHARS = 800

# Must stay in sync with tools/word_splitter.py and 04_scene_splitting_rules.md.
WORDS_PER_SCENE = {
    ("short", "vi"): 14,
    ("short", "en"): 10,
    ("long", "vi"): 20,
    ("long", "en"): 15,
}

# Hard one-take/no-internal-edit contract. Every positive prompt starts with
# this exact anchor; every Negative clause carries the exact edit lock.
SINGLE_TAKE_ANCHOR = "Create exactly one uninterrupted continuous shot in one visual setup for the entire clip."
NO_INTERNAL_EDIT_NEGATIVE = "internal cuts, scene transitions, fades, dissolves, morph transitions, montage, time jumps, location changes, visual-domain changes"
MANDATORY_SAFETY_NEGATIVES = [
    "no real identifiable people",
    "no celebrity likeness",
    "no graphic violence",
    "no gore",
    "no nudity",
    "no sexual content",
    "no hate symbols",
]

# Transition/multi-shot phrases forbidden in POSITIVE visual direction.
TRANSITION_PHRASES = [
    "cuts to", "cut to", "hard cut", "smash cut", "match cut", "jump cut",
    "transitions to", "transitioning to", "transition to", "scene transition",
    "fades to", "fade to", "fade out", "fade in", "crossfade",
    "dissolves into", "dissolve to", "morphs into", "morph into",
    "transforms into", "becomes a new scene", "switches to", "switch to",
    "wipe to", "whip transition", "followed by a shot", "after that",
    "followed by", "meanwhile", "in the next shot", "another shot shows",
    "the scene changes", "scene changes", "camera cuts", "we cut", "we then see",
    "montage", "sequence of shots", "series of shots", "multiple shots",
    "split screen", "split-screen", "picture-in-picture", "flashback",
    "flash forward", "time jump", "hours later", "years later",
]
TRANSITION_REGEXES = [
    r"\bthen\b.{0,120}\b(?:another|new|different)\s+(?:scene|shot|setup|location|setting)\b",
    r"\b(first|initially)\b.{0,220}\b(then|next|afterward|afterwards)\b",
    r"\b(new|different|another)\s+(scene|location|setting|shot|setup)\b",
]

# Heuristic, non-exhaustive keyword scan for obvious policy-risk wording
# (see 12_veo_policy_compliance.md). This is a coarse safety net only —
# it flags obvious cases for a human to review, it does NOT replace the
# manual judgment call required by 07_qa_checklist.md §E.
POLICY_RISK_KEYWORDS = [
    "blood", "gore", "corpse", "dead body", "nude", "naked",
    "sexual", "explicit", "suicide", "self-harm", "gunshot wound",
    "graphic injury", "torture",
]

# Minimum policy-safety negative keywords expected in every veo_prompt's
# Negative clause (see 12_veo_policy_compliance.md §4) — flags if NONE of
# these appear, as a loose signal the safety negative list was dropped.
POLICY_SAFETY_NEGATIVE_HINTS = [
    "no real identifiable people", "no celebrity likeness",
    "no graphic violence", "no gore", "no nudity", "no sexual content",
    "no hate symbols",
]


def error(msg):
    print(f"❌ ERROR: {msg}", file=sys.stderr)


def warn(msg):
    print(f"⚠️  WARNING: {msg}", file=sys.stderr)


def ok(msg):
    print(f"✅ {msg}")


def check_master_script_length(folder_path, video_type):
    """Validate SHORT bounds and the LONG >60k floor without imposing a LONG cap."""
    script_path = folder_path / "master_script.txt"
    if not script_path.exists():
        error(f"master_script.txt not found in {folder_path}")
        return False

    with open(script_path, "r", encoding="utf-8") as f:
        content = f.read()

    char_count = len(content)
    if not content.strip():
        error("master_script.txt is empty")
        return False

    min_chars, max_chars = CHAR_LIMITS[video_type]
    if video_type == "long":
        if char_count <= LONG_MIN_CHARS_EXCLUSIVE:
            error(
                f"master_script.txt length {char_count} chars is too short for LONG; "
                f"require strictly > {LONG_MIN_CHARS_EXCLUSIVE} Unicode characters "
                f"(recommended >= {LONG_RECOMMENDED_CHARS}), with no maximum"
            )
            return False
        margin = "recommended production margin reached" if char_count >= LONG_RECOMMENDED_CHARS else "valid but below recommended 65k production margin"
        ok(f"master_script.txt length {char_count} chars accepted for LONG (>60000, no maximum; {margin})")
        return True

    if char_count < min_chars or char_count > max_chars:
        error(f"master_script.txt length {char_count} chars is outside range [{min_chars}, {max_chars}] for {video_type}")
        return False

    ok(f"master_script.txt length {char_count} chars is within range [{min_chars}, {max_chars}]")
    return True


def validate_json_schemas(folder_path, agents_path):
    """Run schema_validator.py on all JSON files"""
    schema_map = {
        "metadata.json": "metadata.schema.json",
        "visual_bible.json": "visual_bible.schema.json",
    }
    
    all_valid = True
    
    # Check metadata and visual_bible
    for filename, schema_name in schema_map.items():
        json_path = folder_path / filename
        schema_path = agents_path / "schemas" / schema_name
        
        if not json_path.exists():
            error(f"{filename} not found")
            all_valid = False
            continue
        
        result = subprocess.run(
            [sys.executable, "-X", "utf8", str(agents_path / "tools" / "schema_validator.py"),
             "--schema", str(schema_path),
             "--file", str(json_path)],
            capture_output=True,
            text=True,
            encoding="utf-8"
        )
        
        if result.returncode != 0:
            err_msg = result.stderr.strip() if result.stderr else result.stdout.strip()
            error(f"{filename} failed schema validation:\n{err_msg}")
            all_valid = False
        else:
            ok(f"{filename} passed schema validation")
    
    # Check all chapter_*.json files
    chapter_files = sorted(folder_path.glob("chapter_*.json"))
    if not chapter_files:
        error("No chapter_*.json files found")
        return False
    
    chapter_schema = agents_path / "schemas" / "chapter.schema.json"
    for chapter_path in chapter_files:
        result = subprocess.run(
            [sys.executable, "-X", "utf8", str(agents_path / "tools" / "schema_validator.py"),
             "--schema", str(chapter_schema),
             "--file", str(chapter_path)],
            capture_output=True,
            text=True,
            encoding="utf-8"
        )
        
        if result.returncode != 0:
            err_msg = result.stderr.strip() if result.stderr else result.stdout.strip()
            error(f"{chapter_path.name} failed schema validation:\n{err_msg}")
            all_valid = False
        else:
            ok(f"{chapter_path.name} passed schema validation")
    
    return all_valid


_SCENES_CACHE = {}


def load_all_scenes(folder_path):
    """Return [(chapter_path, scene_index, scene_dict), ...] in edit order.

    Many independent read-only checks call this for the same folder within
    one run, previously re-globbing the directory and re-parsing every
    chapter_*.json file from disk on every call. Results are memoized keyed
    on each chapter file's path + mtime + size, so identical repeated calls
    are free, but any on-disk change (e.g. a test or a re-run of a step that
    rewrites a chapter file) automatically invalidates the cache and is read
    fresh. No check mutates the returned scene dicts, so returning the same
    cached objects for an unchanged file set is behavior-identical to
    re-reading them.
    """
    chapter_paths = sorted(folder_path.glob("chapter_*.json"))
    cache_key = (
        str(folder_path),
        tuple((str(p), st.st_mtime_ns, st.st_size) for p, st in (
            (p, p.stat()) for p in chapter_paths
        )),
    )
    cached = _SCENES_CACHE.get(cache_key)
    if cached is not None:
        return cached

    rows = []
    for chapter_path in chapter_paths:
        with open(chapter_path, "r", encoding="utf-8") as f:
            scenes = json.load(f)
        for idx, scene in enumerate(scenes):
            rows.append((chapter_path, idx, scene))
    _SCENES_CACHE[cache_key] = rows
    return rows


_VISUAL_BIBLE_TEXT_CACHE = {}


def _read_visual_bible_text(folder_path):
    """Cached raw text of visual_bible.json, keyed per folder_path + mtime/size.

    Five independent deterministic checks each parse visual_bible.json.
    Caching the disk read removes redundant I/O within a single run while
    still invalidating automatically if the file changes on disk (same
    mtime/size-keyed strategy as load_all_scenes above). Every caller keeps
    its own existence check / json.loads / exception handling exactly as
    before, so error behavior is unchanged.
    """
    vb_path = folder_path / "visual_bible.json"
    st = vb_path.stat()
    cache_key = (str(vb_path), st.st_mtime_ns, st.st_size)
    cached = _VISUAL_BIBLE_TEXT_CACHE.get(cache_key)
    if cached is not None:
        return cached
    text = vb_path.read_text(encoding="utf-8")
    _VISUAL_BIBLE_TEXT_CACHE[cache_key] = text
    return text


def infer_language(folder_path, explicit_lang=None):
    """Resolve vi/en without changing any output schema.

    Priority: explicit --lang -> matching history entry -> conservative text
    heuristic. The heuristic intentionally recognizes both Vietnamese
    diacritics and common Vietnamese function words.
    """
    if explicit_lang in {"vi", "en"}:
        return explicit_lang, "--lang"

    project_root = folder_path.parent.parent.parent
    history_path = project_root / "database" / "history.json"
    if history_path.exists():
        try:
            data = json.loads(history_path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                folder_name = folder_path.name
                matches = [e for e in data if isinstance(e, dict) and e.get("folder") == folder_name]
                if matches and matches[-1].get("language") in {"vi", "en"}:
                    return matches[-1]["language"], "history.json"
        except Exception:
            pass

    script_path = folder_path / "master_script.txt"
    text = script_path.read_text(encoding="utf-8") if script_path.exists() else ""
    if re.search(r"[ăâđêôơưĂÂĐÊÔƠƯàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]", text):
        return "vi", "Vietnamese diacritics heuristic"

    words = re.findall(r"[A-Za-zÀ-ỹ]+", text.lower())
    vi_common = {"và", "là", "của", "những", "một", "không", "được", "trong", "khi", "này", "đó", "với", "cho", "từ", "đến"}
    score = sum(1 for w in words[:500] if w in vi_common)
    if score >= 3:
        return "vi", "Vietnamese common-word heuristic"
    return "en", "fallback heuristic"


def count_ws_words(text):
    return len(str(text).split())


def normalize_spoken_text(text):
    """Normalize punctuation/case while preserving word order for VO/sub QA."""
    text = str(text).casefold()
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    return " ".join(text.split())


def check_master_script_scene_coverage(folder_path):
    """Ensure the scene voiceover stream is an exact lossless split of master_script.

    This catches a subtle failure that per-scene word counts cannot: an agent
    could drop/duplicate/rewrite a whole word or scene while every individual
    scene still contains the expected number of tokens.
    """
    script_path = folder_path / "master_script.txt"
    if not script_path.exists():
        return False
    master_tokens = script_path.read_text(encoding="utf-8").split()
    scene_tokens = []
    for _, _, scene in load_all_scenes(folder_path):
        scene_tokens.extend(str(scene.get("voiceover", "")).split())
    if master_tokens == scene_tokens:
        ok(f"Scene voiceover stream exactly covers master_script.txt ({len(master_tokens)} whitespace tokens, no loss/duplication/rewrite)")
        return True

    # Locate the first divergence to make repair actionable.
    limit = min(len(master_tokens), len(scene_tokens))
    diff_at = next((i for i in range(limit) if master_tokens[i] != scene_tokens[i]), limit)
    expected = master_tokens[diff_at] if diff_at < len(master_tokens) else "<END>"
    got = scene_tokens[diff_at] if diff_at < len(scene_tokens) else "<END>"
    error(
        "Scene voiceover stream is not an exact split of master_script.txt: "
        f"master={len(master_tokens)} tokens, scenes={len(scene_tokens)} tokens; "
        f"first divergence at token {diff_at + 1}: expected '{expected}', got '{got}'"
    )
    return False


def check_word_counts_and_sub(folder_path, video_type, language):
    """Independently re-count scene words after the agent has edited scenes.

    Every non-final scene in a chapter must have exactly N whitespace tokens;
    the final scene of a chapter may have 1..N. `sub` must preserve the same
    spoken tokens as `voiceover` (punctuation/case may differ for TTS).
    """
    expected = WORDS_PER_SCENE[(video_type, language)]
    issues = []
    for chapter_path in sorted(folder_path.glob("chapter_*.json")):
        with open(chapter_path, "r", encoding="utf-8") as f:
            scenes = json.load(f)
        for idx, scene in enumerate(scenes):
            vo = scene.get("voiceover", "")
            sub = scene.get("sub", "")
            vo_count = count_ws_words(vo)
            sub_count = count_ws_words(sub)
            is_last = idx == len(scenes) - 1
            if vo_count < 1 or vo_count > expected:
                issues.append(f"{chapter_path.name} scene {scene.get('scene')}: voiceover={vo_count}, allowed 1..{expected}")
            elif not is_last and vo_count != expected:
                issues.append(f"{chapter_path.name} scene {scene.get('scene')}: non-final voiceover={vo_count}, expected exactly {expected}")
            if sub_count != vo_count:
                issues.append(f"{chapter_path.name} scene {scene.get('scene')}: sub word count {sub_count} != voiceover {vo_count}")
            if normalize_spoken_text(sub) != normalize_spoken_text(vo):
                issues.append(f"{chapter_path.name} scene {scene.get('scene')}: sub changes spoken words instead of punctuation/casing only")
    if issues:
        error(f"Word-count/subtitle integrity failed ({len(issues)} issue(s)):\n  " + "\n  ".join(issues[:10]))
        if len(issues) > 10:
            error(f"  ... and {len(issues)-10} more")
        return False
    ok(f"All voiceover/sub fields obey the {expected}-word {video_type}+{language} rule (chapter-final remainder allowed)")
    return True


def check_canonical_scene_alignment(folder_path, video_type, language):
    """Recompute splitter-owned semantic alignment and require exact equality.

    This prevents GenerateVeoPrompts or a later edit from silently changing
    context_ref/sentence_id/part after deterministic regeneration. The current
    chapter voiceover stream is safe to reuse as chapter input only after the
    separate master-script coverage check proves it is lossless.
    """
    words_per_scene = canonical_splitter.WORDS_PER_SCENE[(video_type, language)]
    next_scene = 1
    next_sentence = 1
    issues = []
    for chapter_path in sorted(folder_path.glob("chapter_*.json")):
        try:
            scenes = json.loads(chapter_path.read_text(encoding="utf-8"))
        except Exception as exc:
            error(f"Cannot load {chapter_path.name} for canonical alignment check: {exc}")
            return False
        if not isinstance(scenes, list) or not scenes:
            issues.append(f"{chapter_path.name}: expected non-empty scene array")
            continue
        chapter_text = " ".join(str(scene.get("voiceover", "")).strip() for scene in scenes)
        rebuilt, next_scene_out, next_sentence_out = canonical_splitter.build_scenes(
            chapter_text, words_per_scene, scene_start=next_scene, sentence_start=next_sentence
        )
        if len(rebuilt) != len(scenes):
            issues.append(f"{chapter_path.name}: canonical splitter yields {len(rebuilt)} scenes, file contains {len(scenes)}")
            next_scene, next_sentence = next_scene_out, next_sentence_out
            continue
        for current, expected in zip(scenes, rebuilt):
            n = current.get("scene")
            for key in ("context_ref", "sentence_id", "part"):
                if current.get(key) != expected.get(key):
                    issues.append(
                        f"{chapter_path.name} scene {n}: {key} is stale/non-canonical; "
                        f"expected {expected.get(key)!r}, got {current.get(key)!r}"
                    )
        next_scene, next_sentence = next_scene_out, next_sentence_out
    if issues:
        error("Canonical context_ref/sentence_id/part regeneration check failed:\n  " + "\n  ".join(issues[:12]))
        if len(issues) > 12:
            error(f"  ... and {len(issues)-12} more")
        return False
    ok("All context_ref/sentence_id/part fields exactly match a fresh canonical word_splitter rebuild")
    return True


def check_part_sequences(folder_path):
    """Validate semantic progression labels `part=x/N` for each sentence_id."""
    groups = {}
    issues = []
    for chapter_path, _, scene in load_all_scenes(folder_path):
        sid = scene.get("sentence_id")
        part = str(scene.get("part", ""))
        m = re.fullmatch(r"([1-9][0-9]*)/([1-9][0-9]*)", part)
        if not m:
            issues.append(f"{chapter_path.name} scene {scene.get('scene')}: invalid part '{part}'")
            continue
        x, n = int(m.group(1)), int(m.group(2))
        if x > n:
            issues.append(f"{chapter_path.name} scene {scene.get('scene')}: part '{part}' has numerator > denominator")
        groups.setdefault(sid, []).append((scene.get("scene"), x, n, chapter_path.name))

    for sid, rows in groups.items():
        denominators = {r[2] for r in rows}
        numerators = [r[1] for r in rows]
        if len(denominators) != 1:
            issues.append(f"sentence_id {sid}: inconsistent denominators {sorted(denominators)}")
            continue
        n = next(iter(denominators))
        expected = list(range(1, len(rows) + 1))
        if n != len(rows) or numerators != expected:
            issues.append(
                f"sentence_id {sid}: got parts {[f'{r[1]}/{r[2]}' for r in rows]}, "
                f"expected {[f'{i}/{len(rows)}' for i in expected]}"
            )
    if issues:
        error(f"part sequence validation failed ({len(issues)} issue(s)):\n  " + "\n  ".join(issues[:10]))
        return False
    ok("All part values are valid, sequential, and denominator-consistent per sentence_id")
    return True


def check_visual_bible_contract(folder_path, video_type):
    """Cross-file invariants that JSON Schema alone cannot express."""
    vb_path = folder_path / "visual_bible.json"
    if not vb_path.exists():
        return False
    try:
        vb = json.loads(_read_visual_bible_text(folder_path))
    except Exception as exc:
        error(f"Cannot read visual_bible.json for cross-file QA: {exc}")
        return False

    passed = True
    expected_ratio = "9:16" if video_type == "short" else "16:9"
    actual_ratio = vb.get("visual_style", {}).get("aspect_ratio")
    if actual_ratio != expected_ratio:
        error(f"visual_bible aspect_ratio='{actual_ratio}' but {video_type} requires '{expected_ratio}'")
        passed = False
    else:
        ok(f"Aspect ratio matches video type ({video_type} → {expected_ratio})")

    story_anchor = str(vb.get("story_anchor", "")).strip()
    if not story_anchor:
        error("visual_bible.story_anchor is required for every production project")
        passed = False
    else:
        ok("visual_bible.story_anchor is present")

    # Alias/name collisions make deterministic identity anchoring ambiguous.
    for bucket in ("characters", "locations", "key_objects"):
        seen = {}
        for entry in vb.get(bucket, []) or []:
            canonical = str(entry.get("name", "")).strip()
            labels = [canonical] + [str(x).strip() for x in entry.get("aliases", []) if str(x).strip()]
            for label in labels:
                key = label.casefold()
                if not key:
                    continue
                if key in seen and seen[key] != canonical:
                    error(f"visual_bible {bucket}: alias/name '{label}' is shared by '{seen[key]}' and '{canonical}'; identities must be unambiguous")
                    passed = False
                else:
                    seen[key] = canonical
    if passed:
        ok("visual_bible names/aliases are unambiguous within each entity type")

    return passed


def check_visual_bible_anchor_usage(folder_path):
    """Enforce verbatim canonical anchors whenever an entity is named.

    This deliberately only hard-fails when the prompt itself names a visual-
    bible entity; unnamed/generic references are left to semantic AI/manual QA
    to avoid false positives.
    """
    vb_path = folder_path / "visual_bible.json"
    if not vb_path.exists():
        return False
    vb = json.loads(_read_visual_bible_text(folder_path))
    entities = []
    for ch in vb.get("characters", []):
        anchors = [ch.get("appearance", "").strip(), ch.get("outfit", "").strip()]
        name=ch.get("name", "").strip(); aliases=[name]+[str(x).strip() for x in ch.get("aliases",[]) if str(x).strip()]
        entities.append(("character", name, aliases, [a for a in anchors if a and not a.startswith("N/A")]))
    for loc in vb.get("locations", []):
        name=loc.get("name", "").strip(); aliases=[name]+[str(x).strip() for x in loc.get("aliases",[]) if str(x).strip()]
        entities.append(("location", name, aliases, [loc.get("description", "").strip()]))
    for obj in vb.get("key_objects", []):
        name=obj.get("name", "").strip(); aliases=[name]+[str(x).strip() for x in obj.get("aliases",[]) if str(x).strip()]
        entities.append(("object", name, aliases, [obj.get("description", "").strip()]))

    def phrase_present(text_cf, phrase):
        phrase_cf = str(phrase or "").strip().casefold()
        if not phrase_cf:
            return False
        # Avoid substring collisions such as alias "pan" matching "panel".
        # Unicode-aware non-word boundaries still allow multi-word/punctuated aliases.
        return re.search(r"(?<!\w)" + re.escape(phrase_cf) + r"(?!\w)", text_cf, flags=re.UNICODE) is not None

    issues = []
    for chapter_path, _, scene in load_all_scenes(folder_path):
        prompt = scene.get("veo_prompt", "")
        prompt_cf = prompt.casefold()
        for kind, name, aliases, anchors in entities:
            if not any(phrase_present(prompt_cf, a) for a in aliases):
                continue
            missing = [a for a in anchors if a.casefold() not in prompt_cf]
            if missing:
                issues.append(
                    f"{chapter_path.name} scene {scene.get('scene')}: named {kind} '{name}' but omitted/paraphrased canonical anchor(s)"
                )
    if issues:
        error(f"Visual-bible canonical-anchor enforcement failed ({len(issues)} issue(s)):\n  " + "\n  ".join(issues[:10]))
        return False
    ok("Named recurring entities reuse their visual_bible canonical anchors verbatim")
    return True


def check_scene_numbers(folder_path):
    """Check scene numbers are sequential with no gaps or duplicates"""
    chapter_files = sorted(folder_path.glob("chapter_*.json"))
    
    all_scenes = []
    for chapter_path in chapter_files:
        with open(chapter_path, "r", encoding="utf-8") as f:
            scenes = json.load(f)
        
        for scene in scenes:
            all_scenes.append({
                "file": chapter_path.name,
                "scene": scene["scene"],
                "sentence_id": scene["sentence_id"]
            })
    
    if not all_scenes:
        error("No scenes found in any chapter file")
        return False
    
    # Check sequential
    scene_numbers = [s["scene"] for s in all_scenes]
    expected = list(range(1, len(scene_numbers) + 1))
    
    if scene_numbers != expected:
        error(f"Scene numbers not sequential: got {scene_numbers[:10]}... expected {expected[:10]}...")
        return False
    
    ok(f"All {len(scene_numbers)} scene numbers are sequential (1 to {len(scene_numbers)})")
    
    # A decrease is a real structural failure: it normally means a chapter
    # was split without carrying --sentence-start forward. Missing IDs can be
    # legitimate (short-sentence majority behavior), but resets cannot.
    sentence_ids = [s["sentence_id"] for s in all_scenes]
    decreases = []
    for i in range(1, len(sentence_ids)):
        if sentence_ids[i] < sentence_ids[i-1]:
            decreases.append(
                f"scene {i+1}: {sentence_ids[i-1]} -> {sentence_ids[i]}"
            )
    if decreases:
        error("sentence_id decreased/reset mid-video:\n  " + "\n  ".join(decreases[:10]))
        return False
    ok("sentence_id never decreases/resets across chapter boundaries")
    return True


def check_context_ref_leaks(folder_path):
    """Catch viewer-facing leakage/expansion of context beyond local VO.

    `sub` is expected to mirror `voiceover`; because voiceover is naturally a
    substring of context_ref, searching for the literal word "context_ref" is
    insufficient. We therefore reject subtitles that equal the full context
    when context is longer than the local beat, and metadata that reproduces
    any full context sentence.
    """
    leaks = []
    contexts = []
    for chapter_path, _, scene in load_all_scenes(folder_path):
        ctx = str(scene.get("context_ref", "")).strip()
        vo = str(scene.get("voiceover", "")).strip()
        sub = str(scene.get("sub", "")).strip()
        if ctx:
            contexts.append(ctx)
        if "context_ref" in sub.casefold():
            leaks.append(f"{chapter_path.name} scene {scene.get('scene')}: literal field name leaked into sub")
        if normalize_spoken_text(ctx) != normalize_spoken_text(vo) and normalize_spoken_text(sub) == normalize_spoken_text(ctx):
            leaks.append(f"{chapter_path.name} scene {scene.get('scene')}: sub expanded from local voiceover to full context_ref")

    metadata_path = folder_path / "metadata.json"
    if metadata_path.exists():
        metadata_text = metadata_path.read_text(encoding="utf-8").casefold()
        if "context_ref" in metadata_text:
            leaks.append("metadata.json contains literal 'context_ref'")
        for ctx in contexts:
            if len(ctx) >= 40 and ctx.casefold() in metadata_text:
                leaks.append("metadata.json reproduces a full context_ref passage")
                break

    if leaks:
        error(f"context_ref leakage detected ({len(leaks)} issue(s)):\n  " + "\n  ".join(leaks[:10]))
        return False
    ok("No context_ref leakage/expansion detected in viewer-facing fields")
    return True


def check_negative_keywords(folder_path):
    """Require the complete visual_bible negative list in every prompt."""
    try:
        vb = json.loads(_read_visual_bible_text(folder_path))
        required = [str(x).strip() for x in vb.get("negative_keywords", []) if str(x).strip()]
    except Exception as exc:
        error(f"Cannot load visual_bible negative_keywords: {exc}")
        return False
    if not required:
        error("visual_bible.negative_keywords is empty")
        return False

    required_cf = {x.casefold() for x in required}
    missing_safety_in_bible = [x for x in MANDATORY_SAFETY_NEGATIVES if x.casefold() not in required_cf]
    if missing_safety_in_bible:
        error("visual_bible.negative_keywords is missing mandatory policy-safety negatives: " + ", ".join(missing_safety_in_bible))
        return False

    issues = []
    for chapter_path, _, scene in load_all_scenes(folder_path):
        prompt = scene.get("veo_prompt", "")
        m = re.search(r"\bnegative\s*:\s*(.*)$", prompt, flags=re.IGNORECASE | re.DOTALL)
        if not m:
            issues.append(f"{chapter_path.name} scene {scene.get('scene')}: missing 'Negative:' clause")
            continue
        clause = m.group(1).casefold()
        missing = [kw for kw in required if kw.casefold() not in clause]
        if missing:
            preview = ", ".join(missing[:4])
            issues.append(f"{chapter_path.name} scene {scene.get('scene')}: missing visual_bible negatives [{preview}]")
        if NO_INTERNAL_EDIT_NEGATIVE.casefold() not in clause:
            issues.append(f"{chapter_path.name} scene {scene.get('scene')}: missing exact no-internal-edit Negative lock")
    if issues:
        error(f"Negative-clause enforcement failed ({len(issues)} issue(s)):\n  " + "\n  ".join(issues[:10]))
        if len(issues) > 10:
            error(f"  ... and {len(issues)-10} more")
        return False
    ok("Every veo_prompt includes the complete visual_bible negative list, mandatory safety negatives, and exact no-internal-edit lock")
    return True


def check_veo_prompt_length(folder_path):
    """Hard fail outside the project production range 900..4000 chars."""
    chapter_files = sorted(folder_path.glob("chapter_*.json"))
    offenders = []
    shortest = (None, 10**9)
    longest = (None, 0)

    for chapter_path in chapter_files:
        with open(chapter_path, "r", encoding="utf-8") as f:
            scenes = json.load(f)
        for scene in scenes:
            veo_prompt = scene.get("veo_prompt", "")
            n = len(veo_prompt)
            if n < shortest[1]:
                shortest = (f"{chapter_path.name} scene {scene['scene']}", n)
            if n > longest[1]:
                longest = (f"{chapter_path.name} scene {scene['scene']}", n)
            if n < VEO_PROMPT_MIN_CHARS or n > VEO_PROMPT_MAX_CHARS:
                offenders.append(f"{chapter_path.name} scene {scene['scene']}: {n} chars")

    if offenders:
        error(
            f"{len(offenders)} veo_prompts fall outside the project production range "
            f"{VEO_PROMPT_MIN_CHARS}-{VEO_PROMPT_MAX_CHARS} characters:\n  "
            + "\n  ".join(offenders[:8])
        )
        if len(offenders) > 8:
            error(f"  ... and {len(offenders) - 8} more")
        return False

    if longest[0]:
        ok(
            f"All veo_prompts are {VEO_PROMPT_MIN_CHARS}-{VEO_PROMPT_MAX_CHARS} characters "
            f"(shortest: {shortest[0]} = {shortest[1]}; longest: {longest[0]} = {longest[1]})"
        )
    return True


def _positive_prompt_text(prompt):
    return re.split(r"\bnegative\s*:", prompt, maxsplit=1, flags=re.IGNORECASE)[0]


def check_prompt_craft_contract(folder_path):
    """Hard production-detail contract that prevents late-job lazy prompts.

    Semantic correctness still belongs to scene_semantic_checker.py; this gate
    ensures every independently generated clip gets enough concrete direction
    to look like the same film rather than a generic moving still.
    """
    try:
        vb = json.loads(_read_visual_bible_text(folder_path))
    except Exception as exc:
        error(f"Cannot load visual_bible for prompt craft QA: {exc}")
        return False

    film_look = str(vb.get("visual_style", {}).get("film_look", "")).strip()
    if not film_look:
        error("visual_bible.visual_style.film_look is empty")
        return False

    entities = []
    for ch in vb.get("characters", []):
        for key in ("appearance", "outfit"):
            a = str(ch.get(key, "")).strip()
            if a and not a.startswith("N/A"):
                entities.append((f"character {ch.get('name','')} {key}", a))
    for loc in vb.get("locations", []):
        a = str(loc.get("description", "")).strip()
        if a:
            entities.append((f"location {loc.get('name','')}", a))
    for obj in vb.get("key_objects", []):
        a = str(obj.get("description", "")).strip()
        if a:
            entities.append((f"object {obj.get('name','')}", a))

    lens_re = re.compile(r"\b\d{2,3}\s*mm\b|\bmacro lens\b", re.I)
    camera_re = re.compile(r"\b(camera|dolly|tracking|track|pan|tilt|crane|arc|handheld|steadicam|gimbal|drone|aerial|locked[- ]off|static shot|push[- ]in|pull[- ]back|orbit|POV)\b", re.I)
    light_re = re.compile(r"\b(light|lighting|illuminat(?:ed|ion)|glow(?:ing)?|shadow|backlit|backlight|rim light|sunlit|moonlit|volumetric|golden hour|blue hour|dusk|dawn|practical light|lens flare)\b", re.I)
    focus_re = re.compile(r"\b(depth of field|deep focus|shallow focus|shallow depth|rack focus|bokeh|sharp focus|soft background)\b", re.I)
    micro_motion_re = re.compile(r"\b(gradually|continuously|throughout|drift(?:s|ing)?|flow(?:s|ing)?|rotat(?:e|es|ing)|move(?:s|ment|ing)?|advance(?:s|d|ing)?|settle(?:s|d|ing)?|flicker(?:s|ing)?|ripple(?:s|ing)?|oscillat(?:e|es|ing)|breath(?:e|es|ing)|changes? intensity|travels? across|slides? across|blink(?:s|ing)?|puls(?:e|es|ing)|sway(?:s|ing)?|turn(?:s|ing)?|adjust(?:s|ing)?|shift(?:s|ing)?|sweep(?:s|ing)?|condens(?:e|es|ing)|evaporat(?:e|es|ing)|melt(?:s|ing)?|fractur(?:e|es|ing)|elongat(?:e|es|ing)|expand(?:s|ing)?|contract(?:s|ing)?|accumulat(?:e|es|ing)|spread(?:s|ing)?)\b", re.I)
    end_state_re = re.compile(r"\b(the shot ends|shot ends|ends with|end[- ]frame|final frame|by the end of the shot|at the end of the take)\b", re.I)

    issues = []
    text_warnings = []
    for chapter_path, _, scene in load_all_scenes(folder_path):
        prompt = str(scene.get("veo_prompt", ""))
        positive = _positive_prompt_text(prompt)
        pf = prompt.casefold()
        posf = positive.casefold()
        scene_label = f"{chapter_path.name} scene {scene.get('scene')}"

        if not prompt.startswith(SINGLE_TAKE_ANCHOR):
            issues.append(f"{scene_label}: veo_prompt must START with the exact single-take anchor")
        elif positive.count(SINGLE_TAKE_ANCHOR) != 1:
            issues.append(f"{scene_label}: single-take anchor must appear exactly once in positive direction")

        count = pf.count(film_look.casefold())
        if count != 1:
            issues.append(f"{scene_label}: visual_style.film_look must appear verbatim exactly once (found {count})")
        if not lens_re.search(positive):
            issues.append(f"{scene_label}: missing concrete focal length or macro lens")
        if not camera_re.search(positive):
            issues.append(f"{scene_label}: missing explicit camera/framing/movement direction")
        if not light_re.search(positive):
            issues.append(f"{scene_label}: missing motivated lighting/illumination detail")
        if not focus_re.search(positive):
            issues.append(f"{scene_label}: missing focus/depth-of-field strategy")
        if not micro_motion_re.search(positive):
            issues.append(f"{scene_label}: missing scene-relevant micro-action/temporal behavior; risk of a moving still")
        if not end_state_re.search(positive):
            issues.append(f"{scene_label}: missing explicit end-frame state for cross-scene continuity")

        for label, anchor in entities:
            c = pf.count(anchor.casefold())
            if c > 1:
                issues.append(f"{scene_label}: canonical {label} anchor duplicated {c} times in one prompt")

        # Exact readable text is better added in post; scan only positive prompt
        # so required Negative terms like 'text overlay' do not trigger this.
        if re.search(r"\b(text reads|screen reads|display(?:s|ing)? the text|readable text|caption says|label(?:ed|led) as|exact formula|equation written|subtitle says|ticker reads)\b", posf):
            text_warnings.append(f"{scene_label}: requests generated readable text/formula; prefer unlabeled visual + post typography")

    if issues:
        error(f"Prompt craft contract failed ({len(issues)} issue(s)):\n  " + "\n  ".join(issues[:12]))
        if len(issues) > 12:
            error(f"  ... and {len(issues)-12} more")
        passed = False
    else:
        ok("Every veo_prompt carries the canonical film look exactly once plus lens, camera, lighting, focus, micro-action and end-frame direction; no canonical anchors are duplicated")
        passed = True

    if text_warnings:
        warn(f"{len(text_warnings)} prompt(s) request readable generated text/formulas:\n  " + "\n  ".join(text_warnings[:8]))
    return passed



def check_positive_visual_richness(folder_path):
    """Negative boilerplate must not be used to satisfy prompt-detail minimums."""
    issues=[]
    for chapter_path,_,scene in load_all_scenes(folder_path):
        prompt=str(scene.get("veo_prompt", ""))
        positive=_positive_prompt_text(prompt).strip()
        if len(positive) < VEO_POSITIVE_MIN_CHARS:
            issues.append(f"{chapter_path.name} scene {scene.get('scene')}: positive visual body={len(positive)} chars, require >= {VEO_POSITIVE_MIN_CHARS} before Negative")
    if issues:
        error(f"Positive-prompt richness failed ({len(issues)} issue(s)):\n  "+"\n  ".join(issues[:12]))
        return False
    ok(f"Every veo_prompt has >= {VEO_POSITIVE_MIN_CHARS} characters of positive visual direction before Negative")
    return True


def check_visual_domain_and_camera_physics(folder_path):
    """Catch impossible camera scale and hidden real-world→diagram/domain transformations."""
    domain_patterns=[
        (re.compile(r"\b(drone|aerial|helicopter|real[- ]world|landscape|laboratory|room)\b.{0,180}\b(moving|moves|travel(?:s|ing)?|dives?|enters?|passes?|push(?:es|ing)?|glides?)\b.{0,120}\b(cross[- ]section|cutaway|microscopic|molecular|x[- ]ray|schematic|diagram|simulation)\b",re.I),"physical camera implicitly changes into a scientific/diagram domain"),
        (re.compile(r"\b(cross[- ]section|microscopic|molecular|schematic|diagram|simulation)\b.{0,180}\b(becomes?|transforms?|morphs?|opens? into|switches? to)\b.{0,120}\b(real[- ]world|landscape|laboratory|room|aerial|drone)\b",re.I),"scientific/diagram domain implicitly transforms into a physical scene"),
    ]
    physics_patterns=[
        (re.compile(r"\bcrane(?: shot)?\b.{0,180}\b(thousands? of (?:meters|metres)|kilometers?|kilometres?|\d+\s*km|stratospher|orbit|twenty kilometers?)\b",re.I),"crane travel exceeds physically plausible crane scale"),
        (re.compile(r"\bdolly(?:[- ]?(?:in|out))?\b.{0,180}\b(kilometers?|kilometres?|\d+\s*km|through (?:the )?(?:crust|planet|mantle)|stratospher|orbit)\b",re.I),"dolly movement is assigned an impossible geographic/geologic scale"),
        (re.compile(r"\bdrone\b.{0,180}\b(inside (?:the )?(?:crust|mantle|cell|molecule)|cross[- ]section|microscopic|molecular interior)\b",re.I),"drone is used inside an inaccessible scientific/internal domain"),
    ]
    issues=[]
    for chapter_path,_,scene in load_all_scenes(folder_path):
        pos=_positive_prompt_text(str(scene.get('veo_prompt','')))
        label=f"{chapter_path.name} scene {scene.get('scene')}"
        for rx,msg in domain_patterns+physics_patterns:
            if rx.search(pos): issues.append(f"{label}: {msg}"); break
    if issues:
        error(f"Visual-domain/camera-physics gate failed ({len(issues)} issue(s)):\n  "+"\n  ".join(issues[:12]))
        return False
    ok("No obvious hidden visual-domain transformations or impossible camera-scale instructions detected")
    return True


def check_positive_negative_conflicts(folder_path):
    """Block self-contradictory prompts and exact typography/logo generation."""
    conflicts=[]
    exact_text=re.compile(r"\b(text reads|screen reads|display(?:s|ing)? (?:the )?text|readable text|caption says|label(?:ed|led) as|exact formula|equation written|ticker reads|engraved (?:text|lettering|words)|lettering (?:reading|saying)|plaque (?:reads|reading)|certificate (?:reads|showing)|official logo|brand logo|heritage emblem|official emblem)\b",re.I)
    for chapter_path,_,scene in load_all_scenes(folder_path):
        prompt=str(scene.get('veo_prompt','')); pos=_positive_prompt_text(prompt); posf=pos.casefold()
        neg=(re.split(r"\bnegative\s*:\s*",prompt,maxsplit=1,flags=re.I)[1] if re.search(r"\bnegative\s*:",prompt,re.I) else '').casefold()
        label=f"{chapter_path.name} scene {scene.get('scene')}"
        if exact_text.search(pos): conflicts.append(f"{label}: asks Veo to render exact readable typography/logo/emblem; use unlabeled geometry and add exact graphic in post")
        if ('logo' in neg) and re.search(r"\b(logo|emblem)\b",posf): conflicts.append(f"{label}: positive requests logo/emblem while Negative forbids logo")
        if any(x in neg for x in ['text overlay','burned-in subtitles']) and re.search(r"\b(readable text|lettering|caption|subtitle|ticker|plaque reads|certificate reads)\b",posf): conflicts.append(f"{label}: positive requests readable text while Negative forbids generated text overlays")
    if conflicts:
        error(f"Positive/Negative conflict + generated-typography gate failed ({len(conflicts)} issue(s)):\n  "+"\n  ".join(conflicts[:12]))
        return False
    ok("No positive↔Negative contradictions or exact generated typography/logo requests detected")
    return True


def check_continuity_handoff_format(folder_path):
    """For scene>1, continuity_ref must separate previous visible state from current opening state."""
    issues=[]
    for chapter_path,_,scene in load_all_scenes(folder_path):
        n=scene.get('scene'); ref=str(scene.get('continuity_ref','')).strip()
        if n==1: continue
        rf=ref.casefold()
        if 'previous end:' not in rf or 'current opening:' not in rf or 'editorial relationship:' not in rf:
            issues.append(f"{chapter_path.name} scene {n}: continuity_ref must contain 'Previous end:', 'Current opening:', and 'Editorial relationship:'")
        elif not re.search(r"editorial relationship:\s*(continuous action|matched conceptual cut|intentional location/time shift)\.?", rf):
            issues.append(f"{chapter_path.name} scene {n}: Editorial relationship must be continuous action | matched conceptual cut | intentional location/time shift")
        if re.search(r"\b(transitioning to|moving into|morphing into|becoming|then shows?|next shows?)\b",rf):
            issues.append(f"{chapter_path.name} scene {n}: continuity_ref uses transformation/future-planning wording; state two endpoints instead")
    if issues:
        error(f"Structured continuity handoff failed ({len(issues)} issue(s)):\n  "+"\n  ".join(issues[:12]))
        return False
    ok("continuity_ref cleanly separates Previous end, Current opening, and a valid Editorial relationship for every non-opening scene")
    return True


def check_exact_prompt_duplicates(folder_path):
    """Hard fail exact prompt reuse across different scenes."""
    seen = {}
    dupes = []
    for chapter_path, _, scene in load_all_scenes(folder_path):
        prompt = re.sub(r"\s+", " ", str(scene.get("veo_prompt", "")).strip().casefold())
        if not prompt:
            continue
        label = f"{chapter_path.name} scene {scene.get('scene')}"
        if prompt in seen:
            dupes.append(f"{seen[prompt]} == {label}")
        else:
            seen[prompt] = label
    if dupes:
        error(f"Exact veo_prompt reuse detected ({len(dupes)} duplicate(s)); every narration beat requires its own visual brief:\n  " + "\n  ".join(dupes[:10]))
        return False
    ok("No exact veo_prompt is reused across different scenes")
    return True


def check_prompt_repetition_and_handoff(folder_path):
    """Warning-only heuristics for two common quality failures:

    1) consecutive prompts are near-duplicates (often the same generic visual
       repeated across `part` values), and
    2) continuity_ref is technically non-empty but too vague to preserve a
       meaningful visual/editorial handoff.

    This intentionally does not block completion because semantic equivalence
    and multilingual narration require human judgment.
    """
    chapter_files = sorted(folder_path.glob("chapter_*.json"))
    all_scenes = []
    vague_refs = []

    for chapter_path in chapter_files:
        with open(chapter_path, "r", encoding="utf-8") as f:
            scenes = json.load(f)
        for scene in scenes:
            all_scenes.append((chapter_path.name, scene))
            ref = scene.get("continuity_ref", "").strip()
            if scene.get("scene") != 1 and ref.lower() != "opening" and len(ref) < 24:
                vague_refs.append(
                    f"{chapter_path.name} scene {scene.get('scene')}: '{ref}'"
                )

    near_dupes = []
    for i in range(1, len(all_scenes)):
        prev_file, prev = all_scenes[i - 1]
        cur_file, cur = all_scenes[i]
        a = re.sub(r"\s+", " ", prev.get("veo_prompt", "").lower()).strip()
        b = re.sub(r"\s+", " ", cur.get("veo_prompt", "").lower()).strip()
        if not a or not b:
            continue
        ratio = difflib.SequenceMatcher(None, a, b).ratio()
        # Higher sensitivity when both clips belong to the same source sentence,
        # because parts should progress visually instead of repeating a frame.
        threshold = 0.86 if prev.get("sentence_id") == cur.get("sentence_id") else 0.93
        if ratio >= threshold:
            near_dupes.append(
                f"scenes {prev.get('scene')}-{cur.get('scene')} ({ratio:.0%} similar)"
            )

    if near_dupes:
        warn(
            f"{len(near_dupes)} consecutive veo_prompt pair(s) are near-duplicates; "
            "review scene-to-voiceover/part progression:\n  "
            + "\n  ".join(near_dupes[:8])
        )
    else:
        ok("No suspicious near-duplicate consecutive veo_prompts detected")

    if vague_refs:
        warn(
            f"{len(vague_refs)} continuity_ref value(s) are very short and may be too vague "
            "for professional handoff:\n  " + "\n  ".join(vague_refs[:8])
        )
    else:
        ok("continuity_ref values are non-trivially descriptive (heuristic)")

    return True


def check_continuity_ref(folder_path):
    """Check continuity_ref constraints"""
    chapter_files = sorted(folder_path.glob("chapter_*.json"))
    
    issues = []
    for idx, chapter_path in enumerate(chapter_files):
        with open(chapter_path, "r", encoding="utf-8") as f:
            scenes = json.load(f)
        
        for scene_idx, scene in enumerate(scenes):
            continuity_ref = scene.get("continuity_ref", "").strip().lower()
            
            # First scene of first chapter should be "opening"
            if idx == 0 and scene_idx == 0:
                if continuity_ref != "opening":
                    warn(f"{chapter_path.name} scene 1: expected continuity_ref='opening', got '{continuity_ref}'")
            
            # First scene of subsequent chapters should NOT be "opening"
            elif scene_idx == 0 and idx > 0:
                if continuity_ref == "opening":
                    error(f"{chapter_path.name} scene 1: continuity_ref should NOT be 'opening' for chapter 2+")
                    issues.append(chapter_path.name)
            
            # All other scenes should have non-empty continuity_ref
            else:
                if not continuity_ref or continuity_ref == "opening":
                    error(f"{chapter_path.name} scene {scene['scene']}: continuity_ref is empty or invalid")
                    issues.append(f"{chapter_path.name} scene {scene['scene']}")
    
    if not issues:
        ok("All continuity_ref constraints satisfied")
    
    return len(issues) == 0


def check_no_internal_transitions(folder_path):
    """Hard block cuts/fades/morphs/montages/time/location/setup changes inside one generated clip."""
    offenders = []
    for chapter_path, _, scene in load_all_scenes(folder_path):
        prompt = str(scene.get("veo_prompt", ""))
        positive = _positive_prompt_text(prompt)
        posf = positive.casefold()
        hit = None
        for phrase in TRANSITION_PHRASES:
            if phrase in posf:
                hit = phrase
                break
        if hit is None:
            for pattern in TRANSITION_REGEXES:
                if re.search(pattern, positive, flags=re.I | re.S):
                    hit = pattern
                    break
        if hit is not None:
            offenders.append(f"{chapter_path.name} scene {scene['scene']}: positive direction contains internal edit/sequencing language '{hit}'")

    if offenders:
        error(f"{len(offenders)} veo_prompts violate the no-internal-transition contract:\n  " + "\n  ".join(offenders[:8]))
        if len(offenders) > 8:
            error(f"  ... and {len(offenders) - 8} more")
        return False
    ok("Every veo_prompt remains one uninterrupted visual setup with no internal cut/fade/dissolve/morph/montage/time-or-location jump language")
    return True


def check_named_subject_and_count_lock(folder_path):
    """Catch obvious scene↔voiceover subject swaps and unreliable exact-count requests."""
    issues = []
    try:
        vb = json.loads(_read_visual_bible_text(folder_path))
        subject_alias_map = entity_alias_map_from_visual_bible(vb)
    except Exception:
        subject_alias_map = {}
    for chapter_path, _, scene in load_all_scenes(folder_path):
        label = f"{chapter_path.name} scene {scene.get('scene')}"
        for msg in deterministic_subject_issues(scene, subject_alias_map):
            issues.append(f"{label}: {msg}")
        for msg in unreliable_exact_count_issues(scene):
            issues.append(f"{label}: {msg}")
    if issues:
        error(f"Named-subject/exact-count lock failed ({len(issues)} issue(s)):\n  " + "\n  ".join(issues[:12]))
        if len(issues) > 12:
            error(f"  ... and {len(issues)-12} more")
        return False
    ok("No obvious named-subject swaps and no large exact-count rendering requests detected")
    return True


def check_semantic_receipt_coverage(folder_path):
    """Require a hash-matching semantic PASS receipt for every deterministic micro-batch."""
    progress_path = runtime_file(folder_path, "_veo_progress", scoped_only=True)
    if not progress_path.exists():
        error("Semantic hard-chain missing: deterministic Veo progress checkpoint not found")
        return False
    try:
        progress = json.loads(progress_path.read_text(encoding="utf-8"))
    except Exception as exc:
        error(f"Cannot load Veo progress checkpoint: {exc}")
        return False
    rows = load_all_scenes(folder_path)
    by_num = {scene.get("scene"): scene for _, _, scene in rows}
    master_path = folder_path / "master_script.txt"
    vb_path = folder_path / "visual_bible.json"
    issues = []
    batches = sorted(progress.get("batches", []), key=lambda b: (int(b.get("start", 0)), int(b.get("end", 0))))
    if not batches:
        error("Semantic hard-chain missing: no deterministic micro-batch records exist")
        return False
    covered = set()
    for batch in batches:
        try:
            s, e = int(batch.get("start")), int(batch.get("end"))
        except Exception:
            issues.append("invalid batch range in progress checkpoint")
            continue
        scenes = [by_num.get(n) for n in range(s, e + 1)]
        if any(x is None for x in scenes):
            issues.append(f"batch {s}-{e}: scene data missing")
            continue
        rec = matching_receipt(folder_path, s, e, scenes, master_path, vb_path)
        if rec is None:
            issues.append(f"batch {s}-{e}: semantic PASS receipt missing or stale after source/prompt change")
        else:
            covered.update(range(s, e + 1))
    all_scene_nums = set(by_num)
    missing = sorted(all_scene_nums - covered)
    if missing:
        issues.append(f"semantic receipt coverage missing scenes: {missing[:20]}" + ("..." if len(missing) > 20 else ""))
    if issues:
        error(f"Semantic receipt hard-chain failed ({len(issues)} issue(s)):\n  " + "\n  ".join(issues[:12]))
        return False
    ok("Every scene is covered by a hash-matching AI semantic PASS receipt; skipped/stale semantic QA is impossible to treat as final PASS")
    return True


def check_veo_prompt_language(folder_path):
    """Deterministic English-language contract heuristic.

    This is intentionally stricter than a Vietnamese-diacritic scan: it checks
    the positive visual body for a minimum amount of ordinary English grammar
    and cinematic vocabulary, while still allowing scientific proper nouns.
    Semantic QA remains the final language/meaning backstop.
    """
    VI_DIACRITICS = re.compile(
        r"[ăâđêôơưĂÂĐÊÔƠƯ"
        r"àáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ"
        r"ÀÁẠẢÃẰẮẶẲẴẦẤẬẨẪÈÉẸẺẼỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕỒỐỘỔỖỜỚỢỞỠÙÚỤỦŨỪỨỰỬỮỲÝỴỶỸ]"
    )
    english_function = {
        "the","a","an","and","or","with","while","from","into","of","in","on","at","to","for","by","as",
        "is","are","remains","remain","through","across","under","over","behind","between","this","that","its",
        "camera","shot","lens","light","lighting","focus","frame","subject","scene","realistic","slow","controlled",
    }
    foreign_markers = {
        "mot","canh","quay","trong","voi","duoc","khong","va","cua",       # Vietnamese without diacritics
        "una","escena","camara","mientras","con","para","desde",              # Spanish
        "une","scene","camera","avec","pendant","dans","pour",                 # French
        "eine","szene","kamera","wahrend","mit","fur","der","die","das", # German translit
    }
    offenders = []
    for chapter_path, _, scene in load_all_scenes(folder_path):
        prompt = str(scene.get("veo_prompt", ""))
        positive = _positive_prompt_text(prompt)
        label = f"{chapter_path.name} scene {scene.get('scene')}"
        reasons = []
        if VI_DIACRITICS.search(positive):
            reasons.append("Vietnamese diacritics detected")
        # Ignore the mandatory English anchor when estimating body language.
        body = positive[len(SINGLE_TAKE_ANCHOR):] if positive.startswith(SINGLE_TAKE_ANCHOR) else positive
        tokens = re.findall(r"[A-Za-z]+", body.casefold())
        if len(tokens) < 40:
            reasons.append("too little alphabetic positive-body text for reliable English validation")
        else:
            common_hits = sum(1 for t in tokens if t in english_function)
            distinct_hits = len({t for t in tokens if t in english_function})
            foreign_hits = sum(1 for t in tokens if t in foreign_markers)
            if common_hits < 10 or distinct_hits < 6 or (common_hits / max(len(tokens), 1)) < 0.065:
                reasons.append(f"insufficient English grammar/cinematic signal ({common_hits}/{len(tokens)} common-word hits, {distinct_hits} distinct)")
            if foreign_hits >= 4 and foreign_hits > common_hits / 2:
                reasons.append(f"strong non-English function-word signal ({foreign_hits} hits)")
        if reasons:
            offenders.append(label + ": " + "; ".join(reasons))
    if offenders:
        error(f"English-language veo_prompt contract failed ({len(offenders)} scene(s)):\n  " + "\n  ".join(offenders[:8]))
        return False
    ok("All veo_prompts pass the deterministic English-language contract heuristic")
    return True

def check_no_audio_mention(folder_path):
    """Hard visual-only contract: no audio/sound/dialogue wording anywhere."""
    audio_patterns = [
        r"\baudio\b", r"\bsound(?:track|scape|s| effect| effects)?\b", r"\bdialogue\b",
        r"\bvoice(?:over)?\b", r"\bnarrat(?:or|ion|es?)\b", r"\bmusic\b", r"\bsfx\b",
        r"\bsilent(?:ly)?\b", r"\baudible\b", r"\blip[- ]?sync\b",
        r"\bspeak(?:s|ing)?\b", r"\bsays\b", r"\bwhisper(?:s|ing)?\b",
        r"\bshout(?:s|ing)?\b", r"\bscream(?:s|ing)?\b", r"\bsing(?:s|ing)?\b",
    ]
    offenders = []
    for chapter_path, _, scene in load_all_scenes(folder_path):
        prompt = str(scene.get("veo_prompt", ""))
        for pattern in audio_patterns:
            if re.search(pattern, prompt, flags=re.I):
                offenders.append(f"{chapter_path.name} scene {scene.get('scene')}: matches {pattern}")
                break
    if offenders:
        error(f"{len(offenders)} veo_prompt(s) contain forbidden audio/sound/dialogue wording; this pipeline is visual-only:\n  " + "\n  ".join(offenders[:10]))
        if len(offenders) > 10:
            error(f"  ... and {len(offenders)-10} more")
        return False
    ok("No veo_prompt contains audio, sound, dialogue, narration, music, silence, or speech wording")
    return True


def check_policy_risk_keywords(folder_path):
    """Coarse heuristic scan for obvious VEO 3.1 / Flow content-policy risk
    wording (see 12_veo_policy_compliance.md). Non-exhaustive — flags
    obvious cases for human review, does not replace manual judgment."""
    chapter_files = sorted(folder_path.glob("chapter_*.json"))

    flagged = []
    missing_safety_negative = []
    for chapter_path in chapter_files:
        with open(chapter_path, "r", encoding="utf-8") as f:
            scenes = json.load(f)

        for scene in scenes:
            veo_prompt = scene.get("veo_prompt", "").lower()
            for kw in POLICY_RISK_KEYWORDS:
                # Skip matches that are actually part of a "no <keyword>"
                # negative-keyword declaration (e.g. "no gore") to reduce
                # false positives from the safety negative list itself.
                if re.search(rf"\bno\s+{re.escape(kw)}", veo_prompt):
                    continue
                if kw in veo_prompt:
                    flagged.append(f"{chapter_path.name} scene {scene['scene']}: contains '{kw}'")
                    break

            if "negative:" in veo_prompt or "negative keywords" in veo_prompt:
                if not any(hint in veo_prompt for hint in POLICY_SAFETY_NEGATIVE_HINTS):
                    missing_safety_negative.append(f"{chapter_path.name} scene {scene['scene']}")

    # Warning-only: this is a coarse heuristic (simple keyword match) that
    # can false-positive (e.g. a legitimate "no gore" negative keyword
    # itself contains "gore"). It never blocks completion on its own —
    # 07_qa_checklist.md §E still requires a manual read-through.
    if flagged:
        warn(f"{len(flagged)} veo_prompts contain possible policy-risk wording — review against "
             f"12_veo_policy_compliance.md:\n  " + "\n  ".join(flagged[:5]))
        if len(flagged) > 5:
            warn(f"  ... and {len(flagged) - 5} more")
    else:
        ok("No obvious policy-risk keywords found (heuristic scan only)")

    if missing_safety_negative:
        warn(f"{len(missing_safety_negative)} veo_prompts appear to be missing the policy-safety "
             f"negative keywords from 12_veo_policy_compliance.md §4:\n  " +
             "\n  ".join(missing_safety_negative[:5]))
        if len(missing_safety_negative) > 5:
            warn(f"  ... and {len(missing_safety_negative) - 5} more")
    else:
        ok("All veo_prompts include at least one policy-safety negative keyword")

    return True  # warning only, doesn't affect pass/fail


def check_shot_type_variety(folder_path):
    """Warn if two consecutive scenes have identical shot_type (stylistic check)"""
    chapter_files = sorted(folder_path.glob("chapter_*.json"))
    
    all_shot_types = []
    for chapter_path in chapter_files:
        with open(chapter_path, "r", encoding="utf-8") as f:
            scenes = json.load(f)
        
        for scene in scenes:
            all_shot_types.append({
                "scene": scene["scene"],
                "shot_type": scene.get("shot_type", "")
            })
    
    repeats = []
    for i in range(1, len(all_shot_types)):
        if all_shot_types[i]["shot_type"] == all_shot_types[i-1]["shot_type"]:
            repeats.append(f"scenes {all_shot_types[i-1]['scene']}-{all_shot_types[i]['scene']}")
    
    if repeats:
        warn(f"{len(repeats)} pairs of consecutive scenes have identical shot_type (consider varying): " +
             ", ".join(repeats[:3]))
        if len(repeats) > 3:
            warn(f"  ... and {len(repeats) - 3} more")
    else:
        ok("Good shot_type variety (no consecutive duplicates)")
    
    return True  # Warning only, not a failure



def infer_mode(folder_path, explicit_mode=None):
    if explicit_mode in {"1", "2"}:
        return explicit_mode, "--mode"
    project_root = folder_path.parent.parent.parent
    history = project_root / "database" / "history.json"
    if history.exists():
        try:
            data = json.loads(history.read_text(encoding="utf-8"))
            if isinstance(data, list):
                matches = [e for e in data if isinstance(e, dict) and e.get("folder") == folder_path.name]
                if matches and str(matches[-1].get("mode", "")) in {"1", "2"}:
                    return str(matches[-1]["mode"]), "history.json"
        except Exception:
            pass
    q = project_root / "queue.json"
    if q.exists():
        try:
            raw = json.loads(q.read_text(encoding="utf-8"))
            candidates = raw if isinstance(raw, list) else [raw]
            for item in reversed(candidates):
                if isinstance(item, dict) and str(item.get("mode", "")) in {"1", "2"}:
                    return str(item["mode"]), "queue.json"
        except Exception:
            pass
    return None, "unknown"

def check_runtime_editorial_semantic(folder_path, agents_path, video_type, language, mode):
    """Validate hash-bound editorial proof, including archived proof after cleanup."""
    if language not in {"vi", "en"} or mode not in {"1", "2"}:
        error("Cannot validate editorial semantic receipt without resolved language and mode")
        return False
    lock = runtime_file(folder_path, "_editorial_message_lock")
    receipt = runtime_file(folder_path, "_editorial_semantic_receipt")
    script = folder_path / "master_script.txt"

    if not lock.exists():
        error("Missing runtime Editorial Message Lock through initial final QA")
        return False
    if not receipt.exists():
        error("Missing _editorial_semantic_receipt.json; run independent editorial semantic QA after the deterministic post-script gate")
        return False
    cmd = [
        sys.executable, str(agents_path / "tools" / "editorial_semantic_checker.py"),
        "--lock", str(lock), "--script", str(script),
        "--video-type", video_type, "--language", language, "--mode", mode,
        "--require-receipt", str(receipt),
    ]
    run = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if run.returncode != 0:
        error("Editorial semantic receipt failed:\n" + (run.stderr or run.stdout))
        return False
    ok("Independent editorial semantic receipt is hash-current and meets the current production thresholds")
    return True


def check_runtime_claim_evidence(folder_path, agents_path, mode):
    """Validate the runtime Claim Evidence Lock through final QA.

    Mode 2 always requires the ledger. Mode 1 requires it whenever the script
    contains conservative high-risk factual cues (exact numbers/dates,
    institutional attribution, causal or absence claims).
    """
    if mode is None:
        error("Cannot verify Claim Evidence Lock without mode 1|2.")
        return False
    project_root = folder_path.parent.parent.parent
    ledger = runtime_file(folder_path, "_claim_evidence")
    script_path = folder_path / "master_script.txt"
    script = script_path.read_text(encoding="utf-8") if script_path.exists() else ""
    high_risk_cue = re.compile(
        r"\b(?:\d+(?:[.,]\d+)?\s*(?:%|km|kilometers?|m|meters?|kg|°\s*[cf]|years?|năm|million|billion|trillion|triệu|tỷ)|"
        r"(?:1[5-9]\d{2}|20\d{2}|2100)|NASA|ESA|UNESCO|IUGS|CERN|university|institute|observatory|agency|"
        r"no evidence|no anomaly|không có bằng chứng|chưa có bằng chứng|không phát hiện|"
        r"causes?|because|leads? to|results? in|gây ra|khiến|dẫn đến|bởi vì)\b",
        re.I,
    )
    must_have = mode == "2" or bool(high_risk_cue.search(script))
    if not ledger.exists():
        if must_have:
            error(f"mode={mode} script contains material factual claims and requires data/.agent_runtime/_claim_evidence.json through final QA")
            return False
        ok("Mode=1 script has no deterministic high-risk factual cue requiring a Claim Evidence ledger")
        return True

    schema = agents_path / "schemas" / "claim_evidence.schema.json"
    sv = subprocess.run([sys.executable, str(agents_path / "tools" / "schema_validator.py"), "--schema", str(schema), "--file", str(ledger)], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if sv.returncode != 0:
        error("claim evidence ledger failed schema validation:\n" + (sv.stderr or sv.stdout))
        return False
    gate_cmd = [sys.executable, str(agents_path / "tools" / "claim_evidence_gate.py"), "--file", str(ledger), "--mode", mode]
    if script_path.exists():
        gate_cmd += ["--script", str(script_path)]
    # Production V9 requires proof that source CONTENT, not only ledger shape,
    # was verified earlier. The hash-bound receipt avoids re-fetching or a
    # second AI evidence pass during final QA.
    content_receipt = runtime_file(folder_path, "_claim_evidence_content_receipt")
    if must_have:
        if not content_receipt.exists():
            error("Claim Evidence Lock is missing data/.agent_runtime/_claim_evidence_content_receipt.json; run claim_evidence_gate.py --verify-sources --verify-content first")
            return False
        gate_cmd += ["--require-content-receipt", str(content_receipt)]
    gate = subprocess.run(gate_cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if gate.returncode != 0:
        error("Claim Evidence Lock failed:\n" + (gate.stderr or gate.stdout))
        return False
    ok(f"Mode={mode} runtime Claim Evidence Lock is schema-valid, content-receipt current, and passed ledger/script coverage checks")
    return True


def _parse_formatted_timestamp(value):
    text = str(value).strip()
    parts = text.split(":")
    try:
        if len(parts) == 2:
            mins = int(parts[0]); secs = float(parts[1]); return mins * 60 + secs
        if len(parts) == 3:
            hrs = int(parts[0]); mins = int(parts[1]); secs = float(parts[2]); return hrs * 3600 + mins * 60 + secs
    except ValueError:
        return None
    return None


def check_timeline_integrity(folder_path, tolerance=0.015):
    """Cross-field timeline QA without changing chapter schema."""
    rows = load_all_scenes(folder_path)
    if not rows:
        return True
    has_any = any(isinstance(scene.get("timeline"), dict) for _, _, scene in rows)
    if not has_any:
        ok("No optional timeline metadata present; timeline integrity check not applicable")
        return True
    issues = []
    previous_end = None
    for chapter_path, _, scene in rows:
        label = f"{chapter_path.name} scene {scene.get('scene')}"
        tl = scene.get("timeline")
        if not isinstance(tl, dict):
            issues.append(f"{label}: timeline missing while other scenes contain timeline metadata")
            continue
        try:
            start = float(tl.get("start")); end = float(tl.get("end")); dur = float(tl.get("duration")); speed = float(tl.get("speed"))
        except (TypeError, ValueError):
            issues.append(f"{label}: timeline numeric fields are invalid")
            continue
        if speed <= 0:
            issues.append(f"{label}: speed must be > 0")
        if end + tolerance < start:
            issues.append(f"{label}: end {end} precedes start {start}")
        if abs((end - start) - dur) > max(tolerance, 0.002):
            issues.append(f"{label}: duration {dur} != end-start {end-start:.3f}")
        if previous_end is None:
            if abs(start) > tolerance:
                issues.append(f"{label}: first timeline must start at 0.000, got {start}")
        elif abs(start - previous_end) > tolerance:
            issues.append(f"{label}: non-contiguous timeline; start {start} != previous end {previous_end}")
        sf = _parse_formatted_timestamp(tl.get("start_formatted", ""))
        ef = _parse_formatted_timestamp(tl.get("end_formatted", ""))
        if sf is None or abs(sf - start) > 0.0015:
            issues.append(f"{label}: start_formatted does not match start")
        if ef is None or abs(ef - end) > 0.0015:
            issues.append(f"{label}: end_formatted does not match end")
        previous_end = end
    if issues:
        error(f"Timeline integrity failed ({len(issues)} issue(s)):\n  " + "\n  ".join(issues[:12]))
        return False
    ok("Timeline metadata is complete, monotonic, contiguous, and internally consistent")
    return True

def main():
    parser = argparse.ArgumentParser(
        description="Automated QA checks for video output (complements manual 07_qa_checklist.md)"
    )
    parser.add_argument(
        "--folder",
        required=True,
        help="Path to video folder (e.g. data/video_short/example-slug)"
    )
    parser.add_argument(
        "--lang",
        choices=["vi"],
        help="Narration language. Optional: inferred from history/master_script when omitted."
    )
    parser.add_argument(
        "--mode", choices=["1", "2"],
        help="Content mode. Optional: inferred from queue.json when available. Mode 2 requires the runtime Claim Evidence Lock ledger through final QA."
    )
    args = parser.parse_args()
    
    folder_path = Path(args.folder)
    if not folder_path.exists():
        error(f"Folder not found: {folder_path}")
        sys.exit(2)
    
    # Detect video type from folder path.
    # Project convention (see AGENTS.md §0) is data/video_short/... and
    # data/video_long/... — "video_long" is Vietnamese for "long video".
    # "video_long" is accepted too as a defensive fallback in case a
    # differently-named project layout is used.
    path_str = str(folder_path)
    if "video_short" in path_str:
        video_type = "short"
    elif "video_long" in path_str or "video_long" in path_str:
        video_type = "long"
    else:
        error("Cannot determine video type from folder path (expected 'video_short' or 'video_long')")
        sys.exit(2)
    
    # Find .agents folder (go up from data/)
    agents_path = folder_path.parent.parent.parent / ".agents"
    if not agents_path.exists():
        error(f".agents folder not found at {agents_path}")
        sys.exit(2)
    
    language, language_source = infer_language(folder_path, args.lang)
    mode, mode_source = infer_mode(folder_path, args.mode)

    print(f"Running automated QA checks on: {folder_path}")
    print(f"Video type: {video_type}")
    print(f"Language: {language} ({language_source})")
    print(f"Mode: {mode or 'unknown'} ({mode_source})")
    print(f".agents path: {agents_path}")
    print("-" * 60)
    
    all_checks_passed = True
    
    # Run checks
    script_path = folder_path / "master_script.txt"
    scope_issues = validate_scope(script_path.read_text(encoding="utf-8") if script_path.exists() else "", language=language)
    for issue in scope_issues: error(issue)
    all_checks_passed &= not scope_issues
    all_checks_passed &= check_master_script_length(folder_path, video_type)
    all_checks_passed &= validate_json_schemas(folder_path, agents_path)
    all_checks_passed &= check_timeline_integrity(folder_path)
    all_checks_passed &= check_runtime_editorial_semantic(folder_path, agents_path, video_type, language, mode)
    all_checks_passed &= check_runtime_claim_evidence(folder_path, agents_path, mode)
    all_checks_passed &= check_scene_numbers(folder_path)
    all_checks_passed &= check_part_sequences(folder_path)
    all_checks_passed &= check_master_script_scene_coverage(folder_path)
    all_checks_passed &= check_word_counts_and_sub(folder_path, video_type, language)
    all_checks_passed &= check_canonical_scene_alignment(folder_path, video_type, language)
    all_checks_passed &= check_context_ref_leaks(folder_path)
    all_checks_passed &= check_visual_bible_contract(folder_path, video_type)
    all_checks_passed &= check_visual_bible_anchor_usage(folder_path)
    all_checks_passed &= check_negative_keywords(folder_path)
    all_checks_passed &= check_veo_prompt_length(folder_path)
    all_checks_passed &= check_prompt_craft_contract(folder_path)
    all_checks_passed &= check_positive_visual_richness(folder_path)
    all_checks_passed &= check_visual_domain_and_camera_physics(folder_path)
    all_checks_passed &= check_positive_negative_conflicts(folder_path)
    all_checks_passed &= check_exact_prompt_duplicates(folder_path)
    all_checks_passed &= check_continuity_ref(folder_path)
    all_checks_passed &= check_continuity_handoff_format(folder_path)
    all_checks_passed &= check_named_subject_and_count_lock(folder_path)
    all_checks_passed &= check_no_internal_transitions(folder_path)
    all_checks_passed &= check_semantic_receipt_coverage(folder_path)
    all_checks_passed &= check_veo_prompt_language(folder_path)
    all_checks_passed &= check_no_audio_mention(folder_path)
    check_policy_risk_keywords(folder_path)  # Warning only, doesn't affect pass/fail
    check_shot_type_variety(folder_path)  # Warning only, doesn't affect pass/fail
    check_prompt_repetition_and_handoff(folder_path)  # Warning only
    
    print("-" * 60)
    if all_checks_passed:
        archive_verified_inputs(folder_path)
        print("✅ All automated QA checks PASSED")
        print("\nNOTE: Manual checks still required (see .agents/07_qa_checklist.md):")
        print("  - Deep scene semantic fidelity (run scene_semantic_checker.py; manual review if AI unavailable)")
        print("  - Visual consistency for unnamed/implicit entities not detectable by deterministic anchor QA")
        print("  - Lighting/weather/physical continuity logic")
        print("  - Content style matches voiceStyle")
        print("  - Mode constraints (hypothesis vs verified)")
        print("  - Topic uniqueness (for auto generation)")
        print("  - Full manual policy read-through per 07_qa_checklist.md §E "
              "/ 12_veo_policy_compliance.md (keyword scan above is a coarse net only)")
        sys.exit(0)
    else:
        print("❌ Some automated QA checks FAILED — fix errors above before proceeding")
        sys.exit(1)


if __name__ == "__main__":
    main()
