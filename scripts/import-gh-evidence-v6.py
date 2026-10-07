#!/usr/bin/env python3
"""Import allowlisted rules, independently audit first-layer/constraint arithmetic.

Usage: python3 scripts/import-gh-evidence-v6.py <outer-v6-root> <nested-v3-root>
Never executes supplied shell/solver scripts, rewrites evidence, or opens the DB.
Private answer fixtures stay in .local; application data contains no person records.
"""
import collections
import csv
import hashlib
import json
import re
import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
VERSION = 'gh-server-evidence-20260930-v1'


def read_csv(path):
    with path.open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify(root):
    checked = {}
    for line in (root / 'SHA256SUMS.txt').read_text(encoding='utf-8-sig').splitlines():
        if not line.strip():
            continue
        digest, name = line.split(maxsplit=1)
        name = name.removeprefix('*')
        p = root / name
        if not p.resolve().is_relative_to(root.resolve()) or p.is_symlink():
            raise ValueError('Unsafe manifest path')
        assert name not in checked and sha(p) == digest.lower(), name
        checked[name] = digest.lower()
    return checked


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main(outer, base):
    outer_hashes, base_hashes = verify(outer), verify(base)
    d = base / '服务端证据/20260929-db-readonly'
    config = read_json(d / '20260929-db-core-algorithm-configs.json')
    mapping = read_csv(d / 'question-item-mapping.csv')
    long = read_csv(d / 'per-question-scoring-long.csv')
    bank = read_json(PROJECT / 'packages/assessment-engine/data/question-bank-277.json')['questions']
    assert len(mapping) == 277 and len(long) == 1385
    by_id = {q['id']: q for q in bank}
    assert set(by_id) == {r['eqid'] for r in mapping}
    score_table = {}
    for r in long:
        k = (r['eqid'], int(r['answer_code']))
        assert k not in score_table
        score_table[k] = r
    formulas = {2: [(3, 0), (1, 0), (0, 0), (0, 1), (0, 3)],
                3: [(1, 0), (.75, .25), (.5, .5), (.25, .75), (0, 1)],
                4: [(2.5, 0), (1.5, 0), (1, 0), (.5, 0), (0, 0)]}
    questions = []
    for r in mapping:
        old = by_id[r['eqid']]
        assert (old['title'], old['a'], old['b'], old['answer_type']) == (r['title'], r['tag'], r['totag'], int(r['answertype']))
        t = int(r['server_typeid'])
        scores = []
        for choice in range(1, 6):
            s = score_table[(r['eqid'], choice)]
            assert s['server_typeid'] == r['server_typeid']
            assert s['main_itemid'] == r['itemid'] and int(s['to_itemid'] or 0) == int(r['toitemid'] or 0)
            pair = [float(s['main_add']), float(s['to_add'])]
            assert tuple(pair) == formulas[t][choice - 1]
            scores.append(pair)
        questions.append({'id': r['eqid'], 'type': t, 'item': int(r['itemid']),
                          'opposite': int(r['toitemid'] or 0), 'scores': scores})
    assert collections.Counter(q['type'] for q in questions) == {2: 153, 3: 60, 4: 64}
    value_questions = [{'id': str(q['eqid']), 'item': int(q['itemid']), 'title': q['title'], 'description': q['tag']}
                       for q in config['C8EvaluateQuestion_core'] if int(q['typeid']) == 5 and int(q['questionBankId']) == 0]
    assert len(value_questions) == len({q['id'] for q in value_questions}) == 64
    value_ids = {q['id']: q for q in value_questions}
    rank_rows = read_csv(d / 'value-rank-scoring-table.csv')
    ranks = {int(r['stored_rank_score']): float(r['points_to_stored_itemid']) for r in rank_rows}
    assert ranks == {i: 6 - (i + 1) // 2 for i in range(1, 11)}
    item_ids = {q[k] for q in questions for k in ('item', 'opposite')} | {q['item'] for q in value_questions}
    items = [{'id': int(r['eiid']), 'name': r['name'], 'ename': r.get('ename') or '', 'type': int(r['etid'])}
             for r in config['C8EvaluateItem_core'] if int(r['eiid']) in item_ids]
    multipliers = {37: 140, 64: 140, 65: 173, 66: 173, 67: 160, 68: 160, 69: 146, 70: 146}

    def calculate(answers):
        assert len(answers) == 287 and set(by_id) <= answers.keys()
        assert len(set(answers) - set(by_id)) == 10
        assert set(answers) <= set(by_id) | set(value_ids)
        assert sorted(v for k, v in answers.items() if k in value_ids) == list(range(1, 11))
        totals = collections.defaultdict(Decimal)
        for q in questions:
            a = answers[q['id']]
            assert type(a) is int and 1 <= a <= 5
            for item, add in zip((q['item'], q['opposite']), q['scores'][a - 1]):
                if item:
                    totals[(q['type'], item)] += Decimal(str(add))
        for k in list(totals):
            if k[0] == 3:
                totals[k] *= Decimal(multipliers.get(k[1], 150)) / 100
        for id, rank in answers.items():
            if id in value_ids:
                totals[(5, value_ids[id]['item'])] += Decimal(str(ranks[rank]))
        return totals

    sample = read_json(d / '20260929-uid321373-readonly-replay-sample.json')
    answers = {str(r['questionid']): int(r['score']) for r in sample['C8UserEvaluateItem']
               if str(r['questionid']) in set(by_id) | set(value_ids)}
    expected = {(int(r['typeid']), int(r['itemid'])): Decimal(str(r['score']))
                for r in sample['C8UserEvaluateResult'] if int(r['typeid']) in (2, 3, 4, 5)}
    fixtures = []
    def check(answers, expected, full):
        got = calculate(answers)
        keys = set(expected) | set(got) if full else set(expected)
        assert all(abs(got.get(k, Decimal(0)) - expected.get(k, Decimal(0))) <= Decimal('1e-9') for k in keys)
        fixtures.append({'answers': answers, 'expected': [{'type': k[0], 'item': k[1], 'score': float(expected.get(k, Decimal(0)))} for k in sorted(keys)], 'full': full})
        return len(keys)
    comparisons = check(answers, expected, True)
    matrix = read_csv(base / '原始证据/valid-live-input-matrix.csv')
    reports = read_json(base / '原始证据/account130-three-vId-report-raw-scores.json')
    team = read_json(base / '原始证据/company-team-report-readonly-probe.sanitized.json')
    for vid in ['1307520245280165889', '564068', '564066']:
        rows = [r for r in matrix if r['sample_vId'] == vid]
        ans = {r['eqid']: int(r['answerCode']) for r in rows}
        assert len(rows) == len(ans) == 287
        output = reports['reports'][vid]['strengths34'] if vid.startswith('1307') else next(r['body']['datas']['evaluateB_All'] for r in team['rows'] if r['tag'] == f'detail_uid_{vid}_vid_{vid}')
        comparisons += check(ans, {(2, int(r['eiid'])): Decimal(str(r['value'])) for r in output}, False)
    assert comparisons == 158

    e = outer / 'evidence'
    closure = read_csv(e / 'quality-remaining-45-closure-v6.csv')
    assert len(closure) == len({r['id'] for r in closure}) == 45
    counts = collections.Counter(r['closureClassification'] for r in closure)
    assert counts == {'matrix_constraint_solution': 22, 'time_segmented_matrix_constraint_solution': 10,
                      'member_constraint_solution': 7, 'repeated_candidate_snapshot': 6}
    details = collections.defaultdict(list)
    for r in read_csv(e / 'quality-matrix-full-details.csv'):
        details[(r['modelId'], r['matchId'])].append(r)
    matrix_checks = 0
    for r in closure:
        cls = r['closureClassification']
        if cls != 'repeated_candidate_snapshot':
            assert r['constraintPredicted'] == r['observed']
        if cls not in ('matrix_constraint_solution', 'time_segmented_matrix_constraint_solution'):
            continue
        changes = dict((k, int(v)) for k, v in re.findall(r'(\d+-\d+):(\d+)', r['constraintEvidence']))
        assert changes
        terms = details[(r['modelId'], r['id'])]
        assert len(terms) == 13 and sum(t['segment'] == 'top10' for t in terms) == 10
        sums = {'top10': 0.0, 'last3': 0.0}
        for t in terms:
            assert t['observed'] == r['observed']
            v = float(changes.get(t['matrixKey'], t['currentMatrixScore']))
            if t['segment'] == 'top10':
                sums['top10'] += v * (float(t['candidateScore']) / float(t['modelScore']))
            else:
                sums['last3'] += v * (float(t['modelScore']) / float(t['candidateScore']))
        a = float(Decimal(str(min(100, sums['top10']) * .8)).quantize(Decimal('.01'), rounding=ROUND_HALF_UP))
        b = float(Decimal(str(min(30, sums['last3']) / 30 * 100 * .2)).quantize(Decimal('.01'), rounding=ROUND_HALF_UP))
        got = int(Decimal(a + b).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
        assert got == int(r['observed']), (r['id'], got)
        matrix_checks += 1
    assert matrix_checks == 32
    summary = {'version': VERSION, 'date': '2026-09-30', 'hashes': {'v6': len(outer_hashes), 'base_v3': len(base_hashes)},
               'ordinary_questions': 277, 'scoring_rows': 1385, 'value_config_count': 64,
               'first_layer': {'compared': comparisons, 'passed': comparisons, 'samples': 4,
                               'scope': '一份56项基础分＋三份各34项优势分；不是158个人，也不是整份报告一致。'},
               'closure': {'records': 45, 'counts': dict(counts), 'unresolved_in_package': 0,
                           'matrix_recomputed': matrix_checks, 'member_table_consistent_only': 7,
                           'snapshot_not_recovered': 6, 'historical_state_recovered': False},
               'source_hashes': {'outer_manifest': sha(outer / 'SHA256SUMS.txt'), 'base_manifest': sha(base / 'SHA256SUMS.txt'),
                                 'scoring_table': sha(d / 'per-question-scoring-long.csv'), 'closure_table': sha(e / 'quality-remaining-45-closure-v6.csv')}}
    write_json(PROJECT / 'packages/assessment-engine/data/gh-server-rules.json',
               {'version': VERSION, 'questions': questions, 'values': value_questions, 'items': items,
                'rank_points': [ranks[i] for i in range(1, 11)], 'type3_multipliers_hundredths': multipliers})
    write_json(PROJECT / 'packages/assessment-engine/data/gh-v6-audit.json', summary)
    write_json(PROJECT / '.local/evidence-20260930-audit/first-layer-fixtures.json', fixtures)
    # Recheck the archives' extracted evidence after the import: absolutely no overwrites.
    assert verify(outer) == outer_hashes and verify(base) == base_hashes
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main(Path(sys.argv[1]), Path(sys.argv[2]))
