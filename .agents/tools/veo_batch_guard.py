#!/usr/bin/env python3
"""veo_batch_guard.py — deterministic micro-batch gate for Veo prompt production.

Designed for Step 8 long/scene-heavy jobs. It prevents the agent from writing
hundreds of prompts in one pass and gradually becoming generic or inconsistent.
The tool changes NO final output schema. With --checkpoint it writes a runtime-
only progress ledger under data/.agent_runtime/.

USAGE:
  python3 .agents/tools/veo_batch_guard.py \
    --folder data/video_long/example-slug --start 1 --end 6 --checkpoint

EXIT:
  0 PASS, 1 quality failure, 2 input/system/checkpoint error
"""

import argparse
import difflib
import hashlib
import json
import re
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

from scene_alignment_guard import deterministic_subject_issues, unreliable_exact_count_issues, entity_alias_map_from_visual_bible
from semantic_receipts import matching_receipt, receipt_path

MIN_CHARS = 900
MAX_CHARS = 4000
MIN_POSITIVE_CHARS = 800
MAX_BATCH = 8

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
    re.compile(r"\bthen\b.{0,120}\b(?:another|new|different)\s+(?:scene|shot|setup|location|setting)\b", re.I),
    re.compile(r"\b(first|initially)\b.{0,220}\b(then|next|afterward|afterwards)\b", re.I),
    re.compile(r"\b(new|different|another)\s+(scene|location|setting|shot|setup)\b", re.I),
]
AUDIO_PATTERNS = [
    r"\baudio\b", r"\bsound(?:track|scape|s| effect| effects)?\b", r"\bdialogue\b",
    r"\bvoice(?:over)?\b", r"\bnarrat(?:or|ion|es?)\b", r"\bmusic\b", r"\bsfx\b",
    r"\bsilent(?:ly)?\b", r"\baudible\b", r"\blip[- ]?sync\b",
    r"\bspeak(?:s|ing)?\b", r"\bsays\b", r"\bwhisper(?:s|ing)?\b",
    r"\bshout(?:s|ing)?\b", r"\bscream(?:s|ing)?\b", r"\bsing(?:s|ing)?\b",
]
LENS_RE = re.compile(r"\b\d{2,3}\s*mm\b|\bmacro lens\b", re.I)
CAMERA_RE = re.compile(r"\b(camera|dolly|tracking|track|pan|tilt|crane|arc|handheld|steadicam|gimbal|drone|aerial|locked[- ]off|static shot|push[- ]in|pull[- ]back|orbit|POV)\b", re.I)
LIGHT_RE = re.compile(r"\b(light|lighting|illuminat(?:ed|ion)|glow(?:ing)?|shadow|backlit|backlight|rim light|sunlit|moonlit|volumetric|golden hour|blue hour|dusk|dawn|practical light|lens flare)\b", re.I)
FOCUS_RE = re.compile(r"\b(depth of field|deep focus|shallow focus|shallow depth|rack focus|bokeh|sharp focus|soft background)\b", re.I)
MICRO_MOTION_RE = re.compile(r"\b(gradually|continuously|throughout|drift(?:s|ing)?|flow(?:s|ing)?|rotat(?:e|es|ing)|move(?:s|ment|ing)?|advance(?:s|d|ing)?|settle(?:s|d|ing)?|flicker(?:s|ing)?|ripple(?:s|ing)?|oscillat(?:e|es|ing)|breath(?:e|es|ing)|changes? intensity|travels? across|slides? across|blink(?:s|ing)?|puls(?:e|es|ing)|sway(?:s|ing)?|turn(?:s|ing)?|adjust(?:s|ing)?|shift(?:s|ing)?|sweep(?:s|ing)?|condens(?:e|es|ing)|evaporat(?:e|es|ing)|melt(?:s|ing)?|fractur(?:e|es|ing)|elongat(?:e|es|ing)|expand(?:s|ing)?|contract(?:s|ing)?|accumulat(?:e|es|ing)|spread(?:s|ing)?)\b", re.I)
END_STATE_RE = re.compile(r"\b(the shot ends|shot ends|ends with|end[- ]frame|final frame|by the end of the shot|at the end of the take)\b", re.I)

