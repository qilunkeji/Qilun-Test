import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {ghSyntheticInput,scoreGhFirstLayer,ghEvidenceCatalog} from '../packages/assessment-engine/gh-server-evidence.ts';
import rules from '../packages/assessment-engine/data/gh-server-rules.json' with {type:'json'};

test('277题五档规则全覆盖；前端模块不混同服务端分组',()=>{
 assert.equal(rules.questions.length,277);assert.equal(new Set(rules.questions.map(q=>q.id)).size,277);
 assert.deepEqual([2,3,4].map(t=>rules.questions.filter(q=>q.type===t).length),[153,60,64]);
 assert.equal(rules.values.length,64);assert.equal(rules.questions.reduce((s,q)=>s+q.scores.length,0),1385);
 assert.equal(ghEvidenceCatalog().choices.single[0],'完全符合');assert.equal(ghEvidenceCatalog().choices.single[4],'完全不符');
});
test('纯函数基础分试算确定、有限、有287项贡献且不生成招聘或正式报告',()=>{
 const input=ghSyntheticInput(),result=scoreGhFirstLayer(input);
 assert.deepEqual(result,scoreGhFirstLayer(input));assert.equal(result.contributions.length,277);assert.equal(result.value_contributions.length,10);
 assert.equal(result.rows.length,58);assert.ok(result.rows.every(r=>Number.isFinite(r.score)));
 assert.equal(result.rows.filter(r=>r.type===2).reduce((s,r)=>s+r.score,0),0);
 assert.equal(result.rows.filter(r=>r.type===4).reduce((s,r)=>s+r.score,0),64);
 assert.equal(result.rows.filter(r=>r.type===5).reduce((s,r)=>s+r.score,0),30);
 for(const flag of ['formal_score','exact_replica_ready','recruitment_decision_allowed','persisted_as_person_report'] as const)assert.equal(result[flag],false);
});
test('277题缺答、越界、未知题号、混卷和客户端覆盖均拒绝',()=>{
 const input=ghSyntheticInput(),first=rules.questions[0].id;
 const missing=structuredClone(input);delete missing.answers[first];
 for(const bad of [missing,{...input,version:'external_strength_180_v3'},{...input,person_id:'x'},{...input,purpose:'hiring_rank'},{...input,answers:{...input.answers,unknown:3}},{...input,answers:{...input.answers,[first]:0}},{...input,answers:{...input.answers,[first]:NaN}},{...input,answers:{...input.answers,[first]:'1'}},{...input,answers:{...input.answers,[first]:1.5}}])assert.throws(()=>scoreGhFirstLayer(bad));
});
test('价值观只能10个不同配置题号和1–10全排列；存储名次不是界面索引',()=>{
 const input=ghSyntheticInput();
 for(const values of [input.values.slice(0,9),Array(10).fill(input.values[0]),input.values.map(v=>({...v,rank:1})),input.values.map((v,i)=>i? v:{...v,id:rules.questions[0].id}),input.values.map((v,i)=>i? v:{...v,rank:0})])assert.throws(()=>scoreGhFirstLayer({...input,values}));
 assert.deepEqual(scoreGhFirstLayer(input).value_contributions.map(v=>v.add),[5,5,4,4,3,3,2,2,1,1]);
});
test('type3系数与type4反向编码保留；每档都用服务端表而非外部180规则',()=>{
 for(let choice=1;choice<=5;choice++){
  const input=ghSyntheticInput();for(const id of Object.keys(input.answers))input.answers[id]=choice;
  const r=scoreGhFirstLayer(input);
  assert.equal(r.rows.filter(x=>x.type===4).reduce((s,x)=>s+x.score,0),64*[2.5,1.5,1,.5,0][choice-1]);
  assert.equal(r.rows.filter(x=>x.type===2).reduce((s,x)=>s+x.score,0),153*[3,1,0,1,3][choice-1]);
  assert.ok(r.contributions.filter(x=>x.type===3).every(x=>x.parts.every(p=>[1.4,1.73,1.6,1.46].includes(p.multiplier))));
 }
});
test('45条分类不得冒充历史恢复；角色回放保留额外C4Top输入限制',()=>{
 const c=ghEvidenceCatalog();assert.equal(c.audit.closure.records,45);assert.equal(c.audit.closure.matrix_recomputed,32);
 assert.equal(c.audit.closure.historical_state_recovered,false);assert.equal(c.audit.derived.role8_requires_server_c4top,true);
 assert.equal(c.audit.derived.grade,'SOURCE_FORMULA_ONLY');assert.equal(c.formal_report_available,false);assert.equal(c.formal_match_available,false);
 assert.doesNotMatch(JSON.stringify(c),/candidateUid|sample_vId|321373|564068|564066/);
});
const privateFixtures=new URL('../.local/evidence-20260930-audit/first-layer-fixtures.json',import.meta.url);
test('本机私有真实答卷回归：TypeScript独立引擎158项全部吻合，不打包样本身份', {skip:!existsSync(privateFixtures)},()=>{
 const fixtures=JSON.parse(readFileSync(privateFixtures,'utf8')) as {answers:Record<string,number>;expected:{type:number;item:number;score:number}[];full:boolean}[];
 let compared=0;
 for(const fixture of fixtures){
  const ids=new Set(rules.questions.map(q=>q.id));
  const input={...ghSyntheticInput(),input_kind:'manual_answers',answers:Object.fromEntries(Object.entries(fixture.answers).filter(([id])=>ids.has(id))),values:Object.entries(fixture.answers).filter(([id])=>!ids.has(id)).map(([id,rank])=>({id,rank}))};
  const output=scoreGhFirstLayer(input);
  for(const r of fixture.expected){const actual=output.rows.find(x=>x.type===r.type&&x.item===r.item);assert.ok(actual);assert.ok(Math.abs(actual.score-r.score)<=1e-9);compared++;}
  if(fixture.full){const keys=new Set(fixture.expected.map(r=>`${r.type}:${r.item}`));assert.ok(output.rows.filter(r=>!keys.has(`${r.type}:${r.item}`)).every(r=>r.score===0));}
 }
 assert.equal(compared,158);
});
