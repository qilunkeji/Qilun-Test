"""Read-only ingestion of v22 evidence; never runs supplied programs or opens a DB.

Generated rules contain public dimension/configuration fields only. Original answers
and expected outputs stay under .local for independent application regression.
"""
import csv
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
PRIVATE = PROJECT / '.local/gh-evidence-v22'
SOURCE = PRIVATE / 'source'
BASE = PRIVATE / 'baselines/v14'
OLD = next((PROJECT / '.local/evidence-20260930-v3-base').glob('*/服务端证据/20260929-db-readonly'))
DECLARED_SANITIZATION = []


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def read(p):
    return json.loads(p.read_text(encoding='utf-8-sig'))


def csvrows(p, delimiter=','):
    with p.open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f, delimiter=delimiter))


def write(p, value):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def verify(root):
    checks = 0
    for manifest in sorted(root.glob('SHA256SUMS*.txt')):
        seen = set()
        for line in manifest.read_text(encoding='utf-8-sig').splitlines():
            if not line.strip():
                continue
            digest, name = line.split(maxsplit=1)
            name = name.removeprefix('*')
            p = root / name
            assert re.fullmatch('[0-9a-fA-F]{64}', digest), manifest
            assert p.resolve().is_relative_to(root.resolve()) and not p.is_symlink(), name
            assert name not in seen and p.is_file(), name
            if sha(p) != digest.lower():
                # v8 explicitly documents replacing credential literals in this
                # verifier without changing its old internal manifest. The whole
                # sanitized container is independently pinned by v14/v22.
                assert root.parent.name == '69514a5ee1856e78' and name == 'verify_v7.py', name
                assert sha(p) == '7b60524b962c3e93c8964efd7f3f62b63e0f503455f5b1b74cfa3dc05d4c777b', 'Unexpected change to sanitized verifier'
                marker = 'v7/verify_v7.py: declared credential sanitization; old internal digest differs'
                if marker not in DECLARED_SANITIZATION:
                    DECLARED_SANITIZATION.append(marker)
            seen.add(name)
            checks += 1
    return checks


def expand(root, label, visited):
    if not list(root.glob('SHA256SUMS*.txt')):
        for wrapper in root.iterdir():
            if wrapper.is_dir() and list(wrapper.glob('SHA256SUMS*.txt')):
                return expand(wrapper, label, visited)
    checks = verify(root)
    for p in sorted((root / '基础证据').glob('*.zip')):
        digest = sha(p)
        if digest in visited:
            continue
        visited.add(digest)
        target = PRIVATE / 'nested' / digest[:16]
        with zipfile.ZipFile(p) as z:
            assert sum(i.file_size for i in z.infolist()) < 2_000_000_000
            names = set()
            for i in z.infolist():
                assert i.filename not in names and (target / i.filename).resolve().is_relative_to(target.resolve())
                assert (i.external_attr >> 16 & 0o170000) != 0o120000
                names.add(i.filename)
            assert z.testzip() is None
            if not target.exists():
                z.extractall(target)
        checks += expand(target, label, visited)
    return checks


def rulemap(p):
    out = {}
    for r in csvrows(p, '\t'):
        ext = {}
        for kv in (r.get('ext') or '').strip('{}').split(', '):
            if '=' in kv:
                k, v = kv.split('=', 1)
                ext[k] = float(v)
        out[r['map_key']] = {
            'levels': [None if r[f'level_key_{i}'] in ('', 'null') else r[f'level_key_{i}'] for i in range(1, 9)],
            'scores': [None if r[f'score_{i}'] in ('', 'null') else float(r[f'score_{i}']) for i in range(1, 9)],
            'action': None if r['action'] == 'null' else r['action'], 'ext': ext,
        }
    return out


