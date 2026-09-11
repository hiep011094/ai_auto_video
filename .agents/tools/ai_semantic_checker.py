#!/usr/bin/env python3
"""
AI Semantic Duplicate Checker
Uses LLM reasoning to detect semantic duplicates beyond keyword matching

This tool enhances topic_uniqueness_checker.py by adding AI-powered semantic analysis
to catch duplicates that simple keyword matching might miss.

Usage:
    python ai_semantic_checker.py --new-topic "Topic" --history database/history.json --ai-model agy
    
Returns:
    Exit 0: Semantically unique
    Exit 1: Semantic duplicate detected
    JSON output with reasoning
"""

import json
import re
import sys
import argparse
import subprocess
from pathlib import Path
from typing import List, Dict, Tuple, Optional

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


SCRIPT_DIR = Path(__file__).resolve().parent


def load_history(history_path: str) -> List[Dict]:
    """Load topics from history.json"""
    try:
        with open(history_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        # database/history.json is a top-level ARRAY of entries (see
        # .agents/03_data_schemas.md §1) — NOT an object with a "topics" key.
        # Support the array form (correct/expected) and, defensively, an
        # {"topics": [...]} wrapper in case an older/alternate export is passed.
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return data.get('topics', [])
        print(f"ERROR: unexpected root type in {history_path} (expected a JSON array)", file=sys.stderr)
        return []
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"ERROR: Cannot load history: {e}", file=sys.stderr)
        return []


def format_history_for_ai(topics: List[Dict], limit: int = 50) -> str:
    """Format recent topics for AI analysis"""
    # Get most recent N topics
    recent = sorted(topics, key=lambda x: x.get('date', ''), reverse=True)[:limit]
    
    formatted = []
    for i, topic in enumerate(recent, 1):
        title = topic.get('title', 'N/A')
        content = topic.get('main_video_content', 'N/A')
        date = topic.get('date', 'N/A')[:10]  # YYYY-MM-DD only
        vid_type = topic.get('type', 'short')
        lang = topic.get('language', 'vi')
        
        formatted.append(
            f"{i}. [{date}] {title}\n"
            f"   Content: {content}\n"
            f"   Type: {vid_type}, Lang: {lang}"
        )
    
    return "\n\n".join(formatted)


def build_ai_prompt(new_topic: str, history_formatted: str) -> str:
    """Build prompt for AI semantic analysis"""
    
    prompt = f"""You are an expert content analyst for a YouTube channel about Buddhist wisdom, dharma teachings, and contemplative living.

Your task: Analyze if a NEW TOPIC semantically duplicates any EXISTING VIDEOS.

## NEW TOPIC to evaluate:
"{new_topic}"

## EXISTING VIDEOS (most recent 50):

{history_formatted}

---

## ANALYSIS INSTRUCTIONS:

Check for SEMANTIC duplication, not just keyword matching. Consider:

1. **Core Concept**: Do they cover the same fundamental idea?
   - Example: "Black hole eating star" vs "Star being consumed by black hole" = DUPLICATE
   - Example: "Supermassive black hole" vs "Stellar black hole" = DIFFERENT (different types)

2. **Pattern Repetition**: Is this following a repetitive pattern?
   - Example: "Most extreme planet" videos after already having 3+ "extreme planet" videos = DUPLICATE PATTERN
   - Example: "If [X happens] would [Y]?" pattern repeating = DUPLICATE PATTERN

3. **Angle Similarity**: Even if different wording, is the viewer experience similar?
   - Example: "Mystery of Mars water" vs "Did Mars have water?" = SAME ANGLE
   - Example: "Mars water discovery" vs "Mars life possibility" = DIFFERENT ANGLES

4. **Language Doesn't Matter**: Vietnamese and English versions of same topic = DUPLICATE
   - Example: "Hố đen khổng lồ" and "Supermassive black hole" = DUPLICATE

5. **Specific vs General**: More specific angle of same topic = OK if adds value
   - Example: Already have "James Webb discoveries" → New "James Webb finds oldest galaxy" = OK (specific)
   - Example: Already have "Voyager 1 mission" → New "Voyager 1 status update" = OK (time-based update)

## OUTPUT FORMAT (JSON only):

{{
  "is_duplicate": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "Explain why duplicate or not in 2-3 sentences",
  "similar_videos": [
    {{
      "title": "Most similar existing video title",
      "similarity_reason": "Why this is similar"
    }}
  ],
  "recommendation": "PROCEED / MODIFY_ANGLE / REJECT",
  "suggested_angles": [
    "Alternative angle 1 if duplicate",
    "Alternative angle 2 if duplicate"
  ]
}}

## IMPORTANT RULES:

- Be strict on pattern repetition (e.g., 3+ "extreme planet" videos)
- Be lenient on time-based updates (e.g., "2026 update" on old topic)
- Be strict on clickbait variations (e.g., same topic, different shocking title)
- Consider viewer fatigue (too many similar topics recently)

Output ONLY valid JSON, no other text.
"""
    
    return prompt


