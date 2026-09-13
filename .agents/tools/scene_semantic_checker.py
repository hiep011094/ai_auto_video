#!/usr/bin/env python3
"""
scene_semantic_checker.py — AI-assisted semantic QA for scene prompts.

Purpose: catch failures deterministic QA cannot reliably detect, especially:
- beautiful-but-irrelevant B-roll that does not depict the current voiceover beat
- revealing a later clause from context_ref too early
- continuity_ref pulling future/opposing content into the current scene
- speculative/preliminary narration depicted as confirmed reality
- repeating the same whole-sentence visual across part 1/N..N/N
- recurring-identity drift when wording is semantically paraphrased
- physically implausible action/weather/object-state changes
- multi-shot prompts hidden inside one scene
- under-directed cinematic briefs that behave like moving stills

This tool does NOT change any project output schema. It only reads scene files
and returns a QA verdict.

USAGE:
  python3 .agents/tools/scene_semantic_checker.py \
    --folder data/video_long/example-slug --ai-model agy

  # Batch-scoped review during Step 8 micro-batches:
  python3 .agents/tools/scene_semantic_checker.py \
    --folder data/video_long/example-slug --ai-model agy \
    --scene-start 25 --scene-end 30

EXIT CODES:
  0 = semantic QA passed
  1 = one or more blocking semantic issues detected
  2 = local/system/input error
  3 = AI semantic review did not run or returned unusable output; manual review required
"""

import argparse
import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SCRIPT_DIR = Path(__file__).resolve().parent
FUTURE_LOOKAHEAD_SCENES = 12  # compact boundary context; future rows are detection-only, never creative source material
sys.path.insert(0, str(SCRIPT_DIR))
from ai_semantic_checker import call_ai_model  # noqa: E402
from semantic_receipts import load_receipts, write_receipts, scene_payload_hash, sha256_file, CURRENT_SEMANTIC_RULESET  # noqa: E402
import word_splitter as canonical_splitter  # noqa: E402


SCORE_KEYS = [
    "fidelity_score",
    "locality_score",
    "progression_score",
    "continuity_score",
    "identity_score",
    "physics_score",
    "single_shot_score",
    "cinematic_craft_score",
    "epistemic_score",
    "visual_domain_score",
    "evidence_visualization_score",
    "subject_lock_score",
    "future_leak_score",
    "time_scale_score",
    "transition_free_score",
]

# Strict production thresholds. A scene that is merely "mostly right" is not
# sufficient for final long-form cinematic assembly.
BLOCK_THRESHOLDS = {
    "fidelity_score": 0.85,
    "locality_score": 0.85,
    "progression_score": 0.85,
    "continuity_score": 0.72,
    "identity_score": 0.80,
    "physics_score": 0.75,
    "single_shot_score": 0.85,
    "cinematic_craft_score": 0.75,
    "epistemic_score": 0.85,
    "visual_domain_score": 0.88,
    "evidence_visualization_score": 0.85,
    "subject_lock_score": 0.92,
    "future_leak_score": 0.92,
    "time_scale_score": 0.82,
    "transition_free_score": 0.95,
}


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def all_scenes(folder):
    rows = []
    for p in sorted(folder.glob("chapter_*.json")):
        data = load_json(p)
        for scene in data:
            rows.append({"chapter": p.name, **scene})
    return rows


def compact_visual_bible(vb):
    return {
        "story_anchor": vb.get("story_anchor", ""),
        "characters": vb.get("characters", []),
        "locations": vb.get("locations", []),
        "key_objects": vb.get("key_objects", []),
        "visual_style": vb.get("visual_style", {}),
        "lighting_timeline": vb.get("lighting_timeline", []),
        "camera_style": vb.get("camera_style", {}),
    }


def _semantic_tokens(text):
    import re
    import unicodedata
    t = unicodedata.normalize("NFKD", str(text)).casefold()
    t = "".join(c for c in t if not unicodedata.combining(c)).replace("đ", "d")
    stop = {"the","and","with","from","that","this","into","about","cua","va","la","mot","nhung","cac","trong","voi","cho","duoc","nay","do"}
    return {x for x in re.findall(r"[a-z0-9%°._-]+", t) if len(x) >= 3 and x not in stop}


