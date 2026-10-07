"""Import only questionnaire text, definitions and scoring evidence; never personal reports.

Usage: python3 scripts/import-strength-evidence.py <extracted Codex ZIP root>
Original archives and extracted evidence remain unchanged. No network calls.
"""
import csv
import hashlib
import json
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve() / 'project-ghrczx.com'
destination = Path(__file__).resolve().parents[1] / 'packages/assessment-engine/data/strength-v3.json'
sources = {}


def read(name):
    paths = list(root.rglob(name))
    if len(paths) != 1:
        raise ValueError(f'Expected exactly one source: {name}')
    p = paths[0]
    sources[name] = hashlib.sha256(p.read_bytes()).hexdigest()
    with p.open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


target = read('20260921-ghrczx-external-order-alignment.csv')
external = read('20260922-yuzeli-api-q1-q180-aligned.csv')
weights = read('20260922-yuzeli-server-weight-table-q1-q180-v3.csv')
themes = read('20260918-personality-34-advantages-definitions.csv')
traits = read('20260918-personality-36-traits-definitions.csv')
roles = read('20260918-personality-8-roles-definitions.csv')
book_path = root / '证据/20260921-book118-result-formulas.json'
sources[book_path.name] = hashlib.sha256(book_path.read_bytes()).hexdigest()
book = json.loads(book_path.read_text())['themes']
confirmed = {'source_formula_verified', 'runtime_carrier_verified', 'runtime_followup_verified',
             'runtime_boundary_verified', 'runtime_v3_differential_verified'}
accepted = [r for r in weights if r['evidence_level'] in confirmed]
assert len(target) == 153 and len(external) == 180 and len(accepted) == 574
assert [int(r['gh_order']) for r in target] == list(range(1, 154))
assert len({r['eqid'] for r in target}) == 153
assert len(themes) == 34 and len(traits) == 36 and len(roles) == 8
data = {
    'version': 'evidence-v3-20260922',
    'sources': sources,
    'targetQuestions': [{'order': int(r['gh_order']), 'id': r['eqid'], 'a': r['gh_A'], 'b': r['gh_B']}
                        for r in target],
    'externalQuestions': [{'order': int(r['api_order']), 'id': r['question_id'],
                           'a': r['A_statement_api'], 'b': r['B_statement_api']}
                          for r in external],
    'weights': [{'q': int(r['q']), 'theme': r['theme'], 'side': r['side'],
                 'scores': [int(r['answer_' + k]) for k in ['A3', 'A2', 'mid', 'B2', 'B3']],
                 'evidence': r['evidence_level']} for r in accepted],
    'excludedRows': [{'q': int(r['q']), 'side': r['side'], 'theme': r['theme'],
                      'reason': r['evidence_level']} for r in weights if r not in accepted],
    'bookDenominators': {r['theme']: int(r['occurrences_180']) for r in book},
    'themes': [{'name': r['name'], 'category': r['category'], 'description': r['introduce']} for r in themes],
    'traits': [{'name': r['name'], 'description': r['resultAdvantage']} for r in traits],
    'roles': [{'name': r['name'], 'definition': r['definition'], 'feature': r['feature']} for r in roles],
}
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print(f'Imported {len(target)} target questions, {len(external)} external questions, {len(accepted)} scoring edges; no personal reports.')
