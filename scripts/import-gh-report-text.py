"""Import generic original report copy only; private evidence is read-only.

The public allowlist contains no people, answers, reports or database identifiers
other than generic item/template IDs. DB regression vectors stay under .local.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
V7 = ROOT / '.local/gh-evidence-v22/nested/69514a5ee1856e78/20260930-高禾报告触发规则与C4Top闭环证据包-v7/证据'
REPLAY = ROOT / '.local/gh-evidence-v22/baselines/v14/v9新增证据/证据/type4-result-rule-replay-v9.json'
TRIGGER = ROOT / '.local/gh-evidence-v22/baselines/v14/v9新增证据/原始证据/source-v9/EvaluateTaskServiceImpl-type4-source-excerpt-v9.java'
OUT = ROOT / 'packages/assessment-engine/data/gh-report-text-v1.json'
PRIVATE = ROOT / '.local/gh-report-text'
PRIVATE.mkdir(exist_ok=True)

def load(path):
    return json.loads(path.read_text())

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def item_copy(rows):
    selected = []
    for r in rows:
        tid = int(r['etid'])
        if tid == 2:
            selected.append({'item': int(r['eiid']), 'type': tid, 'parent': int(r['pid']), 'name': r['name'], 'text': r.get('introduce') or ''})
        elif tid == 5:
            selected.append({'item': int(r['eiid']), 'type': tid, 'parent': int(r['pid']), 'name': r['ename'], 'text': r.get('resultAdvantage') or ''})
        elif tid == 28:
            marker = '典型岗位：'
            assert marker in r['result'], r['eiid']
            jobs = r['result'].split(marker, 1)[1].strip().rstrip('。')
            selected.append({'item': int(r['eiid']), 'type': tid, 'parent': int(r['pid']), 'name': r['name'], 'text': jobs})
    return sorted(selected, key=lambda r: (r['type'], r['item']))

items_path = V7 / 'C8EvaluateItem.current.json'
results_path = V7 / 'C8EvaluateResult.current.json'
original_hashes = {p: sha(p) for p in [items_path, results_path, REPLAY, TRIGGER]}
items = item_copy(load(items_path))
results = [{'id': int(r['erid']), 'type': int(r['typeid']), 'code': r['ename'], 'name': r['name'],
            'text': r.get('resultdata') or '', 'temperament_name': r.get('name2') or ''}
           for r in load(results_path) if int(r['typeid']) in [3, 4]]
assert len(results) == 152
assert len([r for r in items if r['type'] == 2 and r['parent']]) == 34
assert all(r['text'] for r in items if r['type'] != 2 or r['parent'])
assert len([r for r in items if r['type'] == 5]) == 8
assert len([r for r in items if r['type'] == 28]) == 8
assert len({r['id'] for r in results}) == len(results)

# Search all extracted supplied copies, recording version conflicts rather than
# silently mixing old and current fields. Exact duplicate files are counted once.
copies, seen = [], set()
for path in (ROOT / '.local').rglob('C8EvaluateItem.current.json'):
    digest = sha(path)
    if digest in seen:
        continue
    seen.add(digest)
    other = item_copy(load(path))
    changed = [r['item'] for r in items if next((o for o in other if o['item'] == r['item']), None) != r]
    copies.append({'path': str(path.relative_to(ROOT)), 'sha256': digest, 'different_selected_items': changed})

cfg = {'version': 'gh-original-report-copy-v1',
       'basis': 'Original C8EvaluateResult + C8EvaluateItem; source/DB type4 rules; not generated narrative.',
       'items': items, 'results': results,
       'counts': {'strength_short_texts': 34, 'value_texts': 8, 'role_job_texts': 8, 'temperaments': 4, 'motivation_templates': 131},
       'source_sha256': {p.name: h for p, h in original_hashes.items()}}
OUT.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')
selected_types = {'DWork', 'DJob', 'DThink', 'DTopAndLow', 'D3TOP'}
fixtures = []
for sample in load(REPLAY)['records']:
    expected = [v for field in sample['fieldResults'] if field['type'] in selected_types for v in field['stored']]
    assert len(expected) == 5 and all(field['pass'] for field in sample['fieldResults'])
    fixtures.append({'inputs': [{'code': r['ename'], 'raw': float(r['score'])} for r in sample['inputs']],
                     'expected': [{'type': r['type'], 'id': r['resultId'], 'value': r['resultValue']} for r in expected]})
(PRIVATE / 'regression.json').write_text(json.dumps(fixtures, ensure_ascii=False, indent=2) + '\n')
(PRIVATE / 'import-audit.json').write_text(json.dumps({'selected_source': str(V7.relative_to(ROOT)), 'item_dictionary_copies': copies,
                                                     'db_motivation_records': len(fixtures), 'originals_unchanged': all(sha(p) == h for p, h in original_hashes.items())}, ensure_ascii=False, indent=2) + '\n')
assert all(sha(p) == h for p, h in original_hashes.items())
print(json.dumps({'status': 'PASS', 'counts': cfg['counts'], 'distinct_item_dictionary_copies': len(copies),
                  'db_motivation_records': len(fixtures), 'originals_unchanged': True}, ensure_ascii=False))
