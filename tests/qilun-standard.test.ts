import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadAssessmentRuntime} from '../apps/api/assessment-product.ts';
import {qilunStandardRulebook,qilunStandardVersion} from '@qilun/assessment-engine/qilun-standard.ts';
import {ghInvitePackage,qilunStandardInvitePackage,emptyGhValues,validateGhInviteDraft,scoreGhInvite} from '@qilun/assessment-engine/gh-invite.ts';
import {ghInferenceFeatureKeys,predictGhAbility} from '@qilun/assessment-engine/gh-inference.ts';
import {ghReplayExample,scoreGhReportReplay} from '@qilun/assessment-engine/gh-derived.ts';
import {mkdtemp,mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {registerInviteAdmin} from '../apps/api/invite-routes.ts';
import type {Database} from '../apps/api/db.ts';
import {ServiceError} from '../apps/api/http-error.ts';
const runtime=()=>{const r=loadAssessmentRuntime();assert.ok(r.standard,r.problem);return r.standard;};
const fixture=()=>{const r=runtime(),pkg=qilunStandardInvitePackage(r),answers=Object.fromEntries(pkg.questions.map(q=>[q.id,3])),selected=pkg.value_groups.map(g=>g.slice(0,5));return {r,pkg,answers,values:{selected,ranked:selected.flat().slice(0,10)}};};
test('固定成品规则校验13项文件、模型参数与SHA；只读参数不可被修改',()=>{
 const r=runtime();assert.equal(Object.keys(qilunStandardRulebook.artifacts).length,13);assert.equal(r.model_hash,qilunStandardRulebook.model_sha256);
 assert.equal(ghInferenceFeatureKeys.length,48);assert.equal(r.model.quality_ids.length,28);assert.equal(r.model.gamma,.1);assert.equal(r.model.linear_weight,1);assert.equal(r.model.support.length,1440);
 assert.equal(Object.isFrozen(r.model),true);assert.equal(Object.isFrozen(r.model.coefficients[0]),true);
 assert.throws(()=>{r.model.coefficients[0][0]+=1;},TypeError);
 const modelSource=readFileSync(new URL('../packages/assessment-engine/qilun-standard.ts',import.meta.url),'utf8');assert.doesNotMatch(modelSource,/fetch\(|Math\.random|Date\.now|train\(|fit\(/);
});
test('固定成品版必带能力且版本/哈希不可变，不通过参数关闭或降级留白',()=>{
 const {r,pkg}=fixture();assert.equal(pkg.version,qilunStandardVersion);assert.equal(pkg.estimate_abilities,true);assert.equal(pkg.rule_profile.abilities,'required');
 validateGhInviteDraft(pkg,{},emptyGhValues());
 for(const p of [{...pkg,estimate_abilities:false},{...pkg,model_hash:'0'.repeat(64)},{...pkg,version:'future'},{...pkg,rule_profile:{...pkg.rule_profile,abilities:'optional'}},{...pkg,rule_profile:{...pkg.rule_profile,fingerprint:'bad'}}])assert.throws(()=>validateGhInviteDraft(p as typeof pkg,{},emptyGhValues()));
 assert.throws(()=>qilunStandardInvitePackage({...r,model_hash:'0'.repeat(64)}));
});
test('同一完整答案与版本，多次、键顺序变化均产生逐字段相同的28项及全部文字',()=>{
 const {r,pkg,answers,values}=fixture(),result=()=>scoreGhInvite(pkg,answers,values,r.model,r),first=result();
 for(let i=0;i<5;i++)assert.deepEqual(result(),first);
 assert.deepEqual(scoreGhInvite(pkg,Object.fromEntries(Object.entries(answers).reverse()),values,r.model,r),first);
 assert.equal(first.version,qilunStandardVersion);assert.ok('product' in first.result);assert.equal(first.result.abilities.length,28);
 assert.ok(first.result.abilities.every(a=>Number.isInteger(a.value)&&a.value>=0&&a.value<=100));assert.equal(first.result.ability_summary.top_six.length,6);assert.equal(first.result.ability_summary.bottom_three.length,3);
 const known=scoreGhReportReplay({...ghReplayExample(),answers,values:values.ranked.map((id,i)=>({id,rank:i+1})),value_flow:{layout:pkg.layout,selected_by_group:values.selected,ranked:values.ranked}});
 for(const field of ['style','roles','strengths','traits','motivation','values','report_text'] as const)assert.deepEqual(first.result[field],known[field]);
 assert.doesNotMatch(JSON.stringify(first),/"support"|coefficients|holdout|mean_absolute_error|AgType8Map|99%|private_id/);
});
test('提交不得用缺失/错误参数或规则指纹代替；保存校验与旧版本仍可用',()=>{
 const {r,pkg,answers,values}=fixture();
 assert.throws(()=>scoreGhInvite(pkg,answers,values));assert.throws(()=>scoreGhInvite(pkg,answers,values,r.model));assert.throws(()=>scoreGhInvite(pkg,answers,values,r.model,{...r,rules_fingerprint:'0'.repeat(64)}));
 const legacy=ghInvitePackage(),old=scoreGhInvite(legacy,answers,values);assert.equal(old.version,legacy.version);assert.equal('abilities' in old.result,false);
 const oldFull=scoreGhInvite(ghInvitePackage(r.model_hash),answers,values,r.model);assert.equal('abilities' in oldFull.result,true);assert.equal('product' in oldFull.result,false);
 assert.equal(loadAssessmentRuntime('/a-fictional-root-that-does-not-exist').standard,undefined);
});
test('固定参数节点公式可独立复算，四层/排名不随图表重排；域外保留提示而不伪造可靠性',()=>{
 const r=runtime(),x=Array(48).fill(0),z=x.map((v,i)=>(v-r.model.mean[i])/r.model.scale[i]),expected=[...r.model.target_mean];
 r.model.support.forEach((s,row)=>{const d=s.reduce((n,v,i)=>n+(v-z[i])**2,0)/48,dot=s.reduce((n,v,i)=>n+v*z[i],0)/48,k=Math.exp(-.1*d)+dot;expected.forEach((_,j)=>expected[j]+=k*r.model.coefficients[row][j]);});
 const prediction=predictGhAbility(r.model,x);expected.map(v=>Math.max(0,Math.min(100,v))).forEach((v,i)=>assert.ok(Math.abs(v-prediction.values[i])<1e-8));assert.equal(predictGhAbility(r.model,Array(48).fill(1e6)).outside_observed_domain,true);
});
test('固定规则不可用的API拒绝创建新邀请，前端false也不能触发留白后备；不写数据库',async()=>{
 const app=express();let called=0;app.use(express.json());app.use((_req,res,next)=>{res.locals.auth={role:'talent_lead'};next();});
 const fakeDb={query:()=>{called++;throw new Error('must not access database');}} as unknown as Database;
 registerInviteAdmin(app,fakeDb,'http://127.0.0.1',{problem:'STANDARD_MODEL_MISMATCH'},Buffer.alloc(32,7));
 app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{assert.ok(error instanceof ServiceError);res.status(error.status).json({error:{code:error.code}});});
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{const addr=server.address();assert.ok(addr&&typeof addr!=='string');const response=await fetch(`http://127.0.0.1:${addr.port}/api/v1/assessment/invites`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate_id:randomUUID(),purpose:'只限虚构隔离测试',days:1,estimate_abilities:false})});
  assert.equal(response.status,503);assert.equal((await response.json()).error.code,'STANDARD_RULES_UNAVAILABLE');assert.equal(called,0);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
test('私有模型缺失/被改、核心规则被改均停止标准版，不重新拟合或偷偷降级',async()=>{
 const root=await mkdtemp(join(tmpdir(),'qilun-standard-rules-'));
 try{
  await mkdir(resolve(root,'.local/gh-inference-v1'),{recursive:true});const modelPath=resolve(root,'.local/gh-inference-v1/model.json');
  await copyFile('.local/gh-inference-v1/model.json',modelPath);
  for(const file of Object.keys(qilunStandardRulebook.artifacts)){const dest=resolve(root,file);await mkdir(dirname(dest),{recursive:true});await copyFile(file,dest);}
  assert.ok(loadAssessmentRuntime(root).standard);
  const field=Object.keys(qilunStandardRulebook.artifacts)[0];await writeFile(resolve(root,field),readFileSync(field,'utf8')+'\n// fictional corrupted copy\n');
  const changed=loadAssessmentRuntime(root);assert.equal(changed.standard,undefined);assert.equal(changed.problem,'STANDARD_ENGINE_MISMATCH');assert.ok(changed.legacy);
  await copyFile(field,resolve(root,field));const m=JSON.parse(readFileSync(modelPath,'utf8'));m.gamma=.2;await writeFile(modelPath,JSON.stringify(m));
  const bad=loadAssessmentRuntime(root);assert.equal(bad.standard,undefined);assert.equal(bad.problem,'STANDARD_MODEL_MISMATCH');
 }finally{await rm(root,{recursive:true,force:true});}
});
