import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {ghReplayExample,scoreGhReportReplay,deriveGhPotentialGroups} from '@qilun/assessment-engine/gh-derived.ts';
import {ghInferenceVersion,ghInferenceFeatureKeys,ghInferenceQualityIds,ghInferenceFeatures,predictGhAbility,scoreGhInferredReport,validateGhInverseModel} from '@qilun/assessment-engine/gh-inference.ts';
import type {GhInverseModel} from '@qilun/assessment-engine/gh-inference.ts';
const modelPath=new URL('../.local/gh-inference-v1/model.json',import.meta.url);
const vectorsPath=new URL('../.local/gh-inference-v1/prediction-vectors.json',import.meta.url);
const model=()=>validateGhInverseModel(JSON.parse(readFileSync(modelPath,'utf8')));
const input=()=>({...ghReplayExample(),version:ghInferenceVersion,purpose:'development_reference_only'});

test('反推48输入不含能力标签或身份，按固定项目绑定，已知公式保持不变',()=>{
 const legacy=scoreGhReportReplay(ghReplayExample()),features=ghInferenceFeatures(legacy);
 assert.equal(features.length,48);assert.equal(ghInferenceFeatureKeys.length,48);assert.equal(ghInferenceQualityIds.length,28);
 assert.deepEqual(features,ghInferenceFeatures({...legacy,roles:[...legacy.roles].reverse(),rows:[...legacy.rows].reverse()}));
 assert.deepEqual(features.slice(0,4),[legacy.roles[0].scoreB,legacy.roles[0].scoreC,legacy.roles[0].scoreD,legacy.roles[0].scoreNotion]);
 assert.throws(()=>ghInferenceFeatures({...legacy,roles:legacy.roles.slice(1)}));
 assert.throws(()=>ghInferenceFeatures({...legacy,rows:legacy.rows.filter(r=>r.type!==4)}));
 assert.deepEqual(scoreGhReportReplay(ghReplayExample()),legacy);
});
test('私有模型版本、项目、顺序、尺度与有限性校验，污染模型拒绝载入',{skip:!existsSync(modelPath)},()=>{
 const m=model();assert.equal(m.version,ghInferenceVersion);
 for(const invalid of [{...m,version:'old'},{...m,feature_keys:[]},{...m,quality_ids:[...m.quality_ids].reverse()},{...m,scale:m.scale.map((v,i)=>i?v:0)},{...m,coefficients:[]},{...m,support:[Array(48).fill(NaN)]},{...m,target_mean:Array(28).fill(Infinity)},{...m,gamma:0},{...m,max_training_nearest_distance:NaN},{...m,summary:{...m.summary,historical_replica_verified:true}}])assert.throws(()=>validateGhInverseModel(invalid as GhInverseModel));
});
test('Python/TS核函数独立回归六份端到端预测，不把低误差说成99%完全一致',{skip:!existsSync(modelPath)||!existsSync(vectorsPath)},()=>{
 const m=model(),vectors=JSON.parse(readFileSync(vectorsPath,'utf8')) as {x:number[];expected:number[]}[];
 assert.equal(vectors.length,6);
 for(const v of vectors){const result=predictGhAbility(m,v.x);v.expected.forEach((x,i)=>assert.ok(Math.abs(x-result.values[i])<1e-8));}
 assert.equal(m.summary.holdout.samples,508);assert.equal(m.summary.holdout.cells,508*28);
 assert.ok(m.summary.holdout.exact_display_rate<.99);assert.equal(m.summary.holdout.all_28_exact_rate,0);
 assert.equal(m.summary.answer_chain.samples,6);assert.equal(m.summary.historical_replica_verified,false);
 assert.ok(m.summary.answer_chain.mean_absolute_error>m.summary.holdout.mean_absolute_error);
});
test('补齐28估计与汇总，不改风格/角色/才干原公式，不接受人员绑定或招聘目的',{skip:!existsSync(modelPath)},()=>{
 const m=model(),r=scoreGhInferredReport(input(),m),old=scoreGhReportReplay(ghReplayExample());
 assert.equal(r.abilities.length,28);assert.deepEqual(r.style,old.style);assert.deepEqual(r.roles,old.roles);assert.deepEqual(r.strengths,old.strengths);
 assert.ok(r.abilities.every(a=>Number.isInteger(a.value)&&a.value>=0&&a.value<=100&&a.origin==='empirical_inverse_estimate'));
 assert.equal(r.ability_summary.top_six.length,6);assert.equal(r.ability_summary.bottom_three.length,3);assert.equal(r.ability_summary.groups.length,4);
 const groups=deriveGhPotentialGroups(r.abilities.map(a=>({item:a.item,value:a.value})));
 assert.deepEqual(r.ability_summary.potential5,groups.potential5);assert.deepEqual(r.ability_summary.potentialMs,groups.potentialMs);
 assert.equal(r.ability_summary.evidence_grade,'ESTIMATED_INPUTS_WITH_KNOWN_GROUP_FORMULA');assert.equal(r.inference.exact_original_result,false);
 assert.equal(r.formal_score,false);assert.equal(r.persisted_as_person_report,false);assert.equal(r.recruitment_decision_allowed,false);
 for(const bad of [{...input(),version:'gh-report-replay-v22'},{...input(),purpose:'hiring_rank'},{...input(),person_id:'x'},{...input(),answers:{}}])assert.throws(()=>scoreGhInferredReport(bad,m));
});
test('极端中间输入标域外，估计有界且无NaN，输出不泄漏训练样本或模型',{skip:!existsSync(modelPath)},()=>{
 const m=model(),r=predictGhAbility(m,Array(48).fill(1e6));assert.equal(r.outside_observed_domain,true);assert.ok(r.values.every(x=>Number.isFinite(x)&&x>=0&&x<=100));
 for(const bad of [[],Array(48).fill(NaN),Array(48).fill(Infinity)])assert.throws(()=>predictGhAbility(m,bad));
 const result=JSON.stringify(scoreGhInferredReport(input(),m));assert.doesNotMatch(result,/private_id|coefficients|"support"|"mean"|"scale"|321373|56406|password|Bearer /);
 const poisoned={...m,summary:{...m.summary,private_id:'do-not-leak',audit:{...m.summary.audit,private_id:'do-not-leak'},holdout:{...m.summary.holdout,private_id:'do-not-leak'}}};
 assert.doesNotMatch(JSON.stringify(scoreGhInferredReport(input(),poisoned)),/do-not-leak/);
 assert.throws(()=>validateGhInverseModel({...m,summary:{...m.summary,holdout:{...m.summary.holdout,exact_display_rate:99}}}));
});
test('原版母版仅增加明确标记的能力估计图，原公式视图能力继续留白',{skip:!existsSync(modelPath)},()=>{
 const r=scoreGhInferredReport(input(),model()),old=scoreGhReportReplay(ghReplayExample());
 assert.equal('abilities' in r,true);assert.equal('abilities' in old,false);
 const plots=readFileSync(new URL('../apps/admin-web/src/gh-report-preview.tsx',import.meta.url),'utf8');
 assert.match(plots,/'abilities' in r/);assert.match(plots,/历史结果反推估计/);assert.match(plots,/abilities\.length>0&&page==='data'/);assert.match(plots,/abilities\.length>0&&page==='talent-06'/);
 // Updated against the attached PDF: 28 equal 33.5pt cells, y=1093 baseline.
 assert.match(plots,/x=\{132\} y=\{873\} width=\{938\} height=\{220\}/);
 const template=readFileSync(new URL('../apps/admin-web/src/original-report.tsx',import.meta.url),'utf8');assert.match(template,/original-inference-label/);assert.match(template,/非原版实算/);
});