DOMAIN_SWITCH_PATTERNS = [
    re.compile(r"\b(drone|aerial|helicopter|real[- ]world|landscape|laboratory|room)\b.{0,180}\b(moving|moves|travel(?:s|ing)?|dives?|enters?|passes?|push(?:es|ing)?|glides?)\b.{0,120}\b(cross[- ]section|cutaway|microscopic|molecular|x[- ]ray|schematic|diagram|simulation)\b", re.I),
    re.compile(r"\b(cross[- ]section|microscopic|molecular|schematic|diagram|simulation)\b.{0,180}\b(becomes?|transforms?|morphs?|opens? into|switches? to)\b.{0,120}\b(real[- ]world|landscape|laboratory|room|aerial|drone)\b", re.I),
]
CAMERA_PHYSICS_PATTERNS = [
    re.compile(r"\bcrane(?: shot)?\b.{0,180}\b(thousands? of (?:meters|metres)|kilometers?|kilometres?|\d+\s*km|stratospher|orbit|twenty kilometers?)\b", re.I),
    re.compile(r"\bdolly(?:[- ]?(?:in|out))?\b.{0,180}\b(kilometers?|kilometres?|\d+\s*km|through (?:the )?(?:crust|planet|mantle)|stratospher|orbit)\b", re.I),
    re.compile(r"\bdrone\b.{0,180}\b(inside (?:the )?(?:crust|mantle|cell|molecule)|cross[- ]section|microscopic|molecular interior)\b", re.I),
]
EXACT_TYPOGRAPHY_RE = re.compile(r"\b(text reads|screen reads|display(?:s|ing)? (?:the )?text|readable text|caption says|label(?:ed|led) as|exact formula|equation written|ticker reads|engraved (?:text|lettering|words)|lettering (?:reading|saying)|plaque (?:reads|reading)|certificate (?:reads|showing)|official logo|brand logo|heritage emblem|official emblem)\b", re.I)


def die(msg, code=2):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def all_scenes(folder):
    rows = []
    for p in sorted(folder.glob("chapter_*.json")):
        data = load_json(p)
        if not isinstance(data, list):
            die(f"{p} is not a scene array")
        for scene in data:
            rows.append((p.name, scene))
    return rows


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def positive(prompt):
    return re.split(r"\bnegative\s*:", prompt, maxsplit=1, flags=re.I)[0]


def normalize(prompt):
    return re.sub(r"\s+", " ", prompt.strip().casefold())


def similarity_core(prompt, film_look):
    """Remove mandatory boilerplate before near-duplicate comparison."""
    core = positive(prompt)
    core = core.replace(SINGLE_TAKE_ANCHOR, " ")
    if film_look:
        core = re.sub(re.escape(film_look), " ", core, flags=re.I)
    return normalize(core)


def get_runtime_path(folder):
    # Expected layout: <project>/data/video_long|video_short/<slug>
    project_root = folder.parent.parent.parent
    runtime = project_root / "data" / ".agent_runtime"
    runtime.mkdir(parents=True, exist_ok=True)
    return runtime / f"_veo_progress_{folder.name}.json"


def canonical_anchors(vb):
    out = []
    for ch in vb.get("characters", []):
        name = str(ch.get("name", "")).strip()
        aliases = [name] + [str(x).strip() for x in ch.get("aliases", []) if str(x).strip()]
        for key in ("appearance", "outfit"):
            anchor = str(ch.get(key, "")).strip()
            if anchor and not anchor.startswith("N/A"):
                out.append((f"character {name} {key}", aliases, anchor))
    for loc in vb.get("locations", []):
        name=str(loc.get("name", "")).strip(); aliases=[name]+[str(x).strip() for x in loc.get("aliases",[]) if str(x).strip()]
        out.append((f"location {name}", aliases, str(loc.get("description", "")).strip()))
    for obj in vb.get("key_objects", []):
        name=str(obj.get("name", "")).strip(); aliases=[name]+[str(x).strip() for x in obj.get("aliases",[]) if str(x).strip()]
        out.append((f"object {name}", aliases, str(obj.get("description", "")).strip()))
    return [(label, aliases, anchor) for label, aliases, anchor in out if anchor]