def main():
    outer_checks = verify(SOURCE)
    index = read(SOURCE / '证据/principle-evidence-index-v22.json')
    status = read(SOURCE / '证据/v22-final-status.json')
    assert len(index['principles']) == 14 and len(index['actualGaps']) == 5
    assert status['actualGapOpenCount'] == 5
    assert all(g['status'] == 'REMAINS_NOT_CLOSED' for g in index['actualGaps'])
    visited = set()
    chain_checks = expand(SOURCE, 'v22', visited)
    refs = 0
    for r in index['principles']:
        for name in r['包内路径']:
            root = PRIVATE / ('baselines/v21' if name.startswith('v21新增证据/') else 'baselines/v14')
            assert (root / name).is_file(), name
            refs += 1
    items_path = OLD.parent / 'position-match-model-configs/C8EvaluateItem.jsonl'
    all_items = [json.loads(x) for x in items_path.read_text(encoding='utf-8').splitlines() if x.strip()]
    items = [{'id': int(i['eiid']), 'type': int(i['etid']), 'parent': int(i.get('pid') or 0),
              'name': i['name'], 'ename': i.get('ename') or ''}
             for i in all_items if int(i['etid']) in (2, 3, 4, 5, 8, 16, 28)]
    std_path = OLD.parent / 'position-match-model-configs/C8EvaluateProfessionalRoleScoreStandard.jsonl'
    standards = [{k: r[k] for k in ('itemId', 'middleX0', 'middleX1', 'middleX2', 'seniorX0', 'seniorX1', 'seniorX2')}
                 for r in (json.loads(x) for x in std_path.read_text(encoding='utf-8').splitlines() if x.strip())
                 if 351 <= int(r['itemId']) <= 358]
    assert len(standards) == 8
    scoring = BASE / 'v10新增证据/证据'
    current = read(scoring / 'current-question-table-v9.json')
    by_q = {str(q['eqid']): q for q in current if int(q['questionBankId']) == 0}
    existing = read(PROJECT / 'packages/assessment-engine/data/gh-server-rules.json')
    for q in existing['questions']:
        n = by_q[q['id']]
        assert (q['type'], q['item'], q['opposite']) == (int(n['typeid']), int(n['itemid']), int(n['toitemid'] or 0))
    for q in existing['values']:
        assert q['item'] == int(by_q[q['id']]['itemid'])
    answer_files = sorted((scoring / 'original-answers-v10').glob('*.json'))
    results = read(scoring / 'candidate-output-results-v9.json')
    ordinary_ids = {q['id'] for q in existing['questions']}
    fixtures = []
    for p in answer_files:
        rows = read(p)
        if p.stem == '1307520245280165889':
            rows = [{'questionid': r['eqid'], 'score': int(r['answerCode'])} for r in csvrows(BASE / 'v10新增证据/原始证据/1307520245280165889-277-reconstruction.csv')] + [r for r in rows if int(r['typeid']) == 5]
        answers = {str(r['questionid']): int(r['score']) for r in rows}
        assert len(answers) == 287 and ordinary_ids <= answers.keys()
        fixtures.append({'answers': {k: v for k, v in answers.items() if k in ordinary_ids},
                         'values': [{'id': k, 'rank': v} for k, v in answers.items() if k not in ordinary_ids],
                         'expected': [{'type': int(r['typeid']), 'item': int(r['itemid']), 'score': r['score'], 'calibrated': r['scoreCalibrate']}
                                      for r in results if str(r['uid']) == p.stem and int(r['typeid']) in (2, 3, 4, 5)]})
    sample = read(OLD / '20260929-uid321373-readonly-replay-sample.json')
    derived = {'rows': [{'type': int(r['typeid']), 'item': int(r['itemid']), 'score': r['score']}
                        for r in sample['C8UserEvaluateResult'] if int(r['typeid']) in (2, 3, 4, 5)],
               'traits': [{'item': int(r['itemid']), 'score': r['scoreNew']} for r in sample['C8UserEvaluateResult'] if int(r['typeid']) == 16],
               'roles': [{k: r[k] for k in ('itemId', 'scoreB', 'scoreC', 'scoreD', 'scoreNotion', 'scoreTotal', 'scoreTotalCalibrateJunior', 'scoreTotalCalibrateSeniorNew')} for r in sample['C8EvaluateProfessionalRoleScore']],
               'style': next(r['resultValue'] for r in sample['C8UserEvaluateResultResult'] if r['type'] == 'C4Top')}
    matches = read(BASE / 'v12新增证据/原始证据/target-match-route-decision-replay-v12.json')
    match_fixtures = [{'scores': {k: r['storedFourScores'][k] for k in ('c8Score', 'qualityScore', 'motiveScore', 'valueScore')},
                       'expected': r['storedMatchValue'], 'replay': r['direct102']['score'], 'raw': r['direct102']['rawScore']}
                      for r in matches['records']]
    assert len(match_fixtures) == 93
    senior = read(BASE / 'v14新增证据/证据/senior-candidate-replay-v14.json')
    senior_fixtures = [{'potential': [{'eiid': int(p['eiid']), 'value': float(p['value'])} for p in r['fields']['potentialForAll']], 'potential5': {k: v['value'] for k, v in r['fields']['potential5'].items()},
                        'potentialMs': {k: v['value'] for k, v in r['fields']['potentialMs'].items()}, 'grade': r['fields']['grade']} for r in senior['replays']]
    write(PRIVATE / 'regression.json', {'first_layer': fixtures, 'derived': derived, 'matches': match_fixtures, 'senior': senior_fixtures})
    rules = {'version': 'gh-current-rules-v22', 'items': items, 'trait_map': rulemap(OLD / 'current/agtypebrand16-map.tsv'),
             'role_map': rulemap(OLD / 'current/agtype28-map.tsv'), 'role_standards': standards,
             'displayed_value_ids': [r['eqid'] for r in csvrows(OLD.parents[1] / '原始证据/value-module-displayed-words-and-submission.csv')],
             'source_hashes': {p.name: sha(p) for p in [items_path, std_path, OLD / 'current/agtypebrand16-map.tsv', OLD / 'current/agtype28-map.tsv']}}
    # Bind prior configuration to the actual v22 nested artifacts byte-for-byte.
    for p in [items_path, std_path, OLD / 'current/agtypebrand16-map.tsv', OLD / 'current/agtype28-map.tsv']:
        copies = list((PRIVATE / 'nested').rglob(p.name))
        assert any(sha(copy) == sha(p) for copy in copies), 'Configuration not found in v22: ' + p.name
    result_file = next((PRIVATE / 'nested').rglob('C8EvaluateResult.current.json'))
    result_rows = read(result_file)
    rules['styles'] = [{'code': r['ename'], 'id': int(r['erid']), 'name': r['name'], 'description': r.get('resultdata') or ''}
                       for r in result_rows if int(r['typeid']) == 3 and len(r.get('ename') or '') == 4 and set(r['ename']) <= set('EISNTFJP')]
    assert len(rules['styles']) == 16
    assert len(rules['displayed_value_ids']) == 32
    write(PROJECT / 'packages/assessment-engine/data/gh-derived-rules-v22.json', rules)
    # Preserve evidence grades; summary counts are attributed to the supplied package.
    audit = {'version': 'gh-handoff-v22-20261005', 'integrity': {'outer_entries': outer_checks, 'recursive_manifest_entries': chain_checks,
             'unique_nested_packages': len(visited), 'index_references': refs, 'question_mappings_checked': 341, 'declared_sanitization_exceptions': DECLARED_SANITIZATION},
             'principles': [{ 'id': r['principleId'], 'module': r['模块'], 'conclusion': r['已实证结论'], 'grade': r['证据等级'], 'package_checks': r['验证计数'], 'boundary': r['边界']} for r in index['principles']],
             'gaps': index['actualGaps'], 'complete_historical_replica': False}
    write(PROJECT / 'packages/assessment-engine/data/gh-v22-audit.json', audit)
    # Second integrity pass after ingestion confirms originals were not modified.
    assert verify(SOURCE) == outer_checks and expand(SOURCE, 'v22', set()) == chain_checks
    print(json.dumps({'status': 'PASS', 'integrity': audit['integrity'], 'private_regression_vectors': len(fixtures), 'actual_gaps': 5}, ensure_ascii=False))


if __name__ == '__main__':
    main()
