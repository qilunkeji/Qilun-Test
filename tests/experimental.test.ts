import {test} from 'node:test';
import assert from 'node:assert/strict';
import {experiment} from '../packages/assessment-engine/experimental.ts';
const base={purpose:'synthetic_method_comparison',answers:[5,1,3,3,1,5],benchmarks:[[5,1,5,1,5,1]],aggregation:'mean',weights:[1,1,1]};
test('实验链保留正反向、范围端点与三种不同总分',()=>{
 const r=experiment(base);assert.deepEqual(r.candidate.map(x=>x.normalized),[100,50,0]);assert.deepEqual(r.components,[100,50,0]);
 assert.ok(Math.abs(r.alternatives.weighted_linear-50)<1e-9);assert.equal(r.alternatives.bottleneck,0);
 assert.ok(Math.abs(r.alternatives.weighted_quadratic-35.45027756320972)<1e-9);
 assert.equal(r.formal_score,false);assert.equal(r.original_algorithm_recovered,false);
});
test('均值与中位数可区分；完全相同时满刻度不代表录用概率',()=>{
 const input={...base,benchmarks:[[1,5,1,5,1,5],[5,1,5,1,5,1],[5,1,5,1,5,1]]};
 assert.ok(Math.abs(experiment(input).target[0]-200/3)<1e-9);
 assert.deepEqual(experiment({...input,aggregation:'median'}).target,[100,100,100]);
 assert.ok(Math.abs(experiment({...base,benchmarks:[base.answers]}).alternatives.weighted_linear-100)<1e-9);
});
test('拒绝缺答、零权重、非法目的和真实人员附加字段',()=>{
 for(const delta of [{answers:[1]},{weights:[0,1,1]},{answers:[6,1,3,3,1,5]},{purpose:'hiring'},{person_id:'person-1'},{benchmarks:[]}])assert.throws(()=>experiment({...base,...delta}));
});