def compact_relevant_claim_evidence(claim_evidence, scenes, max_claims=10):
    """Return only claim rows relevant to the current semantic micro-batch.

    V8 sent the entire ledger on every AI call. V9 keeps the factual lock but
    removes unrelated claims to reduce token usage and cross-scene distraction.
    """
    if not isinstance(claim_evidence, dict):
        return None
    claims = claim_evidence.get("claims", [])
    if not isinstance(claims, list):
        return None
    scene_text = " ".join(
        f"{s.get('voiceover','')} {s.get('context_ref','')}" for s in scenes
    )
    st = _semantic_tokens(scene_text)
    import re
    literals = set(re.findall(r"\b(?:\d+(?:[.,]\d+)?%?|1[5-9]\d{2}|20\d{2})\b", scene_text))
    ranked = []
    for c in claims:
        if not isinstance(c, dict) or c.get("decision") == "reject":
            continue
        corpus = f"{c.get('statement','')} {c.get('allowed_wording','')} {c.get('visual_rule','')}"
        ct = _semantic_tokens(corpus)
        shared = len(st & ct)
        c_literals = set(re.findall(r"\b(?:\d+(?:[.,]\d+)?%?|1[5-9]\d{2}|20\d{2})\b", corpus))
        literal_hits = len(literals & c_literals)
        # High-risk claims need a smaller lexical threshold because names and
        # numbers can be sparse in short voiceover windows.
        high_risk = c.get("claim_type") in {"number","date","institution","causation","absence","historical_reconstruction"}
        score = shared + 4 * literal_hits + (0.5 if high_risk and shared >= 1 else 0)
        if score > 0:
            ranked.append((score, c))
    ranked.sort(key=lambda x: x[0], reverse=True)
    selected = [c for _, c in ranked[:max_claims]]
    if not selected:
        return {"mode": claim_evidence.get("mode"), "topic": claim_evidence.get("topic"), "claims": []}
    return {"mode": claim_evidence.get("mode"), "topic": claim_evidence.get("topic"), "claims": selected}


def scene_crosses_sentence_boundary(scene):
    """Derive an internal-only boundary flag without changing scene schema.

    Hard word-count splitting intentionally may place the tail of sentence A
    and the opening of sentence B in one scene. V9 exposes that fact to the
    semantic judge so the one-visual-beat bridge rule is mechanically reviewed
    instead of existing only in documentation.
    """
    voice = str(scene.get("voiceover", "")).strip()
    if not voice:
        return False
    try:
        return len(canonical_splitter.split_sentences(voice)) > 1
    except Exception:
        return False


def _runtime_scene_payload(scenes):
    rows = []
    for scene in scenes:
        row = dict(scene)
        row["_runtime_boundary_crossing"] = scene_crosses_sentence_boundary(scene)
        rows.append(row)
    return rows


