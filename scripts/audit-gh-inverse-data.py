"""Offline, privacy-preserving census for inverse scoring. Does not execute evidence code.

Only aggregate counts leave .local. No network, original writes, or business DB access.
The evidence directory is the canonical v3 snapshot contained again in v22;
duplicate copies of that snapshot must never increase the sample count.
"""
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / '.local/evidence-20260930-v3-base/20260930-高禾测评计分与匹配复现证据包-v3/服务端证据/position-match-model-configs'
PRIVATE = ROOT / '.local/gh-inference-v1'
ROLE_IDS = list(range(351, 359))
QUALITY_IDS = list(range(149, 171)) + list(range(172, 178))
CFG = json.loads((ROOT / 'packages/assessment-engine/data/gh-derived-rules-v22.json').read_text())
BASE_ITEMS = [(i['type'], i['id']) for i in CFG['items'] if i['type'] in (4, 5)]


def load(name):
    return [json.loads(s) for s in (SOURCE / name).read_text(encoding='utf-8-sig').splitlines() if s.strip()]


def group(rows):
    out = defaultdict(list)
    for r in rows:
        out[str(r['uid'])].append(r)
    return out


def features(roles, values):
    """The 32 retained intermediate components plus 16 base sums. Not target values."""
    by_role = {int(r['itemId']): r for r in roles}
    by_value = {(int(r['typeid']), int(r['itemid'])): r for r in values}
    # In the archived algorithm an unselected type5 row contributes zero before
    # buildInputs replaces it with .5. Missing motivation is NOT imputed.
    return [float(by_role[i][k]) for i in ROLE_IDS for k in ('scoreB', 'scoreC', 'scoreD', 'scoreNotion')] + [float(by_value.get(k, {}).get('score', 0)) for k in BASE_ITEMS]


def build():
    q = group(load('people/C8UserEvaluateResult_type8_quality_model_and_candidates.jsonl'))
    r = group(load('people/C8EvaluateProfessionalRoleScore_model_and_candidates.jsonl'))
    v = group(load('people/C8UserEvaluateResult_type45_value_motive_model_and_candidates.jsonl'))
    excluded = Counter()
    strict_all_rows_same_window = 0
    dataset = []
    for uid, quality in q.items():
        roles, values = r.get(uid, []), v.get(uid, [])
        if len(quality) != 28 or sorted(int(x['itemid']) for x in quality) != QUALITY_IDS:
            excluded['incomplete_or_duplicate_quality'] += 1
            continue
        if len(roles) != 8 or sorted(int(x['itemId']) for x in roles) != ROLE_IDS:
            excluded['incomplete_or_duplicate_roles'] += 1
            continue
        motivations = [x for x in values if int(x['typeid']) == 4]
        if sorted(int(x['itemid']) for x in motivations) != sorted(i for t,i in BASE_ITEMS if t==4) or any((int(x['typeid']),int(x['itemid'])) not in BASE_ITEMS for x in values):
            excluded['incomplete_motivation'] += 1
            continue
        if len({(x['typeid'], x['itemid']) for x in values}) != len(values):
            excluded['duplicate_value_rows'] += 1
            continue
        try:
            # Base results are written during the questionnaire (often ~20 min
            # apart); derived rows are written at completion. Role createTime
            # can precede an explicit updateTime. Compare the *last* base write
            # and all derived writes/updates, while bounding base duration.
            base_times = [datetime.fromisoformat(x['createTime']) for x in values]
            derived_times = [datetime.fromisoformat(x['createTime']) for x in quality] + [datetime.fromisoformat(x.get('updateTime') or x['createTime']) for x in roles]
            timestamps = [max(base_times)] + derived_times
        except (TypeError, ValueError):
            excluded['invalid_timestamp'] += 1
            continue
        if not timestamps or (max(timestamps) - min(timestamps)).total_seconds() > 120 or (max(base_times) - min(base_times)).total_seconds() > 86400:
            excluded['different_generation_time'] += 1
            continue
        x = features(roles, values)
        if (max(timestamps + base_times) - min(timestamps + base_times)).total_seconds() <= 120:
            strict_all_rows_same_window += 1
        ordered = sorted(quality, key=lambda r: int(r['itemid']))
        y = [float(row['scoreCalibrate']) * 100 if float(row['scoreCalibrate']) < 1 else 100.0 for row in ordered]
        raw = [float(row['score']) for row in ordered]
        if not all(-1e10 < z < 1e10 for z in x + raw) or not all(0 <= z <= 100 for z in y):
            excluded['nonfinite_or_invalid_score'] += 1
            continue
        # Group by almost identical INPUTS, not uid or outputs; copied candidates
        # and rounding-only clones must stay in the same train/test partition.
        signature = hashlib.sha256(json.dumps([round(z, 2) for z in x], separators=(',', ':')).encode()).hexdigest()
        dataset.append({'private_id': uid, 'group': signature, 'x': x, 'y': y, 'raw': raw})
    groups = group_signatures(dataset)
    conflicts = sum(any(max(row['y'][i] for row in rows) - min(row['y'][i] for row in rows) > 1.01 for i in range(28)) for rows in groups.values())
    result = {
        'version': 'gh-inverse-data-audit-v1', 'quality_people': len(q), 'quality_rows': sum(map(len, q.values())),
        'role_people': len(r), 'eligible_intermediate_pairs': len(dataset), 'independent_input_groups': len(groups),
        'duplicate_input_rows': len(dataset) - len(groups), 'same_input_conflicting_outputs_groups': conflicts,
        'excluded': dict(excluded), 'completion_pairing_window_seconds': 120, 'max_base_writing_duration_seconds': 86400,
        'all_base_and_derived_rows_within_120_seconds': strict_all_rows_same_window,
        'target': 'old scoreCalibrate*100 capped at 100, HALF_UP display',
        'feature_count': 48, 'target_count': 28, 'known_questionnaire_pairs': 6,
        'boundary': '中间分项与能力数据库输出的同窗配对，不等于2605份完整答卷，更不等于同次高级报告实返。原始部署版本仍未锁定。',
        'source_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((SOURCE / 'people').glob('*.jsonl'))},
    }
    return dataset, result


def group_signatures(rows):
    out = defaultdict(list)
    for row in rows:
        out[row['group']].append(row)
    return out


if __name__ == '__main__':
    rows, audit = build()
    PRIVATE.mkdir(exist_ok=True)
    (PRIVATE / 'dataset.json').write_text(json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + '\n')
    (PRIVATE / 'audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(audit, ensure_ascii=False))
