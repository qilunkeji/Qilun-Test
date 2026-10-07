"""Fit only retained intermediate features, with untouched group/answer holdouts.

NumPy kernel ridge; no downloaded code, no model uploads. Artifacts stay private.
The held-out people and every nearly-identical input group are excluded from
training/validation. A low MAE is NOT labeled 99% exact replication.
"""
import hashlib
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / '.local/gh-inference-v1'
VERSION = 'qilun-gh-inverse-v1'


def read(name):
    return json.loads((PRIVATE / name).read_text())


def metric(y, prediction):
    truth = np.floor(np.clip(y, 0, 100) + .5)
    result = np.floor(np.clip(prediction, 0, 100) + .5)
    error = np.abs(truth - result)
    return {'samples': len(y), 'cells': int(error.size), 'exact_display_rate': float(np.mean(error == 0)),
            'within_one_rate': float(np.mean(error <= 1)), 'mean_absolute_error': float(np.mean(error)),
            'p95_absolute_error': float(np.percentile(error, 95)), 'max_absolute_error': float(np.max(error)),
            'all_28_exact_rate': float(np.mean(np.all(error == 0, axis=1)))}


def kernel(a, b, gamma, linear):
    dot = a @ b.T / a.shape[1]
    distance = np.maximum(0, np.mean(a*a, axis=1)[:, None] + np.mean(b*b, axis=1)[None, :] - 2*dot)
    return np.exp(-gamma * distance) + linear * dot


def fit(x, y, gamma, alpha, linear):
    mean, scale = np.mean(x, axis=0), np.std(x, axis=0)
    scale[scale < 1e-9] = 1
    z = (x - mean) / scale
    ym = np.mean(y, axis=0)
    gram = kernel(z, z, gamma, linear)
    gram.flat[::len(z)+1] += alpha
    coefficients = np.linalg.solve(gram, y - ym)
    return mean, scale, z, ym, coefficients


def predict(fitted, x, gamma, linear):
    mean, scale, support, ym, coefficients = fitted
    return kernel((x - mean)/scale, support, gamma, linear) @ coefficients + ym