def build_prompt(vb, scenes, previous_scenes=None, next_scenes=None, claim_evidence=None):
    future_boundaries = [
        {
            "scene": s.get("scene"),
            "voiceover": s.get("voiceover", ""),
            "context_ref": s.get("context_ref", ""),
            "sentence_id": s.get("sentence_id"),
            "part": s.get("part", ""),
        }
        for s in (next_scenes or [])
    ]
    payload = {
        "visual_bible": compact_visual_bible(vb),
        "claim_evidence_ledger": compact_relevant_claim_evidence(claim_evidence, scenes) if claim_evidence else None,
        "previous_scenes_before_batch": previous_scenes or [],
        "scenes": _runtime_scene_payload(scenes),
        "next_scenes_after_batch_for_future_leak_detection_only": future_boundaries,
    }
    return f"""You are the final supervising editor for a professional cinematic Veo scene-generation pipeline.
Review the supplied scene JSON. Do not rewrite scenes. Judge whether each `veo_prompt` faithfully and professionally visualizes the narration beat that is actually spoken DURING THAT CLIP.

INPUT:
{json.dumps(payload, ensure_ascii=False, indent=2)}

Use these rules strictly and pessimistically. A beautiful shot is a failure if it is the wrong visual claim.

1. SEMANTIC PRIORITY LOCK
   - `voiceover` is the LOCAL TIMING WINDOW and is the visual authority.
   - `_runtime_boundary_crossing=true` means the hard word-count window crosses a real sentence boundary. That scene MUST still use one dominant bridge visualization in one setup; do not visualize sentence A and sentence B as two sequential setups. The prompt must depict a subject from at least one of the sentence clauses (either concluding the outgoing clause or establishing the incoming clause as a standard documentary audio lead/J-cut). Do not mark a scene-design conflict merely because two consecutive clauses describe separate locations.
   - Infer one concise LOCAL_CLAIM from the current voiceover only.
   - The main visible subject/action/process must be directly justified by that LOCAL_CLAIM.
   - `context_ref` may resolve pronouns, terminology, cause/effect or ambiguity, but it must NOT authorize showing a later clause early.
   - `sentence_id + part=x/N` position the beat within the source sentence. Parts must advance visually as the wording advances.

2. CONTINUITY IS PREVIOUS STATE, NOT FUTURE STORY CONTENT
   - `continuity_ref` may preserve only the immediately previous visible state/editorial handoff: subject/object state, screen direction, pose/gaze, motion, weather, lighting, scale, location motif and camera axis when relevant.
   - If `continuity_ref` introduces an opposing viewpoint, later conclusion, later location, later consequence, speculative organism/event, or any content not yet justified by current voiceover, mark the scene BLOCKING even if the prompt follows continuity_ref perfectly.
   - When narration intentionally changes concept/location, continuity can carry tone/motif/motion/light family without carrying the previous narrative subject.

3. EPISTEMIC VISUAL TRUTH
   - The image must show the same certainty level as the narration.
   - If narration says possible/candidate/hypothesis/model/preliminary/disputed/may/could/unknown, the prompt must not depict the proposed result as confirmed reality.
   - Prefer evidence, mechanism, conceptual simulation, or explicitly hypothetical scientific visualization.
   - Depicting confirmed alien life, a causal mechanism, historical event, discovery outcome, or factual conclusion not established by the current narration is BLOCKING.

4. SINGLE-SHOT CONTRACT
   - One scene = one uninterrupted 4/6/8-second video shot.
   - One framing/setup, one primary camera move, one dominant action/process. Natural subordinate micro-motion is allowed.
   - No internal cut, dissolve, location switch, second setup, montage, or sequential multi-shot beat.
   - A useful prompt should establish an opening state, evolve one dominant action/process continuously, and end in a clear visible state suitable for the next scene.

5. NARRATION-SPECIFIC VISUAL VALUE
   - Generic B-roll is not enough when narration contains a specific mechanism, argument, evidence item, comparison or consequence.
   - Do not accept a shot that could fit many unrelated sentences merely because it looks cinematic.
   - Avoid repetitive monitor/hologram/molecule filler if a more physical, observational or process-based visualization can represent the current claim.

6. VISUAL IDENTITY / STYLE
   - Recurring identity must remain faithful to visual_bible. No semantic paraphrase that changes appearance/outfit, recurring location landmarks/materials, or key-object geometry/material/state.
   - The film should feel like one production across independently generated clips. Camera/lens, lighting, material realism, color language and film look should be deliberate and non-conflicting.

7. PHYSICS / SPATIAL LOGIC
   - Gravity/inertia/contact, cause/effect, fluid/particle/weather direction, shadows/reflections, scale and object state may not randomly reset.
   - Camera/subject screen direction should be preserved or intentionally changed, not randomly flipped for variety.

8. CINEMATIC CRAFT
   - The prompt should contain enough concrete direction to produce an 8-second moving image rather than a pretty still: specific framing/angle, one camera behavior, focal length/focus strategy, motivated lighting, spatial arrangement/material texture, scene-relevant micro-motion and end-frame state.
   - Detail must be useful, not adjective padding.
   - Do not reward asking Veo to generate exact readable text/formulas/labels; unlabeled visualizations are preferable for production reliability.

9. VISUAL-ONLY CONTRACT
   - Audio/sound/dialogue/narration/music/silence instructions do not belong in `veo_prompt` at all.

10. VISUAL DOMAIN LOCK
   - One clip must begin and remain in ONE visual domain: physical real-world, historical reconstruction, scientific simulation/cross-section, microscopic/molecular, space/orbital, or abstract conceptual.
   - Never hide a domain change inside camera language (for example drone/aerial footage "moving into" a geological cross-section, a laboratory "becoming" a molecular diagram, or a physical lens traveling through kilometers of crust). If the narration needs a cross-section, start the scene already as a cross-section/simulation.
   - A rack focus, camera move, reveal, or changing light is allowed only while the underlying visual domain/setup remains the same.

11. CAMERA PHYSICS / SCALE LOCK
   - Match camera vocabulary to scale. Crane/dolly/handheld/steadicam are human-scale physical rigs; drone/aerial is exterior atmosphere-scale; orbital is space-scale; macro is specimen-scale; virtual/cross-section camera is appropriate for impossible scientific internal travel.
   - Block physically nonsensical instructions such as a crane rising thousands of meters, a dolly traveling through 20 km of crust, or a drone flying inside a molecule.

12. EVIDENCE IS NOT A VERDICT
   - A visualization of measurement/survey/data must not claim more than the current narration/source supports. Absence of detected evidence is not absolute proof of absence. Show scope, observations, continuous reflections, lack of obvious anomalies, uncertainty, or model boundaries rather than visually declaring "zero", "impossible", or "proved none" unless explicitly established.
   - Historical reconstructions and causal mechanisms must match the stated certainty level; a reconstruction must look like a reconstruction when the underlying event is inferred rather than observed.

13. CLAIM-EVIDENCE LOCK (when `claim_evidence_ledger` is supplied)
   - Treat each ledger entry's `allowed_wording` as a ceiling, not a suggestion. The scene may be weaker/more cautious but never stronger.
   - The scene's visible claim must stay within the matching `visual_rule`; a rejected claim must not be visually revived.
   - Named institutions, dates, numbers, causal mechanisms, historical reconstructions and absence claims must not be upgraded beyond the ledger merely for cinematic drama.

14. TEXT/LOGO RELIABILITY AND SELF-CONTRADICTION
   - Exact formulas, logos, emblems, certificate wording, plaque lettering, labels and precise numerical readouts should normally be represented by unlabeled geometry/marks and added in post.
   - A prompt that positively asks for text/logo/emblem while its Negative clause forbids text/logo is internally contradictory and BLOCKING.

15. NAMED SUBJECT LOCK — ZERO TOLERANCE
   - If CURRENT `voiceover` names a concrete entity/object/person/place/celestial body, that exact semantic subject must be the hero subject of this clip unless the current words explicitly compare multiple named subjects.
   - Never substitute a same-category subject. Moon -> Mercury, Jupiter -> comet, Stephenson 2-18 -> black hole, or Great Wall -> CMB are BLOCKING even if the replacement looks cinematic.
   - If the current words are anaphoric ("it", "this star", "nó", "thiên thể này"), use context_ref only to resolve the already-introduced referent, never to import a later referent.

16. FUTURE SUBJECT / LATER-CLAUSE LEAK LOCK — ZERO TOLERANCE
   - The supplied later scenes are visible ONLY so you can detect what has not been introduced yet. They are forbidden as creative source material for the current scene.
   - For each scene N, do not show a named subject, conclusion, event, location, mechanism or reveal that narration first introduces in N+1 or later.
   - A teaser silhouette is also leakage if it visually identifies the future subject before the current voiceover does.

17. SCIENTIFIC TIME-SCALE + GENERATIVE COUNT RELIABILITY
   - Do not make astronomical/geological/cosmological processes visibly race across 4/6/8 seconds unless the current narration explicitly calls for a time-compressed scientific visualization.
   - For real-time documentary shots, large celestial structures are effectively stable; create motion with camera parallax, atmosphere, dust, plasma detail, lens/focus behavior or local physically plausible motion instead of fake fast orbital/galactic evolution.
   - Do not ask Veo to render an exact large count of repeated objects (e.g. 109, 760, 1300 spheres). Use representative scale geometry and leave exact numerals/count graphics for post-production. Material exact-count requests are BLOCKING.

18. ABSOLUTE NO-INTERNAL-TRANSITION CONTRACT
   - The prompt must start exactly with `Create exactly one uninterrupted continuous shot in one visual setup for the entire clip.`
   - The `Negative:` clause must include the exact sequence `internal cuts, scene transitions, fades, dissolves, morph transitions, montage, time jumps, location changes, visual-domain changes`.
   - The positive prompt must describe exactly ONE uninterrupted continuous take in ONE visual setup for the entire clip.
   - No cut, fade, dissolve, crossfade, wipe, morph, transform-to-new-scene, montage, split-screen, flashback, time jump, location jump, visual-domain change, scale-journey that effectively becomes another setup, or second shot.
   - Camera movement/reveal/focus change is allowed only inside the same physical/simulated setup and same representational domain.
   - Wording such as "then", "next", "followed by", "meanwhile", "later", or "another shot" is a strong failure signal because it schedules multiple beats/setups inside one generated clip.

Return ONLY valid JSON in this exact shape:
{{
  "summary": {{
    "pass": true,
    "blocking_count": 0,
    "warning_count": 0,
    "reason": "short overall assessment"
  }},
  "scenes": [
    {{
      "scene": 1,
      "pass": true,
      "severity": "ok",
      "fidelity_score": 0.95,
      "locality_score": 0.95,
      "progression_score": 0.95,
      "continuity_score": 0.95,
      "identity_score": 0.95,
      "physics_score": 0.95,
      "single_shot_score": 0.95,
      "cinematic_craft_score": 0.95,
      "epistemic_score": 0.95,
      "visual_domain_score": 0.95,
      "evidence_visualization_score": 0.95,
      "subject_lock_score": 0.95,
      "future_leak_score": 0.95,
      "time_scale_score": 0.95,
      "transition_free_score": 0.95,
      "reason": "specific concise reason tied to the current narration beat",
      "fix_direction": "empty when pass; precise visual correction when not pass"
    }}
  ]
}}

Severity must be one of: ok, warning, blocking.
Scores must be realistic floats between 0.0 and 1.0 (e.g. 0.90-1.0 for high alignment, lower when deficient).
Use `blocking` for any material contradiction/miss of current voiceover, named-subject substitution, later-clause/future-subject leakage, continuity_ref future-content leakage, wrong side of an argument, speculative content shown as confirmed, identity drift, implausible continuity/physics/time-scale contradiction, hidden visual-domain transformation, unreliable exact large-count rendering request, evidence-overclaim/visual-verdict, positive↔Negative contradiction, or any internal transition/multi-shot construction.
Use `warning` only when the scene is semantically correct but could be more specific/cinematic.
Every supplied scene number must appear exactly once in the output.
"""


