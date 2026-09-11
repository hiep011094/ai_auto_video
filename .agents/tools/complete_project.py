#!/usr/bin/env python3
"""Validate final project and atomically record Step 11 history under a shared lock."""
import argparse
import json
import os
import subprocess
import sys
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from quality_archive import atomic_json
ROOT=Path(__file__).resolve().parents[2]
@contextmanager
def file_lock(target,timeout=10):
    lock=Path(str(target)+'.lock');lock.parent.mkdir(parents=True,exist_ok=True);token=uuid.uuid4().hex;deadline=time.monotonic()+timeout
    while True:
        try:
            with lock.open('x',encoding='utf-8') as stream: json.dump({'pid':os.getpid(),'token':token},stream)
            break
        except FileExistsError:
            if time.monotonic()>=deadline: raise RuntimeError('History is locked; retry after the active writer finishes.')
            time.sleep(.04)
    try: yield
    finally:
        if json.loads(lock.read_text(encoding='utf-8')).get('token')==token:lock.unlink()

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--folder',required=True);ap.add_argument('--task-id',required=True);ap.add_argument('--entry-file',required=True,help='Runtime JSON containing one complete history.schema.json entry.');args=ap.parse_args()
    folder=Path(args.folder).resolve();entry=json.loads(Path(args.entry_file).read_text(encoding='utf-8-sig'))
    if entry.get('type') not in ('short','long'):raise ValueError('Invalid project type')
    canonical=(ROOT/'data'/f"video_{entry['type']}"/entry.get('folder','')).resolve()
    parent=(ROOT/'data'/f"video_{entry['type']}").resolve()
    if folder!=canonical or folder.parent!=parent:raise ValueError('Project must be a direct child of canonical data directory')
    queue=json.loads((ROOT/'queue.json').read_text(encoding='utf-8-sig'))
    task=next((t for t in queue if t['id']==args.task_id),None)
    if not task:raise ValueError('Task does not exist')
    for field,taskfield in [('type','videoType'),('mode','mode'),('language','language'),('voiceStyle','voiceStyle'),('aiModel','aiModel')]:
        if entry.get(field)!=task.get(taskfield):raise ValueError('History does not match task: '+field)
    if task.get('category') and entry.get('category')!=task['category']:raise ValueError('Category does not match task')
    for field in ('date','created_at'):
        if not entry.get(field,'').endswith('+07:00'):raise ValueError(field+' must use Vietnam UTC+7')
    for command in [
        ['schema_validator.py','--schema',str(ROOT/'.agents/schemas/history.schema.json'),'--file',args.entry_file],
        ['qa_automation.py','--folder',str(folder),'--lang','vi','--mode',entry['mode']],
    ]:
        completed=subprocess.run([sys.executable,str(ROOT/'.agents/tools'/command[0]),*command[1:]],env={**os.environ,'PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8'})
        if completed.returncode:return completed.returncode
    history=ROOT/'database/history.json'
    with file_lock(history):
        raw=json.loads(history.read_text(encoding='utf-8-sig')) if history.exists() else []
        rows=raw if isinstance(raw,list) else raw['topics']
        same=[row for row in rows if row['id']==entry['id'] or (row.get('folder')==entry['folder'] and row.get('type')==entry['type'])]
        if same:
            if len(same)!=1 or same[0]['id']!=entry['id']:raise ValueError('Duplicate project history identity')
            rows=[{**row,**entry,**{k:v for k,v in row.items() if k.startswith(('youtube_','capcut_'))}} if row['id']==entry['id'] else row for row in rows]
        else:rows.append(entry)
        atomic_json(history,rows)
    print('PASS: final QA archived and history committed. Worker owns queue status.')
    return 0
if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception as exc:print('ERROR: '+str(exc),file=sys.stderr);raise SystemExit(2)
