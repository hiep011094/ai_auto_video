"""Persist verified QA inputs outside canonical project JSON and temporary runtime."""
import hashlib
import json
import os
import uuid
from pathlib import Path
STEMS=['_editorial_message_lock','_editorial_semantic_receipt','_claim_evidence','_claim_evidence_content_receipt','_veo_progress','_veo_semantic_receipts']
def archive_dir(folder):
    folder=Path(folder).resolve()
    return folder.parent.parent / '.quality_receipts' / folder.parent.name / folder.name

def atomic_json(target, data):
    target=Path(target);target.parent.mkdir(parents=True,exist_ok=True)
    temp=target.with_name('.tmp_'+uuid.uuid4().hex+'.json')
    try:
        with temp.open('x',encoding='utf-8') as stream:
            json.dump(data,stream,ensure_ascii=False,indent=2);stream.flush();os.fsync(stream.fileno())
        os.replace(temp,target)
    finally:
        if temp.exists(): temp.unlink()

def atomic_bytes(target, raw_bytes):
    target=Path(target);target.parent.mkdir(parents=True,exist_ok=True)
    temp=target.with_name('.tmp_'+uuid.uuid4().hex)
    try:
        temp.write_bytes(raw_bytes)
        os.replace(temp,target)
    finally:
        if temp.exists(): temp.unlink()

def runtime_file(folder, stem, scoped_only=False):
    folder=Path(folder).resolve();runtime=folder.parent.parent/'.agent_runtime'
    scoped=runtime/f'{stem}_{folder.name}.json'
    if scoped.exists(): return scoped
    saved=archive_dir(folder)/f'{stem}.json'
    manifest=archive_dir(folder)/'manifest.json'
    if saved.exists() and manifest.exists():
        try:
            data=json.loads(manifest.read_text(encoding='utf-8'))
            script_hash=hashlib.sha256((folder/'master_script.txt').read_bytes()).hexdigest()
            saved_hash=hashlib.sha256(saved.read_bytes()).hexdigest()
            if data.get('script_sha256')==script_hash and data.get('files',{}).get(saved.name)==saved_hash:return saved
        except (OSError,ValueError): pass
    return scoped if scoped_only else runtime/f'{stem}.json'

def archive_verified_inputs(folder):
    """Call ONLY after all final QA gates pass; receipt validators still run on reuse."""
    folder=Path(folder).resolve();destination=archive_dir(folder);files={}
    for stem in STEMS:
        source=runtime_file(folder,stem,stem.startswith('_veo_'))
        if not source.exists(): continue
        raw_bytes=source.read_bytes()
        target=destination/f'{stem}.json'
        atomic_bytes(target,raw_bytes)
        files[target.name]=hashlib.sha256(raw_bytes).hexdigest()
    atomic_json(destination/'manifest.json',{'version':1,'script_sha256':hashlib.sha256((folder/'master_script.txt').read_bytes()).hexdigest(),'files':files})