def validate_ai_result(result, expected_scene_numbers):
    if not isinstance(result, dict):
        return False, "AI output is not an object"
    rows = result.get("scenes")
    summary = result.get("summary")
    if not isinstance(rows, list) or not isinstance(summary, dict):
        return False, "AI output missing summary/scenes"
    if not isinstance(summary.get("pass"), bool):
        return False, "AI summary.pass must be boolean"
    if not isinstance(summary.get("blocking_count"), int) or isinstance(summary.get("blocking_count"), bool):
        return False, "AI summary.blocking_count must be integer"
    if not isinstance(summary.get("warning_count"), int) or isinstance(summary.get("warning_count"), bool):
        return False, "AI summary.warning_count must be integer"
    seen = []
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("scene"), int):
            return False, "AI output contains an invalid scene review"
        seen.append(row["scene"])
        if not isinstance(row.get("pass"), bool):
            return False, f"scene {row.get('scene')} pass must be boolean"
        if row.get("severity") not in {"ok", "warning", "blocking"}:
            return False, f"scene {row.get('scene')} has invalid severity"
        if not isinstance(row.get("reason"), str):
            return False, f"scene {row.get('scene')} reason must be string"
        if not isinstance(row.get("fix_direction"), str):
            return False, f"scene {row.get('scene')} fix_direction must be string"
        for key in SCORE_KEYS:
            val = row.get(key)
            if isinstance(val, str):
                try:
                    val_f = float(val.strip().rstrip("%"))
                    val = val_f
                except ValueError:
                    pass
            if isinstance(val, (int, float)) and not isinstance(val, bool):
                if 1.0 < val <= 10.0:
                    val = val / 10.0
                elif 10.0 < val <= 100.0:
                    val = val / 100.0
                row[key] = val
            if not isinstance(val, (int, float)) or isinstance(val, bool) or not (0 <= val <= 1):
                return False, f"scene {row.get('scene')} has invalid {key}"
    if seen != expected_scene_numbers:
        return False, f"AI scene list mismatch: expected {expected_scene_numbers}, got {seen}"
    blocking_rows = sum(1 for row in rows if row.get("severity") == "blocking" or row.get("pass") is False)
    warning_rows = sum(1 for row in rows if row.get("severity") == "warning" and row.get("pass") is True)
    summary["blocking_count"] = blocking_rows
    summary["warning_count"] = warning_rows
    summary["pass"] = (blocking_rows == 0)
    return True, ""