def main():
    data, external = read('dataset.json'), read('answer-features.json')
    external_ids = {r['private_id'] for r in external['examples']}
    external_groups = {r['group'] for r in data if r['private_id'] in external_ids}
    external_groups |= {hashlib.sha256(json.dumps([round(z,2) for z in r['x']],separators=(',',':')).encode()).hexdigest() for r in external['examples']}
    reserved = [r for r in data if r['group'] in external_groups]
    other = [r for r in data if r['private_id'] not in external_ids and r['group'] not in external_groups]
    # Deterministic random-like grouping. Do NOT select holdout according to y.
    slot = lambda r: int(hashlib.sha256(('split-v1:' + r['group']).encode()).hexdigest()[:8], 16) % 10
    splits = [[r for r in other if predicate(slot(r))] for predicate in (lambda k:k<6, lambda k:6<=k<8, lambda k:k>=8)]
    arrays = [(np.array([r['x'] for r in rows]), np.array([r['y'] for r in rows])) for rows in splits]
    x, y = arrays[0]; vx, vy = arrays[1]; hx, hy = arrays[2]
    # Candidate grid fixed before opening test results. Selection uses validation
    # displayed-score MAE; no test-dependent tuning or final refit on the holdout.
    candidates = [(g, a, 1.0) for g in (.1, .5, 2.0) for a in (.01, .1, 1.0)]
    scored = []
    for gamma, alpha, linear in candidates:
        f = fit(x, y, gamma, alpha, linear)
        m = metric(vy, predict(f, vx, gamma, linear))
        scored.append((m['mean_absolute_error'], -m['exact_display_rate'], gamma, alpha, linear, f, m))
        print(json.dumps({'stage': 'validation', 'gamma': gamma, 'alpha': alpha, 'metric': m}), flush=True)
    selected = min(scored, key=lambda row: row[:5])
    _, _, gamma, alpha, linear, fitted, validation = selected
    holdout_prediction = predict(fitted, hx, gamma, linear)
    holdout = metric(hy, holdout_prediction)
    holdout_error = np.abs(np.floor(hy+.5)-np.floor(np.clip(holdout_prediction,0,100)+.5))
    per_item = [{'item': item, 'exact_display_rate': float(np.mean(holdout_error[:,i]==0)),
                 'mean_absolute_error': float(np.mean(holdout_error[:,i])), 'p95_absolute_error': float(np.percentile(holdout_error[:,i],95))}
                for i,item in enumerate(list(range(149,171))+list(range(172,178)))]
    ex = np.array([r['x'] for r in external['examples']]); ey = np.array([r['y'] for r in external['examples']])
    answer_prediction = predict(fitted, ex, gamma, linear)
    answer_chain = metric(ey, answer_prediction)
    # Test observed DB features separately from the full answer-chain features;
    # mismatch between source versions must not be hidden by intermediate-only fit.
    intermediate_holdout = metric(np.array([r['y'] for r in reserved]), predict(fitted, np.array([r['x'] for r in reserved]), gamma, linear)) if reserved else None
    mean, scale, support, ym, coefficients = fitted
    distances = np.mean(support*support, axis=1)[:, None] + np.mean(support*support, axis=1)[None, :] - 2*(support@support.T)/48
    np.fill_diagonal(distances, np.inf)
    nearest_limit = max(1e-6, float(np.percentile(np.min(distances, axis=1), 99)))
    summary = {'version': VERSION, 'audit': read('audit.json'), 'selected_method': f'RBF+linear kernel ridge; gamma={gamma}, alpha={alpha}',
               'training_samples': len(x), 'validation': validation, 'holdout': holdout, 'answer_chain': answer_chain, 'per_item_holdout': per_item,
               'external_intermediate_holdout': intermediate_holdout, 'reserved_external_groups': len(external_groups),
               'historical_replica_verified': False, 'recruitment_decision_allowed': False,
               'limitations': ['中间分项配对是数据库快照，不是完整高级报告实返；历史部署版本未锁定。',
                               '未恢复原AgType8Map；中间分项会丢失原才干名次等信息，不能保证同样输出。',
                               '完整答卷链仅6份，其中有重建/版本风险；不证明人群效度或招聘预测准确率。',
                               '固定验证集选择模型，独立测试集及6份完整答卷从未进入训练，模型未在测试后重拟合。'],
               'selection_grid': [{'gamma': r[2], 'alpha': r[3], 'linear_weight': r[4], 'validation': r[6]} for r in scored]}
    model = {'version': VERSION, 'feature_keys': external['feature_keys'], 'quality_ids': list(range(149,171))+list(range(172,178)),
             'mean': mean.tolist(), 'scale': scale.tolist(), 'support': support.tolist(), 'coefficients': coefficients.tolist(),
             'target_mean': ym.tolist(), 'gamma': gamma, 'linear_weight': linear, 'max_training_nearest_distance': nearest_limit, 'summary': summary}
    (PRIVATE / 'model.json').write_text(json.dumps(model, ensure_ascii=False, separators=(',', ':'))+'\n')
    (PRIVATE / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n')
    # Cross-runtime vectors remain private; include real held-out and extreme
    # inputs to detect JS/Python kernel and rounding discrepancies.
    vectors = [{'x': row['x'], 'expected': np.clip(pred,0,100).tolist()} for row, pred in zip(external['examples'], answer_prediction)]
    (PRIVATE / 'prediction-vectors.json').write_text(json.dumps(vectors)+'\n')
    print(json.dumps({'selected': summary['selected_method'], 'training_samples':len(x), 'validation':validation,'holdout':holdout,'answer_chain':answer_chain,'reserved_intermediate':intermediate_holdout},ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
