import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {ghReplayExample,scoreGhReportReplay,deriveGhDimensions,deriveGhStyle,calibrateGh,gradeGh,halfUp,translateGhRole,replayGhFinalMatch,buildGhPositionModel,deriveGhPotentialGroups,ghReplayCatalog,ghReplayVersion,validateGhValueFlow} from '@qilun/assessment-engine/gh-derived.ts';
import {restoreGhQuizDraft,ghDraftVersion} from '../apps/admin-web/src/gh-quiz-state.ts';
import {ghEvidenceCatalog} from '@qilun/assessment-engine/gh-server-evidence.ts';
import {ghReportValues,ghReportRoles,ghRadarGeometry} from '../apps/admin-web/src/gh-report-data.ts';

test('v22版本严格绑定，完整答案生成有限结果、同分INFP、当前无配置6项为0',()=>{
 const input=ghReplayExample(),r=scoreGhReportReplay(input);
 assert.deepEqual(r,scoreGhReportReplay(input));assert.equal(r.style.code,'INFP');assert.ok(r.style.pairs.every(p=>p.tie));
 assert.equal(r.traits.children.length,36);assert.equal(r.traits.parents.length,6);assert.equal(r.roles.length,8);
 assert.deepEqual(r.traits.zero_rule_ids,[278,279,280,281,282,283]);
 assert.ok(r.traits.children.every(x=>Number.isFinite(x.score)&&x.score<=30));assert.ok(r.traits.parents.every(x=>x.score===null||Number.isFinite(x.score)));
 assert.equal(r.formal_score,false);assert.equal(r.persisted_as_person_report,false);assert.equal(r.recruitment_decision_allowed,false);
 for(const choice of [1,2,3,4,5]){const i=ghReplayExample();Object.keys(i.answers).forEach(k=>i.answers[k]=choice);assert.ok(scoreGhReportReplay(i).roles.every(x=>Number.isFinite(x.scoreTotal)));}
 for(const bad of [{...input,version:'gh-server-evidence-20260930-v1'},{...input,answers:{}},{...input,person_id:'x'},{...input,purpose:'hiring_rank'}])assert.throws(()=>scoreGhReportReplay(bad));
});
test('星级边界含源码小数空档；HALF_UP和两类分段校准不混用',()=>{
 for(const [score,grade] of [[0,1],[99,1],[99.5,0],[100,2],[151,2],[151.5,0],[152,3],[260,3],[260.5,0],[261,4],[356,4],[356.5,0],[357,5]])assert.equal(gradeGh(score),grade);
 assert.equal(halfUp(1.005,2),1.01);assert.equal(halfUp(-1.005,2),-1.01);assert.equal(halfUp(70.5),71);
 assert.ok(Math.abs(calibrateGh(4,11.918)-12)<1e-10);assert.ok(Math.abs(calibrateGh(5,10.1749)-12)<1e-10);
 assert.ok(Math.abs(calibrateGh(4,20)-20)<1e-10);assert.ok(Math.abs(calibrateGh(5,28)-20)<1e-10);
 assert.throws(()=>calibrateGh(4,-1));assert.throws(()=>gradeGh(NaN));
 for(const [x,y] of [[0,0],[10,20],[20,80],[30,100],[31,100]])assert.equal(translateGhRole(x,[30,20,10]),y);
 assert.throws(()=>translateGhRole(10,[1,2,3]));
});
test('正确addSome路径：按分升序、类型平局稳定；整数输入不声称唯一历史raw',()=>{
 const i={version:ghReplayVersion,purpose:'evidence_verification_only',route:'addSomeMatchPeoRecord',component_precision:'raw',scores:{c8Score:78,qualityScore:58,motiveScore:87,valueScore:48}};
 const r=replayGhFinalMatch(i);assert.equal(r.score,71);assert.ok(Math.abs(r.raw_total-70.548)<1e-10);assert.deepEqual(r.terms.map(t=>t.type),[4,2,1,3]);
 assert.equal(replayGhFinalMatch({...i,component_precision:'rounded'}).historical_score_unique,false);
 assert.deepEqual(replayGhFinalMatch({...i,scores:{c8Score:50,qualityScore:50,motiveScore:50,valueScore:50}}).terms.map(t=>t.type),[1,2,3,4]);
 for(const bad of [{...i,route:'addMatchPeoRecord'},{...i,scores:{...i.scores,c8Score:NaN}},{...i,scores:{...i.scores,c8Score:101}},{...i,person_id:'x'}])assert.throws(()=>replayGhFinalMatch(bad));
});
test('28项岗位矩阵按成员内名次及分段聚合，只保留前10后3，重复缺失拒绝',()=>{
 const ids=ghReplayCatalog().quality_items.map(i=>i.id),member=ids.map(item=>({item,score:81}));
 const input={version:ghReplayVersion,purpose:'evidence_verification_only',route:'per_member_scoreCalibrateNew',members:[member]};
 const r=buildGhPositionModel(input);assert.equal(r.rows.length,13);assert.deepEqual(r.rows.map(x=>x.rank),[1,2,3,4,5,6,7,8,9,10,26,27,28]);
 assert.ok(r.rows.every(x=>x.score===81&&x.maxScore===81));assert.equal(r.formal_model,false);
 assert.throws(()=>buildGhPositionModel({...input,members:[member.slice(1)]}));assert.throws(()=>buildGhPositionModel({...input,members:[Array(28).fill(member[0])]}));
 const zero=buildGhPositionModel({...input,members:[member.map(r=>({...r,score:0}))]});assert.deepEqual(zero.rows,[]);assert.deepEqual(zero.all_rows,[]);
 const low=buildGhPositionModel({...input,members:[member.map(r=>({...r,score:60.49}))]}),high=buildGhPositionModel({...input,members:[member.map(r=>({...r,score:60.5}))]});
 close(low.all_rows[0].competitiveness,8);close(high.all_rows[0].competitiveness,10);
 assert.ok(high.all_rows.every(r=>r.score===61&&r.maxScore===60.5));
 assert.throws(()=>buildGhPositionModel({...input,route:'addPosi'}));
});
test('整数匹配输入的历史范围覆盖近同分换序，不把固定顺序误当唯一raw',()=>{
 const input={version:ghReplayVersion,purpose:'evidence_verification_only',route:'addSomeMatchPeoRecord',component_precision:'rounded',scores:{c8Score:90,qualityScore:90,motiveScore:90,valueScore:90}};
 for(const values of [[90,90,90,90],[50,50,51,50],[0,0,1,0],[100,100,99,100],[78,58,87,48]]){
  const names=Object.keys(input.scores),scores=Object.fromEntries(names.map((k,i)=>[k,values[i]]));
  const r=replayGhFinalMatch({...input,scores}),[lo,hi]=r.possible_historical_score_range;
  for(let mask=0;mask<16;mask++){
   const raw=Object.fromEntries(names.map((k,i)=>[k,Math.min(100,Math.max(0,values[i]+(mask&(1<<i)?.499:-.5)))]));
   const observed=replayGhFinalMatch({...input,component_precision:'raw',scores:raw}).score;
   assert.ok(observed>=lo&&observed<=hi,`${observed} outside ${lo}..${hi}`);
  }
 }
 assert.throws(()=>replayGhFinalMatch({...input,scores:{...input.scores,c8Score:90.2}}));
});
test('32词选择顺序和答案一一绑定；草稿可恢复但不能提交计分',()=>{
 const c=ghReplayCatalog(),input=ghReplayExample(),selected=c.value_groups.map(g=>g.slice(0,5)),ranked=selected.flat().slice(0,10);
 const flow={layout:c.value_layout,selected_by_group:selected,ranked},values=validateGhValueFlow(flow);
 assert.equal(scoreGhReportReplay({...input,values,value_flow:flow}).value_flow_verified,true);
 assert.throws(()=>scoreGhReportReplay({...input,value_flow:flow}));
 assert.throws(()=>validateGhValueFlow({...flow,ranked:Array(10).fill(ranked[0])}));
 assert.throws(()=>validateGhValueFlow({...flow,selected_by_group:[selected[1],...selected.slice(1)]}));
 const draft={version:ghDraftVersion,layout:c.value_layout,answers:{[Object.keys(input.answers)[0]]:5},selected,ranked,page:2,step:3,group:3};
 assert.deepEqual(restoreGhQuizDraft(draft,Object.keys(input.answers),c.value_groups),draft);
 assert.throws(()=>restoreGhQuizDraft({...draft,person_id:'x'},Object.keys(input.answers),c.value_groups));
 assert.throws(()=>restoreGhQuizDraft({...draft,answers:{999999:1}},Object.keys(input.answers),c.value_groups));
 assert.throws(()=>restoreGhQuizDraft({...draft,ranked:ranked.slice(1)},Object.keys(input.answers),c.value_groups));
 assert.throws(()=>scoreGhReportReplay(draft));
});
test('未选择的价值维度保留null；价值图先校准取1位再乘6，动机另用乘5',()=>{
 const i=ghReplayExample(),all=ghEvidenceCatalog().values,items=[...new Set(all.map(v=>v.item))].slice(0,2);
 const r=scoreGhReportReplay({...i,values:all.filter(v=>items.includes(v.item)).slice(0,10).map((v,i)=>({id:v.id,rank:i+1}))});
 assert.ok(r.values.some(v=>v.report_value===null));
 for(const v of r.values)assert.equal(v.report_value,v.calibrated===null?null:halfUp(Math.min(100,halfUp(v.calibrated,1)*6)));
 for(const m of r.motivation)assert.equal(m.report_value,halfUp(Math.min(100,m.calibrated*5)));
 const ids=ghReplayCatalog().quality_items.map(i=>i.id);
 assert.throws(()=>deriveGhPotentialGroups(ids.slice(1).map(item=>({item,value:60}))));
 const p=deriveGhPotentialGroups(ids.map(item=>({item,value:100})));assert.ok(Object.values(p.potentialMs).every(v=>v===99));
});
test('新包5个缺口保持证据等级，源码可计算不自动升级成完整历史复刻',()=>{
 const c=ghReplayCatalog();assert.equal(c.audit.gaps.length,5);assert.ok(c.audit.gaps.every(g=>g.status==='REMAINS_NOT_CLOSED'));
 assert.equal(c.audit.complete_historical_replica,false);assert.equal(c.formal_report_available,false);assert.equal(c.formal_match_available,false);
 assert.doesNotMatch(JSON.stringify(c),/candidateUid|sample_vId|321373|564068|564066|password|Bearer /);
});
test('报告值按项目与校准排序，型字不妨碍图表绑定；雷达中心来自原矢量',()=>{
 const r=scoreGhReportReplay(ghReplayExample()),v=ghReportValues(r);
 assert.equal(v.length,8);assert.ok(v.every(x=>x.label.length===2&&x.report_value!==null));
 assert.ok(v.every((x,i)=>!i||halfUp(v[i-1].calibrated!,1)>=halfUp(x.calibrated!,1)));
 const roles=ghReportRoles(r);assert.ok(roles.every((x,i)=>!i||roles[i-1].scoreTotalCalibrateSeniorNew>=x.scoreTotalCalibrateSeniorNew));
 assert.deepEqual(ghRadarGeometry.data,{cx:904,cy:323,radius:90});
 assert.deepEqual(ghRadarGeometry['talent-04'],{cx:612.5,cy:358,radius:84.75});
 const missing={...r,values:r.values.map((x,i)=>i?x:{...x,calibrated:null,report_value:null})};assert.equal(ghReportValues(missing).at(-1)!.calibrated,null);
});
const fixturePath=new URL('../.local/gh-evidence-v22/regression.json',import.meta.url);
type Fixtures={first_layer:{answers:Record<string,number>;values:{id:string;rank:number}[];expected:{type:number;item:number;score:number;calibrated:number}[]}[];derived:{rows:{type:number;item:number;score:number}[];traits:{item:number;score:number}[];roles:{itemId:number;scoreB:number;scoreC:number;scoreD:number;scoreNotion:number;scoreTotal:number;scoreTotalCalibrateJunior:number;scoreTotalCalibrateSeniorNew:number}[];style:string};matches:{scores:{c8Score:number;qualityScore:number;motiveScore:number;valueScore:number};expected:number;replay:number;raw:number}[];senior:{potential:{eiid:number;value:number}[];potential5:Record<string,number>;potentialMs:Record<string,number>;grade:{value:number;type2ScoreSum:number}}[]};
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<=1e-9,`${a} != ${b}`);
test('独立回归：6答卷24组，337原始分＋337校准分；42性格、56角色、93总匹配、4候选分组', {skip:!existsSync(fixturePath)},()=>{
 const f=JSON.parse(readFileSync(fixturePath,'utf8')) as Fixtures;
 let comparisons=0;
 for(const sample of f.first_layer){
  const r=scoreGhReportReplay({...ghReplayExample(),input_kind:'manual_answers',answers:sample.answers,values:sample.values});
  for(const e of sample.expected){const row=r.rows.find(r=>r.item===e.item&&r.type===e.type)!;assert.ok(row);close(row.score,e.score);assert.notEqual(row.calibrated,null);close(row.calibrated!,e.calibrated);comparisons++;}
 }
 assert.equal(comparisons,337);
 const d=deriveGhDimensions(f.derived.rows);assert.equal(d.style.code,f.derived.style);
 for(const expected of f.derived.traits){const actual=[...d.traits.children,...d.traits.parents].find(r=>r.item===expected.item)!;assert.ok(actual);close(actual.score!,expected.score);}
 for(const expected of f.derived.roles){const actual=d.roles.find(r=>r.item===expected.itemId)!;assert.ok(actual);for(const field of ['scoreB','scoreC','scoreD','scoreNotion','scoreTotal','scoreTotalCalibrateJunior','scoreTotalCalibrateSeniorNew'] as const)close(actual[field],expected[field]);}
 const sameAnswer=f.first_layer.find(x=>f.derived.rows.every(e=>x.expected.some(r=>r.type===e.type&&r.item===e.item&&Math.abs(r.score-e.score)<1e-9)));assert.ok(sameAnswer);
 const fromAnswers=scoreGhReportReplay({...ghReplayExample(),answers:sameAnswer.answers,values:sameAnswer.values});assert.deepEqual(fromAnswers.traits,d.traits);assert.deepEqual(fromAnswers.roles,d.roles);
 let exact=0;
 for(const m of f.matches){const r=replayGhFinalMatch({version:ghReplayVersion,purpose:'evidence_verification_only',route:'addSomeMatchPeoRecord',component_precision:'rounded',scores:m.scores});assert.equal(r.score,m.replay);close(r.raw_total,m.raw);assert.ok(Math.abs(r.score-m.expected)<=1);if(r.score===m.expected)exact++;}
 assert.equal(exact,85);assert.equal(f.matches.length,93);
 for(const s of f.senior){const r=deriveGhPotentialGroups(s.potential.map(r=>({item:r.eiid,value:r.value})));assert.deepEqual(r.potential5,s.potential5);assert.deepEqual(r.potentialMs,s.potentialMs);assert.equal(gradeGh(s.grade.type2ScoreSum),s.grade.value);}
});
