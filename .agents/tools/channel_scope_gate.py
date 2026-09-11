#!/usr/bin/env python3
"""Deterministic channel scope guard; independent editorial QA judges actual meaning."""
import argparse
import json
import re
import unicodedata
from pathlib import Path
PROFILE = Path(__file__).resolve().parents[2] / 'config' / 'channel_config.json'
def normalize(value):
    value = unicodedata.normalize('NFD', value.lower()).replace('đ','d')
    return ' '.join(re.sub(r'[^a-z0-9]+', ' ', ''.join(c for c in value if not unicodedata.combining(c))).split())
def has_buddhist_focus(text):
    signals = json.loads(PROFILE.read_text(encoding='utf-8'))['topic_signals']
    value = ' ' + normalize(text) + ' '
    return any(' '+normalize(signal)+' ' in value for signal in signals)
def validate_scope(script, title='', language='vi'):
    issues=[]
    if language!='vi': issues.append('Kênh chỉ sản xuất tiếng Việt.')
    if not has_buddhist_focus(script): issues.append('Kịch bản chưa thể hiện chủ đề Phật giáo.')
    normalized_words=set(normalize(script).split())
    vietnamese={'va','cua','trong','la','mot','khi','ta','nguoi','khong','nhung','duoc','de','tam','phat','tu','bi','voi'}
    if len(normalized_words & vietnamese)<4 or not re.search(r'[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]',script,re.I):
        issues.append('Lời dẫn phải là tiếng Việt có dấu; cần kiểm tra lại ngôn ngữ.')
    if title and not has_buddhist_focus(title+' '+script[:1000]): issues.append('Tiêu đề và mở đầu chưa liên hệ rõ với Phật giáo.')
    return issues

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--script',required=True);ap.add_argument('--title',default='');ap.add_argument('--language',default='vi');args=ap.parse_args()
    issues=validate_scope(Path(args.script).read_text(encoding='utf-8'),args.title,args.language)
    for issue in issues: print('FAIL: '+issue)
    if not issues: print('PASS: Vietnamese Buddhist scope. Independent semantic review is still required.')
    return 1 if issues else 0
if __name__=='__main__': raise SystemExit(main())