def review_batch(vb, batch, model, previous_scenes, next_scenes, claim_evidence=None):
    prompt = build_prompt(vb, batch, previous_scenes, next_scenes, claim_evidence)
    result = call_ai_model(prompt, model)
    if not result:
        return None, "AI call returned no usable JSON"
    if isinstance(result, dict) and "summary" not in result and "scenes" not in result:
        for key in ("result", "output", "text", "message"):
            candidate = result.get(key)
            if isinstance(candidate, str):
                try:
                    result = json.loads(candidate)
                    break
                except json.JSONDecodeError:
                    pass
    valid, reason = validate_ai_result(result, [s["scene"] for s in batch])
    if not valid:
        print(f"DEBUG: validation failed: {reason}, raw result:\n{json.dumps(result, ensure_ascii=False, indent=2)}", file=sys.stderr)
        return None, reason
    return result, ""


def is_blocking(row):
    if row.get("severity") == "blocking" or not row.get("pass", False):
        return True
    for key, threshold in BLOCK_THRESHOLDS.items():
        if row.get(key, 0) < threshold:
            return True
    return False



def record_semantic_pass(folder, scenes, model, master_path, vb_path):
    """Write/update a hash-bound PASS receipt for an exact reviewed range."""
    if not scenes:
        return None
    start, end = int(scenes[0]["scene"]), int(scenes[-1]["scene"])
    data = load_receipts(folder)
    receipts = [r for r in data.get("receipts", []) if not (r.get("start") == start and r.get("end") == end)]
    from datetime import datetime, timezone, timedelta
    receipts.append({
        "start": start,
        "end": end,
        "status": "pass",
        "ai_model": model,
        "semantic_ruleset": CURRENT_SEMANTIC_RULESET,
        "scene_payload_sha256": scene_payload_hash(scenes),
        "master_script_sha256": sha256_file(master_path),
        "visual_bible_sha256": sha256_file(vb_path),
        "passed_at_vn": datetime.now(timezone(timedelta(hours=7))).isoformat(),
    })
    data = {
        "video_folder": folder.name,
        "receipts": sorted(receipts, key=lambda r: (int(r.get("start", 0)), int(r.get("end", 0))))
    }
    return write_receipts(folder, data)