def validate_scene(chapter, scene, vb, film_look, negatives, anchors, subject_alias_map):
    issues = []
    n = scene.get("scene")
    label = f"{chapter} scene {n}"
    prompt = str(scene.get("veo_prompt", "")).strip()
    pos = positive(prompt)
    pf = prompt.casefold()
    posf = pos.casefold()

    if not prompt.startswith(SINGLE_TAKE_ANCHOR):
        issues.append(f"{label}: prompt must START with the exact single-take anchor: {SINGLE_TAKE_ANCHOR}")
    elif pos.count(SINGLE_TAKE_ANCHOR) != 1:
        issues.append(f"{label}: single-take anchor must appear exactly once in the positive prompt")

    if not (MIN_CHARS <= len(prompt) <= MAX_CHARS):
        issues.append(f"{label}: prompt length {len(prompt)} outside {MIN_CHARS}-{MAX_CHARS}")
    if len(pos.strip()) < MIN_POSITIVE_CHARS:
        issues.append(f"{label}: positive visual body {len(pos.strip())} chars < {MIN_POSITIVE_CHARS}; Negative boilerplate cannot satisfy detail minimum")
    if pf.count(film_look.casefold()) != 1:
        issues.append(f"{label}: film_look must appear verbatim exactly once")
    if not LENS_RE.search(pos):
        issues.append(f"{label}: missing concrete focal length/macro lens")
    if not CAMERA_RE.search(pos):
        issues.append(f"{label}: missing explicit camera direction")
    if not LIGHT_RE.search(pos):
        issues.append(f"{label}: missing motivated lighting")
    if not FOCUS_RE.search(pos):
        issues.append(f"{label}: missing depth/focus strategy")
    if not MICRO_MOTION_RE.search(pos):
        issues.append(f"{label}: missing scene-relevant micro-action/temporal behavior")
    if not END_STATE_RE.search(pos):
        issues.append(f"{label}: missing explicit end-frame state for next-scene continuity")

    m = re.search(r"\bnegative\s*:\s*(.*)$", prompt, flags=re.I | re.S)
    if not m:
        issues.append(f"{label}: missing Negative clause")
    else:
        clause = m.group(1).casefold()
        missing = [x for x in negatives if x.casefold() not in clause]
        if missing:
            issues.append(f"{label}: missing negatives: {', '.join(missing[:4])}")
        if NO_INTERNAL_EDIT_NEGATIVE.casefold() not in clause:
            issues.append(f"{label}: Negative clause must include the exact no-internal-edit lock: {NO_INTERNAL_EDIT_NEGATIVE}")

    # Scan POSITIVE direction only. Transition words are expected in the Negative
    # clause because the prompt explicitly forbids them there.
    for phrase in TRANSITION_PHRASES:
        if phrase in posf:
            issues.append(f"{label}: internal transition/multi-shot phrase '{phrase}' in positive direction")
            break
    for rx in TRANSITION_REGEXES:
        if rx.search(pos):
            issues.append(f"{label}: internal sequencing/setup-change language violates the one-take contract ({rx.pattern})")
            break

    for msg in deterministic_subject_issues(scene, subject_alias_map):
        issues.append(f"{label}: {msg}")
    for msg in unreliable_exact_count_issues(scene):
        issues.append(f"{label}: {msg}")

    for pattern in AUDIO_PATTERNS:
        if re.search(pattern, prompt, flags=re.I):
            issues.append(f"{label}: audio/sound/dialogue wording detected ({pattern})")
            break

    ref = str(scene.get("continuity_ref", "")).strip()
    if n == 1:
        if ref.casefold() != "opening":
            issues.append(f"{label}: scene 1 continuity_ref must be 'opening'")
    elif len(ref) < 32 or ref.casefold() == "opening":
        issues.append(f"{label}: continuity_ref is too vague for a professional handoff")
    elif "previous end:" not in ref.casefold() or "current opening:" not in ref.casefold() or "editorial relationship:" not in ref.casefold():
        issues.append(f"{label}: continuity_ref must separate Previous end:, Current opening:, and Editorial relationship:")
    elif not re.search(r"editorial relationship:\s*(continuous action|matched conceptual cut|intentional location/time shift)\.?", ref, re.I):
        issues.append(f"{label}: invalid Editorial relationship value")
    elif re.search(r"\b(transitioning to|moving into|morphing into|becoming|then shows?|next shows?)\b", ref, re.I):
        issues.append(f"{label}: continuity_ref uses transformation/future-planning wording instead of endpoint handoff")

    # If an entity is explicitly named, require its canonical anchor(s), and
    # never allow any canonical anchor to be duplicated in the same prompt.
    for anchor_label, aliases, anchor in anchors:
        count = pf.count(anchor.casefold())
        if count > 1:
            issues.append(f"{label}: canonical {anchor_label} duplicated {count} times")
        base_anchor = anchor.split(",")[0].strip() if "," in anchor else anchor
        has_anchor = (count > 0) or (base_anchor.casefold() in pf)
        if any(a and a.casefold() in pf for a in aliases) and not has_anchor:
            issues.append(f"{label}: names/aliases {anchor_label} but omits its canonical visual_bible wording")

    for rx in DOMAIN_SWITCH_PATTERNS:
        if rx.search(pos):
            issues.append(f"{label}: hidden visual-domain transformation inside one shot; start and remain in one domain")
            break
    for rx in CAMERA_PHYSICS_PATTERNS:
        if rx.search(pos):
            issues.append(f"{label}: camera type is physically incompatible with requested travel scale/domain")
            break
    if EXACT_TYPOGRAPHY_RE.search(pos):
        issues.append(f"{label}: requests exact readable text/logo/emblem; use unlabeled visual and add exact typography in post")
    neg_clause = m.group(1).casefold() if m else ""
    if "logo" in neg_clause and re.search(r"\b(logo|emblem)\b", posf):
        issues.append(f"{label}: positive requests logo/emblem while Negative forbids logo")

    # Generated exact typography is unreliable and conflicts with the project's
    # text-overlay avoidance; warn as a blocking batch-craft issue so it is fixed
    # before expensive generation.
    if re.search(r"\b(text reads|screen reads|display(?:s|ing)? the text|readable text|caption says|label(?:ed|led) as|exact formula|equation written|subtitle says|ticker reads)\b", posf):
        issues.append(f"{label}: requests exact readable generated text/formula; use unlabeled visual and post typography")

    return issues