def _parse_json_text(text: str) -> Optional[Dict]:
    """Parse a model response robustly without accepting prose as success."""
    if not text:
        return None
    t = text.strip()
    if t.startswith('```'):
        t = re.sub(r'^```(?:json)?\s*', '', t)
        t = re.sub(r'\s*```$', '', t)
    try:
        obj = json.loads(t)
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        # Some CLIs wrap the answer with logs. Extract the outermost JSON object
        # conservatively instead of silently treating malformed output as PASS.
        first, last = t.find('{'), t.rfind('}')
        if first >= 0 and last > first:
            try:
                obj = json.loads(t[first:last + 1])
                return obj if isinstance(obj, dict) else None
            except json.JSONDecodeError:
                return None
        return None


def call_ai_model(prompt: str, model: str = "agy") -> Optional[Dict]:
    """Call the configured AI classifier with bounded retry/backoff.

    V8 retries transient timeout/CLI/parse failures twice before returning None.
    It never converts a failed call into a semantic PASS.
    """
    if model == "manual":
        print("INFO: --ai-model manual — skipping automated AI call, flagging for human review", file=sys.stderr)
        return {
            'is_duplicate': False,
            'confidence': 0.0,
            'reasoning': 'Manual mode: no AI semantic check was run. A human must review this topic before proceeding.',
            'similar_videos': [],
            'recommendation': 'MANUAL_REVIEW',
            'suggested_angles': []
        }
    if model not in {"agy", "codex"}:
        print(f"ERROR: Unknown AI model: {model}", file=sys.stderr)
        return None

    import tempfile
    import time
    attempts = 2
    last_error = "unknown failure"
    for attempt in range(1, attempts + 1):
        tmp_out = None
        try:
            if model == "agy":
                result = subprocess.run(
                    ['agy', '--output-format', 'json', '--input-format', 'text'],
                    input=prompt,
                    capture_output=True,
                    text=True,
                    encoding='utf-8',
                    timeout=300,
                )
                if result.returncode == 0 and result.stdout.strip():
                    wrapper = _parse_json_text(result.stdout)
                    if isinstance(wrapper, dict) and 'response' in wrapper:
                        parsed = _parse_json_text(str(wrapper.get('response', '')))
                    else:
                        parsed = wrapper
                    if parsed is not None:
                        return parsed
                    last_error = "agy returned unparsable JSON"
                else:
                    last_error = (result.stderr or f"agy exited {result.returncode}").strip()
            else:
                with tempfile.NamedTemporaryFile(mode='w', suffix='.out', delete=False, encoding='utf-8') as f:
                    tmp_out = Path(f.name)
                result = subprocess.run(
                    ['codex', 'exec', '--json', '-o', str(tmp_out), prompt],
                    capture_output=True,
                    text=True,
                    encoding='utf-8',
                    timeout=300,
                )
                if result.returncode == 0:
                    if tmp_out.exists():
                        parsed = _parse_json_text(tmp_out.read_text(encoding='utf-8'))
                        if parsed is not None:
                            return parsed
                    # Fallback to JSONL stdout only when the explicit output file
                    # did not contain a usable final answer.
                    for line in reversed([x.strip() for x in result.stdout.splitlines() if x.strip()]):
                        parsed = _parse_json_text(line)
                        if parsed is not None:
                            return parsed
                    last_error = "codex returned no usable JSON answer"
                else:
                    last_error = (result.stderr or f"codex exited {result.returncode}").strip()
        except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError, OSError) as exc:
            last_error = str(exc)
        finally:
            if tmp_out is not None:
                try:
                    tmp_out.unlink(missing_ok=True)
                except Exception:
                    pass
        if attempt < attempts:
            print(f"WARNING: {model} semantic call attempt {attempt}/{attempts} failed: {last_error}; retrying once", file=sys.stderr)
            time.sleep(1.0)

    print(f"ERROR calling {model} after {attempts} attempts: {last_error}", file=sys.stderr)
    return None