def main():
    parser = argparse.ArgumentParser(description="AI-assisted semantic QA for final Veo scene prompts")
    parser.add_argument("--folder", required=True, help="Final video output folder")
    parser.add_argument("--ai-model", required=True, choices=["agy", "codex", "manual"])
    parser.add_argument("--batch-size", type=int, default=6, help="Scenes per AI review call (default 6, max 8)")
    parser.add_argument("--scene-start", type=int, help="Optional first scene number for batch-scoped review")
    parser.add_argument("--scene-end", type=int, help="Optional last scene number for batch-scoped review")
    parser.add_argument("--json-output", action="store_true")
    args = parser.parse_args()

    folder = Path(args.folder)
    if not folder.exists():
        print(f"ERROR: folder not found: {folder}", file=sys.stderr)
        sys.exit(2)
    if args.batch_size < 1 or args.batch_size > 8:
        print("ERROR: --batch-size must be 1..8", file=sys.stderr)
        sys.exit(2)
    if (args.scene_start is None) ^ (args.scene_end is None):
        print("ERROR: --scene-start and --scene-end must be supplied together", file=sys.stderr)
        sys.exit(2)
    if args.scene_start is not None and (args.scene_start < 1 or args.scene_end < args.scene_start):
        print("ERROR: invalid scene range", file=sys.stderr)
        sys.exit(2)
    if args.ai_model == "manual":
        print("MANUAL_REVIEW_REQUIRED: --ai-model manual does not run semantic QA", file=sys.stderr)
        sys.exit(3)

    vb_path = folder / "visual_bible.json"
    master_path = folder / "master_script.txt"
    if not vb_path.exists() or not master_path.exists():
        print("ERROR: visual_bible.json and master_script.txt are required", file=sys.stderr)
        sys.exit(2)
    try:
        vb = load_json(vb_path)
        full_scenes = all_scenes(folder)
    except Exception as exc:
        print(f"ERROR: cannot load QA inputs: {exc}", file=sys.stderr)
        sys.exit(2)
    if not full_scenes:
        print("ERROR: no chapter scenes found", file=sys.stderr)
        sys.exit(2)

    claim_evidence = None
    project_root = folder.parent.parent.parent
    claim_path = project_root / "data" / ".agent_runtime" / "_claim_evidence.json"
    if claim_path.exists():
        try:
            claim_evidence = load_json(claim_path)
        except Exception as exc:
            print(f"ERROR: cannot load Claim Evidence Lock ledger: {exc}", file=sys.stderr)
            sys.exit(2)

    scene_to_index = {s["scene"]: i for i, s in enumerate(full_scenes)}
    if args.scene_start is not None:
        expected = list(range(args.scene_start, args.scene_end + 1))
        missing = [n for n in expected if n not in scene_to_index]
        if missing:
            print(f"ERROR: requested scene range contains missing scenes: {missing}", file=sys.stderr)
            sys.exit(2)
        scenes = [full_scenes[scene_to_index[n]] for n in expected]
    else:
        scenes = full_scenes

    reviews = []
    passed_ai_batches = []
    for local_start in range(0, len(scenes), args.batch_size):
        batch = scenes[local_start:local_start + args.batch_size]
        first_global_idx = scene_to_index[batch[0]["scene"]]
        last_global_idx = scene_to_index[batch[-1]["scene"]]
        previous = full_scenes[max(0, first_global_idx - 2):first_global_idx]
        next_scenes = full_scenes[last_global_idx + 1:last_global_idx + 1 + FUTURE_LOOKAHEAD_SCENES]
        result, reason = review_batch(vb, batch, args.ai_model, previous, next_scenes, claim_evidence)
        if result is None:
            print(f"MANUAL_REVIEW_REQUIRED: semantic batch starting at scene {batch[0]['scene']} failed: {reason}", file=sys.stderr)
            sys.exit(3)
        batch_rows = result["scenes"]
        batch_blocking = [r for r in batch_rows if is_blocking(r)]
        if result.get("summary", {}).get("pass") is not True and not batch_blocking:
            # Never let a contradictory AI response create a PASS receipt.
            first = dict(batch_rows[0])
            first["pass"] = False
            first["severity"] = "blocking"
            first["reason"] = "AI batch summary reported FAIL despite no row-level blocking issue: " + str(result.get("summary", {}).get("reason", "unspecified global semantic inconsistency"))
            first["fix_direction"] = "Review the whole batch for the global inconsistency and rerun semantic QA; inconsistent AI verdicts cannot be accepted."
            batch_rows = [first] + batch_rows[1:]
            batch_blocking = [first]
        reviews.extend(batch_rows)
        if not batch_blocking:
            record_semantic_pass(folder, batch, args.ai_model, master_path, vb_path)
            passed_ai_batches.append((batch[0]["scene"], batch[-1]["scene"]))

    blocking = [r for r in reviews if is_blocking(r)]
    warnings = [r for r in reviews if r.get("severity") == "warning" and r not in blocking]
    output = {
        "pass": len(blocking) == 0,
        "blocking_count": len(blocking),
        "warning_count": len(warnings),
        "scenes_reviewed": len(reviews),
        "scene_range": [reviews[0]["scene"], reviews[-1]["scene"]] if reviews else None,
        "blocking_scenes": blocking,
        "warnings": warnings,
    }

    # When the caller requested an exact deterministic micro-batch range, write
    # one receipt for that whole range as well. This keeps the hard chain valid
    # even when --batch-size internally subdivides an allowed 7-8 scene range.
    if not blocking and args.scene_start is not None:
        receipt = record_semantic_pass(folder, scenes, args.ai_model, master_path, vb_path)
        output["semantic_receipt"] = str(receipt) if receipt else None

    if args.json_output:
        print(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        print("=" * 72)
        print("SCENE SEMANTIC QA")
        print("=" * 72)
        print(f"Scenes reviewed: {len(reviews)}")
        if reviews:
            print(f"Range: {reviews[0]['scene']}..{reviews[-1]['scene']}")
        print(f"Blocking: {len(blocking)} | Warnings: {len(warnings)}")
        for row in blocking[:12]:
            failed = [f"{k}<{v:.2f}" for k, v in BLOCK_THRESHOLDS.items() if row.get(k, 0) < v]
            suffix = f" [{', '.join(failed)}]" if failed else ""
            print(f"❌ Scene {row['scene']}: {row.get('reason', '')}{suffix}")
            if row.get("fix_direction"):
                print(f"   Fix: {row['fix_direction']}")
        for row in warnings[:8]:
            print(f"⚠️  Scene {row['scene']}: {row.get('reason', '')}")
        if not blocking:
            print("✅ Semantic scene-to-narration QA passed")

    sys.exit(1 if blocking else 0)


if __name__ == "__main__":
    main()