def main():
    ap = argparse.ArgumentParser(description="Deterministic micro-batch quality gate for Veo scene prompts")
    ap.add_argument("--folder", required=True)
    ap.add_argument("--start", type=int, required=True)
    ap.add_argument("--end", type=int, required=True)
    ap.add_argument("--checkpoint", action="store_true")
    ap.add_argument("--reset-checkpoint", action="store_true", help="Delete the runtime checkpoint after a deliberate source-of-truth change; guarded work must restart from scene 1")
    args = ap.parse_args()

    folder = Path(args.folder).resolve()
    if not folder.exists():
        die(f"folder not found: {folder}")
    if args.start < 1 or args.end < args.start:
        die("invalid --start/--end range")
    if args.end - args.start + 1 > MAX_BATCH:
        die(f"batch size exceeds hard maximum {MAX_BATCH}")

    vb_path = folder / "visual_bible.json"
    master_path = folder / "master_script.txt"
    if not vb_path.exists() or not master_path.exists():
        die("visual_bible.json and master_script.txt are required")
    vb = load_json(vb_path)
    film_look = str(vb.get("visual_style", {}).get("film_look", "")).strip()
    negatives = [str(x).strip() for x in vb.get("negative_keywords", []) if str(x).strip()]
    if not film_look or not negatives:
        die("visual_bible film_look/negative_keywords missing")
    negative_cf = {x.casefold() for x in negatives}
    missing_safety = [x for x in MANDATORY_SAFETY_NEGATIVES if x.casefold() not in negative_cf]
    if missing_safety:
        die("visual_bible.negative_keywords missing mandatory policy-safety entries: " + ", ".join(missing_safety))
    anchors = canonical_anchors(vb)
    subject_alias_map = entity_alias_map_from_visual_bible(vb)

    rows = all_scenes(folder)
    by_num = {scene.get("scene"): (chapter, scene) for chapter, scene in rows}
    expected = list(range(args.start, args.end + 1))
    missing = [n for n in expected if n not in by_num]
    if missing:
        die(f"missing requested scene numbers: {missing}")

    state_path = get_runtime_path(folder)
    if args.reset_checkpoint:
        removed = []
        if state_path.exists():
            state_path.unlink()
            removed.append(str(state_path))
        semantic_path = receipt_path(folder)
        if semantic_path.exists():
            semantic_path.unlink()
            removed.append(str(semantic_path))
        print(f"CHECKPOINT RESET: removed {', '.join(removed) if removed else 'no existing runtime ledgers'}; guarded + semantic review must restart from scene 1")
    state = None
    if state_path.exists():
        try:
            state = load_json(state_path)
        except Exception as exc:
            die(f"cannot read checkpoint {state_path}: {exc}")
        if state.get("master_script_sha256") != sha256(master_path) or state.get("visual_bible_sha256") != sha256(vb_path):
            die("source-of-truth hash changed since last checkpoint; deliberately run --reset-checkpoint and re-guard from scene 1 after reviewing the source change")
        last = int(state.get("last_completed_scene", 0))
        if args.start > last + 1:
            die(f"cannot skip ahead: checkpoint last_completed_scene={last}, requested start={args.start}")
        if args.start <= last < args.end:
            die("batch overlaps completed and new scenes; use a fully completed recheck range or start at last_completed_scene+1")

        # HARD SEMANTIC CHAIN: a NEW batch cannot start until the immediately
        # preceding deterministic batch has an AI semantic PASS receipt whose
        # hashes still match the current source/prompt data. This mechanically
        # prevents the workflow from skipping scene_semantic_checker.py.
        if args.start == last + 1 and last > 0:
            prior_batches = sorted(state.get("batches", []), key=lambda x: (x.get("end", 0), x.get("start", 0)))
            prior = next((b for b in reversed(prior_batches) if int(b.get("end", 0)) == last), None)
            if not prior:
                die(f"checkpoint says scene {last} completed but no prior deterministic batch record exists")
            ps, pe = int(prior.get("start")), int(prior.get("end"))
            prior_scenes = [by_num[n][1] for n in range(ps, pe + 1)]
            rec = matching_receipt(folder, ps, pe, prior_scenes, master_path, vb_path)
            if rec is None:
                die(
                    f"semantic PASS receipt missing/stale for previous batch {ps}-{pe}; "
                    f"run scene_semantic_checker.py --scene-start {ps} --scene-end {pe} and fix every blocking issue before advancing"
                )
    elif args.start != 1:
        die("no checkpoint exists; first guarded batch must start at scene 1")

    issues = []
    batch_prompts = []
    for n in expected:
        chapter, scene = by_num[n]
        issues.extend(validate_scene(chapter, scene, vb, film_look, negatives, anchors, subject_alias_map))
        batch_prompts.append((n, similarity_core(str(scene.get("veo_prompt", "")), film_look), scene.get("sentence_id")))

    # Block exact reuse against every earlier scene and strong near-copy within
    # adjacent scenes; a different narration beat requires a genuinely new brief.
    seen = {}
    for chapter, scene in rows:
        n = scene.get("scene")
        if n > args.end:
            continue
        norm = normalize(str(scene.get("veo_prompt", "")))
        if not norm:
            continue
        if norm in seen and n in expected:
            issues.append(f"scene {n}: exact veo_prompt duplicate of scene {seen[norm]}")
        else:
            seen.setdefault(norm, n)

    for i in range(1, len(batch_prompts)):
        prev_n, a, prev_sid = batch_prompts[i-1]
        n, b, sid = batch_prompts[i]
        if not a or not b:
            continue
        ratio = difflib.SequenceMatcher(None, a, b).ratio()
        threshold = 0.84 if prev_sid == sid else 0.91
        if ratio >= threshold:
            issues.append(f"scenes {prev_n}-{n}: prompts are {ratio:.0%} similar; visual progression is too templated")

    # Camera variety is checked per micro-batch so the agent cannot fall into
    # a late-job habit of repeating the same framing. This is deliberately
    # based on the structured shot_type field rather than fragile prose parsing.
    batch_shots = [str(by_num[n][1].get("shot_type", "")) for n in expected]
    unique_shots = len(set(batch_shots))
    minimum_unique = 3 if len(batch_shots) >= 6 else (2 if len(batch_shots) >= 4 else 1)
    if unique_shots < minimum_unique:
        issues.append(f"batch shot_type variety too low: {unique_shots} unique across {len(batch_shots)} scenes; require at least {minimum_unique}")
    for i in range(2, len(batch_shots)):
        if batch_shots[i] == batch_shots[i-1] == batch_shots[i-2]:
            issues.append(f"scenes {expected[i-2]}-{expected[i]}: same shot_type '{batch_shots[i]}' repeated 3 times consecutively")

    if issues:
        print(f"BATCH FAIL: {len(issues)} issue(s)", file=sys.stderr)
        for item in issues[:20]:
            print(f" - {item}", file=sys.stderr)
        if len(issues) > 20:
            print(f" - ... and {len(issues)-20} more", file=sys.stderr)
        sys.exit(1)

    avg_len = round(sum(len(by_num[n][1].get("veo_prompt", "")) for n in expected) / len(expected), 1)
    positive_lengths = [len(positive(str(by_num[n][1].get("veo_prompt", ""))).strip()) for n in expected]
    avg_positive = round(sum(positive_lengths) / len(positive_lengths), 1)
    min_positive = min(positive_lengths)
    print(f"BATCH PASS: scenes {args.start}-{args.end}; average prompt length {avg_len} chars; average positive {avg_positive}, minimum positive {min_positive}")

    if args.checkpoint:
        now = datetime.now(timezone(timedelta(hours=7))).isoformat()
        prev_batches = state.get("batches", []) if isinstance(state, dict) else []
        # Rechecking an already-completed range replaces matching batch record;
        # advancing appends a new one.
        prev_batches = [b for b in prev_batches if not (b.get("start") == args.start and b.get("end") == args.end)]
        prev_batches.append({"start": args.start, "end": args.end, "avg_prompt_chars": avg_len, "avg_positive_chars": avg_positive, "min_positive_chars": min_positive, "passed_at_vn": now})
        last_completed = max(int(state.get("last_completed_scene", 0)) if state else 0, args.end)
        out = {
            "video_folder": folder.name,
            "last_completed_scene": last_completed,
            "total_scenes_detected": len(rows),
            "master_script_sha256": sha256(master_path),
            "visual_bible_sha256": sha256(vb_path),
            "updated_at_vn": now,
            "batches": sorted(prev_batches, key=lambda x: (x.get("start", 0), x.get("end", 0))),
        }
        state_path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"CHECKPOINT: {state_path}")


if __name__ == "__main__":
    main()