def analyze_semantic_duplication(
    new_topic: str,
    history_path: str,
    ai_model: str = "agy"
) -> Tuple[bool, Dict]:
    """
    Main analysis function using AI reasoning
    
    Returns:
        (is_unique, analysis_result)
    """
    
    # Load history
    topics = load_history(history_path)
    if not topics:
        return True, {
            'is_duplicate': False,
            'confidence': 1.0,
            'reasoning': 'No history found, topic is unique by default',
            'recommendation': 'PROCEED'
        }
    
    # Format history for AI
    history_formatted = format_history_for_ai(topics)
    
    # Build prompt
    prompt = build_ai_prompt(new_topic, history_formatted)
    
    # Call AI
    print("🤖 Analyzing with AI semantic reasoning...", file=sys.stderr)
    result = call_ai_model(prompt, ai_model)
    
    if not result:
        # IMPORTANT: do NOT silently default to "unique" here. This used to
        # return confidence=0.5 / recommendation='PROCEED_WITH_CAUTION',
        # which is high/ambiguous enough that check_topic_duplicate.py's
        # combine_results() would route it straight to Case 5
        # ("both checks say unique" -> PROCEED) with no visible warning
        # that the AI check never actually ran. A failed call (bad flags,
        # no network, timeout, unparsable JSON, etc.) must be
        # distinguishable from a real "AI confirmed unique" result.
        print("WARNING: AI semantic check did not run (call failed) — "
              "flagging for manual review instead of assuming uniqueness",
              file=sys.stderr)
        return True, {
            'is_duplicate': False,
            'confidence': 0.0,
            'reasoning': 'AI analysis failed to run (see stderr for the underlying error) — this is NOT a confirmed-unique result.',
            'recommendation': 'MANUAL_REVIEW',
            'ai_check_failed': True
        }
    
    # Parse result
    is_duplicate = result.get('is_duplicate', False)
    is_unique = not is_duplicate
    
    return is_unique, result


def main():
    parser = argparse.ArgumentParser(
        description='AI-powered semantic duplicate checker'
    )
    parser.add_argument(
        '--new-topic',
        required=True,
        help='New topic to check'
    )
    parser.add_argument(
        '--history',
        default='database/history.json',
        help='Path to history.json'
    )
    parser.add_argument(
        '--ai-model',
        default='agy',
        choices=['agy', 'codex', 'manual'],
        help='AI model to use for analysis'
    )
    parser.add_argument(
        '--combine-with-keyword',
        action='store_true',
        help='Also run keyword-based checker and combine results'
    )
    
    args = parser.parse_args()
    
    # Run AI semantic analysis
    is_unique, analysis = analyze_semantic_duplication(
        args.new_topic,
        args.history,
        args.ai_model
    )
    
    # Optionally combine with keyword checker
    if args.combine_with_keyword:
        try:
            # Run keyword checker
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_DIR / 'topic_uniqueness_checker.py'),
                    '--new-topic', args.new_topic,
                    '--history', args.history,
                    '--json-output'
                ],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                keyword_result = json.loads(result.stdout)
                keyword_unique = keyword_result.get('is_unique', True)
                
                # Combine: If either says duplicate, it's duplicate
                is_unique = is_unique and keyword_unique
                
                # Add keyword info to analysis
                analysis['keyword_check'] = keyword_result
            
        except Exception as e:
            print(f"WARNING: Keyword check failed: {e}", file=sys.stderr)
    
    # Output results
    print(json.dumps({
        'is_unique': is_unique,
        'ai_analysis': analysis,
        'new_topic': args.new_topic
    }, ensure_ascii=False, indent=2))
    
    # Exit code
    # 0 = AI confirmed unique
    # 1 = AI detected a duplicate
    # 3 = AI check did not actually run (call failed, or --ai-model manual)
    #     — the caller must not treat this the same as exit 0.
    if analysis.get('ai_check_failed') or analysis.get('recommendation') == 'MANUAL_REVIEW':
        sys.exit(3)
    sys.exit(0 if is_unique else 1)


if __name__ == '__main__':
    main()
