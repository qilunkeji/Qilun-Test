"""Replay archived synthetic requests against the v3 table, without contacting any site.

Uses the supplied option IDs to decode actual archived requests. Reports both a
deterministic display-order comparison and tie-compatible rank comparisons.
These are reuse-of-evidence checks, not an independent held-out validation set.
"""
import ast
import csv
import hashlib
import json
import sys
from collections import Counter
from fractions import Fraction
from pathlib import Path

project = Path(__file__).resolve().parents[1]
root = Path(sys.argv[1]).resolve() / 'project-ghrczx.com'
data = json.loads((project / 'packages/assessment-engine/data/strength-v3.json').read_text())
api = list(csv.DictReader((root / '证据/20260922-yuzeli-api-q1-q180-aligned.csv').open(encoding='utf-8-sig')))
option_ids = {int(r[f'option_{code}_id']): (int(r['api_order']) - 1, code)
              for r in api for code in range(1, 6)}
order = list(data['bookDenominators'])
counts = Counter(r['theme'] for r in data['weights'])
profiles = {'book118': data['bookDenominators'], 'observed_links': counts}
summary = {k: {'observations': 0, 'exact_top5_set': 0, 'compatible_top5_set': 0,
               'compatible_top5_order': 0, 'counterexamples': []} for k in profiles}
observations = {}
conflicting_answers = set()
invalid = 0
files = []
for path in sorted((root / '证据').glob('*top5-clean.csv')):
    # Files explicitly labelled invalid baseline are not silently treated as valid evidence.
    if 'invalid-baseline' in path.name:
        continue
    files.append(path.name)
    with path.open(encoding='utf-8-sig', newline='') as f:
        for row in csv.DictReader(f):
            try:
                actual = ast.literal_eval(row['top5'])
                request = json.loads(row['request'])
                choices = [None] * 180
                for answer in request['answers']:
                    q, code = option_ids[answer['id']]
                    if choices[q] is not None:
                        raise ValueError('duplicate question')
                    choices[q] = code
                if len(actual) != 5 or len(set(actual)) != 5 or not set(actual) <= set(order) or None in choices:
                    raise ValueError('incomplete observation')
            except (ValueError, SyntaxError, KeyError, TypeError):
                invalid += 1
                continue
            key = tuple(choices)
            observed = tuple(actual)
            if key in observations and observed not in observations[key]['outputs']:
                conflicting_answers.add(key)
            obs = observations.setdefault(key, {'outputs': {}, 'choices': choices})
            obs['outputs'].setdefault(observed, {'file': path.name, 'run_id': row['run_id']})

for obs in observations.values():
    sums = dict.fromkeys(order, 0)
    for edge in data['weights']:
        sums[edge['theme']] += edge['scores'][obs['choices'][edge['q'] - 1] - 1]
    for name, denominators in profiles.items():
        values = {t: Fraction(sums[t], denominators[t]) for t in order}
        sorted_themes = sorted(order, key=lambda t: -values[t])
        predicted = sorted_themes[:5]
        for actual, source in obs['outputs'].items():
            metrics = summary[name]
            metrics['observations'] += 1
            exact = set(predicted) == set(actual)
            compatible = min(values[t] for t in actual) >= max(values[t] for t in order if t not in actual)
            ordered = compatible and all(values[actual[i]] >= values[actual[i+1]] for i in range(4))
            metrics['exact_top5_set'] += exact
            metrics['compatible_top5_set'] += compatible
            metrics['compatible_top5_order'] += ordered
            if not compatible and len(metrics['counterexamples']) < 3:
                metrics['counterexamples'].append({**source, 'observed': actual, 'calculated': predicted,
                    'scores': {t: str(values[t]) for t in dict.fromkeys([*actual, *predicted])},
                    'answer_hash': hashlib.sha256(bytes(obs['choices'])).hexdigest()})

report = {'version': data['version'], 'source_files': files, 'unique_answer_vectors': len(observations),
          'same_answers_with_different_top5': len(conflicting_answers), 'invalid_rows_excluded': invalid,
          'profiles': summary,
          'scope': 'Archived synthetic yuzeli observations; not ghrczx answers/results or held-out validation.',
          'tie_policy': 'exact_top5_set uses Book118 column order only for display ties; compatible metrics do not invent a tie-break.'}
destination = project / '.local/replication-v3/replay-audit.json'
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
public = project / 'packages/assessment-engine/data/strength-replay-summary.json'
public.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
counter_hash = summary['book118']['counterexamples'][0]['answer_hash']
counter = next(obs for obs in observations.values()
               if hashlib.sha256(bytes(obs['choices'])).hexdigest() == counter_hash)
fixtures = {
    'counterexample': {'choices': counter['choices'], 'observed': next(iter(counter['outputs'])),
                      'source': next(iter(counter['outputs'].values())), 'answer_hash': counter_hash},
    'all_middle': {'choices': [3] * 180, 'observed': next(iter(observations[tuple([3]*180)]['outputs']))},
}
(project / 'packages/assessment-engine/data/strength-replay-fixtures.json').write_text(json.dumps(fixtures,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k: v for k,v in report.items() if k != 'source_files'}, ensure_ascii=False, indent=2))
