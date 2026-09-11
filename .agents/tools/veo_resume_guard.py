#!/usr/bin/env python3
"""Read-only guard for resuming an interrupted, already-prepared Veo run.

This is NOT a shortcut for a deliberate GenerateVeoPrompts regeneration.
It only confirms that the current source hashes and last completed batch still
match the runtime checkpoint + semantic receipt, then prints NEXT_SCENE.
No final project field is changed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from semantic_receipts import matching_receipt


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def all_scenes(folder: Path):
    out = []
    for p in sorted(folder.glob('chapter_*.json')):
        rows = json.loads(p.read_text(encoding='utf-8'))
        if not isinstance(rows, list):
            raise ValueError(f'{p.name} is not an array')
        out.extend(rows)
    return sorted(out, key=lambda x: int(x.get('scene', 0)))


def runtime_progress(folder: Path) -> Path:
    root = folder.resolve().parent.parent.parent
    return root / 'data' / '.agent_runtime' / f'_veo_progress_{folder.name}.json'


def main() -> int:
    ap = argparse.ArgumentParser(description='Validate safe resume point for an interrupted Veo run')
    ap.add_argument('--folder', required=True)
    ap.add_argument('--json-output', action='store_true')
    a = ap.parse_args()
    folder = Path(a.folder).resolve()
    master, vb = folder / 'master_script.txt', folder / 'visual_bible.json'
    progress = runtime_progress(folder)
    if not folder.exists() or not master.exists() or not vb.exists() or not progress.exists():
        print('NOT_RESUMABLE: folder/source/checkpoint missing; use full regeneration preparation', file=sys.stderr)
        return 1
    try:
        state = json.loads(progress.read_text(encoding='utf-8'))
        scenes = all_scenes(folder)
    except Exception as exc:
        print(f'NOT_RESUMABLE: invalid runtime/project data: {exc}', file=sys.stderr)
        return 2
    if state.get('master_script_sha256') != sha256(master) or state.get('visual_bible_sha256') != sha256(vb):
        print('NOT_RESUMABLE: source hashes changed; full regeneration is required', file=sys.stderr)
        return 1
    last = int(state.get('last_completed_scene', 0) or 0)
    if last <= 0:
        print('NOT_RESUMABLE: no completed batch exists; start from scene 1', file=sys.stderr)
        return 1
    batches = sorted(state.get('batches', []), key=lambda b: (int(b.get('end', 0)), int(b.get('start', 0))))
    prior = next((b for b in reversed(batches) if int(b.get('end', 0)) == last), None)
    if not prior:
        print('NOT_RESUMABLE: checkpoint has no batch ending at last_completed_scene', file=sys.stderr)
        return 1
    ps, pe = int(prior['start']), int(prior['end'])
    by_num = {int(s.get('scene', 0)): s for s in scenes}
    try:
        batch = [by_num[n] for n in range(ps, pe + 1)]
    except KeyError:
        print('NOT_RESUMABLE: checkpoint range no longer matches chapter scenes', file=sys.stderr)
        return 1
    if matching_receipt(folder, ps, pe, batch, master, vb) is None:
        print('NOT_RESUMABLE: last deterministic batch has no current semantic PASS receipt', file=sys.stderr)
        return 1
    max_scene = max(by_num, default=0)
    next_scene = last + 1
    done = next_scene > max_scene
    out = {'resumable': True, 'last_completed_scene': last, 'next_scene': None if done else next_scene, 'all_scenes_complete': done, 'max_scene': max_scene}
    if a.json_output:
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        print(f"RESUMABLE: last_completed_scene={last}; " + ("all scenes completed" if done else f"NEXT_SCENE={next_scene}"))
    return 0


if __name__ == '__main__':
    sys.exit(main())
