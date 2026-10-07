#!/usr/bin/env python3
"""Read-only numerical replay using three reviewed, SHA-pinned package modules.

Only pure replay functions are called. Supplied mains rewrite source evidence and
are deliberately NOT called. No network, solver, shell, or database is used.
"""
import importlib.util
import json
import sys
from decimal import Decimal
from pathlib import Path

from importlib import import_module

# Our own importer, not an evidence-package module.
audit = import_module('import-gh-evidence-v6')
PINS = {
    'replay_assessment': '78bcd27a613f242f79211bc9d6ae64e764c64d241922d6cd5b899d6d707c48b4',
    'replay_brand36': '2befecdfc192ad3132a58e8f265257d64aa06404b58bde20253175fd4fb30f59',
    'replay_role8': '16c42b4564f3e68d5440b91b58f1eca49a4f921ec3c2f38358251adfb8818112',
}


def main(base):
    before = audit.verify(base)
    d = base / '服务端证据/20260929-db-readonly'
    sys.dont_write_bytecode = True
    modules = {}
    for name, digest in PINS.items():
        path = d / (name + '.py')
        assert audit.sha(path) == digest, 'Unreviewed source revision; stop'
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        modules[name] = module
    first, brand, role = (modules[k] for k in PINS)
    sample = audit.read_json(d / '20260929-uid321373-readonly-replay-sample.json')
    replayer = first.AssessmentReplayer()
    answers = replayer.load_db_sample(d / '20260929-uid321373-readonly-replay-sample.json')
    replay_rows = replayer.replay(answers)
    server_rows = [r for r in sample['C8UserEvaluateResult'] if int(r['typeid']) in (2, 3, 4, 5)]
    items = brand.load_jsonl(brand.ITEMS)
    trait_map = brand.load_map(brand.MAP_TSV)
    expected16 = {int(r['itemid']): Decimal(str(r['scoreNew'])) for r in sample['C8UserEvaluateResult'] if int(r['typeid']) == 16}
    trait_results = []
    role_results = []
    standards = {int(r['itemId']): r for r in brand.load_jsonl(role.STANDARD) if 351 <= int(r['itemId']) <= 358}
    # IMPORTANT: package role replay reads C4Top from the stored server result.
    # Do not mislabel this as an entirely answer-only role calculation.
    ctop = next(r['resultValue'] for r in sample['C8UserEvaluateResultResult'] if r['type'] == 'C4Top')
    expected_roles = {int(r['itemId']): r for r in sample['C8EvaluateProfessionalRoleScore']}
    fields = ['scoreB', 'scoreC', 'scoreD', 'scoreNotion', 'scoreTotal', 'scoreTotalCalibrateJunior', 'scoreTotalCalibrateSeniorNew']
    for source, rows in [('server_inputs', server_rows), ('answer_inputs', replay_rows)]:
        children, parents, _ = brand.replay({'C8UserEvaluateResult': rows}, items, trait_map)
        actual16 = {r['itemid']: Decimal(str(r['scoreNew'])) for r in children + parents}
        assert set(actual16) == set(expected16) and len(actual16) == 42
        assert all(actual16[k] == v for k, v in expected16.items())
        assert all(actual16[k] == 0 for k in [247, 278, 279, 280, 281, 282, 283])
        trait_results.append({'route': source, 'compared': 42, 'passed': 42})
        calculated = role.compute_roles(brand, rows, items, brand.load_map(role.ROLE_MAP), standards, ctop)
        assert len(calculated) == 8
        diffs = [abs(Decimal(str(r[f])) - Decimal(str(expected_roles[r['itemid']][f]))) for r in calculated for f in fields]
        assert len(diffs) == 56 and max(diffs) <= Decimal('1e-9')
        role_results.append({'route': source, 'compared': 56, 'passed': 56})
    output = audit.PROJECT / 'packages/assessment-engine/data/gh-v6-audit.json'
    report = audit.read_json(output)
    report['derived'] = {
        'method': 'SHA-pinned reviewed package functions; not an independent TypeScript port',
        'sample_count': 1, 'type16': trait_results, 'role8': role_results,
        'role8_requires_server_c4top': True,
        'grade': 'SOURCE_FORMULA_ONLY',
        'current_unconfigured_trait_ids': [278, 279, 280, 281, 282, 283],
        'not_integrated_into_formal_report': True,
    }
    audit.write_json(output, report)
    assert audit.verify(base) == before
    print(json.dumps(report['derived'], ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main(Path(sys.argv[1]))
