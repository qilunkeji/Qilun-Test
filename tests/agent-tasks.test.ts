import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {z} from 'zod';
import type {Request} from 'express';
import {openDatabase} from '../apps/api/db.ts';
import {AgentTasks} from '../apps/api/agent-tasks/service.ts';
import {registerTaskType,pendingStatus,getTaskType} from '../apps/api/agent-tasks/registry.ts';
import {createAgentActor} from '../apps/api/agent-auth.ts';
import {redactContacts} from '../apps/api/agent-tasks/redact.ts';
import {externalAgentMode,agentConfigured} from '../apps/api/processing-mode.ts';
import {assertModelCallAllowed,guardedTransport} from '../apps/api/model-guard.ts';
import {digest,encryptContact} from '../packages/security/index.ts';
import {createApp} from '../apps/api/app.ts';
import {createBusinessTaskTypes,agentFeatures} from '../apps/api/agent-tasks/types.ts';
import type {RunContext} from '../apps/api/agent-tasks/types.ts';
import {validationErrors} from '../apps/api/agent-tasks/validation-errors.ts';
let cancelled=0,failed=0,applied=0;
registerTaskType({type:'echo_upper',version:'test/1',title:'虚构任务',description:'隔离测试',priority:1,default_lease_minutes:1,max_attempts:2,permissions:{trigger:['talent_lead'],read:['talent_lead']},rules_text:'大写',output_schema:z.object({upper:z.string()}).strict(),context_tools:[],validation_codes:['WRONG_CASE'],buildContext:async()=>({text:'fixture'}),validate:(r)=>{const v=z.object({upper:z.string()}).parse(r);if(v.upper!=='FIXTURE')throw new Error('WRONG_CASE');return v;},apply:async()=>{applied++;return {status:'completed'};},onCancel:async()=>{cancelled++;},onFinalFailure:async()=>{failed++;},ui_status:pendingStatus});
test('外部模式开关与二层模型保护，不调用transport；默认模型模式保留',async()=>{
 const previous=process.env.PROCESSING_MODE;
 try{delete process.env.PROCESSING_MODE;assert.equal(externalAgentMode(),false);assert.doesNotThrow(()=>assertModelCallAllowed('fixture'));process.env.PROCESSING_MODE='external_agent';let calls=0;const transport:typeof fetch=async()=>{calls++;return new Response('{}');};assert.throws(()=>assertModelCallAllowed('fixture'),/禁止直接调用/);assert.throws(()=>guardedTransport(transport,'fixture')('https://example.invalid'));assert.equal(calls,0);}finally{if(previous===undefined)delete process.env.PROCESSING_MODE;else process.env.PROCESSING_MODE=previous;}
});
test('专用认证：cookie不能代替token、错误限流、只接收回环、不存明文',()=>{
 const previous=process.env.AGENT_WRITE_TOKEN_SHA256,token=randomBytes(32).toString('base64url');
 const req=(authorization?:string,ip='127.0.0.1')=>({socket:{remoteAddress:ip},ip,get:(name:string)=>name==='authorization'?authorization:undefined}) as Request;
 try{delete process.env.AGENT_WRITE_TOKEN_SHA256;assert.equal(agentConfigured(),false);const auth=createAgentActor(randomUUID());assert.throws(()=>auth(req()),(e:any)=>e.status===401);assert.throws(()=>auth(req(`Bearer ${token}`)),(e:any)=>e.status===503);process.env.AGENT_WRITE_TOKEN_SHA256=digest(token);assert.equal(auth(req(`Bearer ${token}`)).role,'agent');assert.throws(()=>auth(req(`Bearer ${token}`,'192.0.2.1')),(e:any)=>e.status===403);let clock=0;const limited=createAgentActor(randomUUID(),()=>clock);for(let i=0;i<20;i++)assert.throws(()=>limited(req(`Bearer ${'x'.repeat(40)}`)),(e:any)=>e.status===401);assert.throws(()=>limited(req(`Bearer ${token}`)),(e:any)=>e.status===429);clock=600001;assert.equal(limited(req(`Bearer ${token}`)).role,'agent');}finally{if(previous===undefined)delete process.env.AGENT_WRITE_TOKEN_SHA256;else process.env.AGENT_WRITE_TOKEN_SHA256=previous;}
});
test('联系方式纯函数打码，保留行号、薪资、编号与姓名',()=>{
 const text='姓名：虚构人\n手机：13800000000 邮箱：fixture@example.invalid\n身份证：11010119900101001X\n微信：abc_123\nWeChat: fictional\n月薪18000 岗位编号JOB13800000000';
 const result=redactContacts(text);assert.ok(!result.includes('fixture@example.invalid'));assert.ok(!result.includes('11010119900101001X'));assert.match(result,/JOB13800000000/);assert.match(result,/月薪18000/);assert.match(result,/姓名：虚构人/);assert.equal(result.split('\n').length,text.split('\n').length);assert.match(result,/\[已隐去微信\]/);
});
test('010追加迁移：独立内存队列、并发领取、校验失败留租约、试验不落库、幂等回执',async()=>{
 const db=await openDatabase(),tenant=randomUUID();
 try{await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[tenant,'虚构队列测试']);assert.equal((await db.query<{version:number}>('SELECT max(version) AS version FROM schema_migrations')).rows[0].version,12);const svc=new AgentTasks(db,tenant);const subject={subject_type:'ping' as const,subject_id:randomUUID(),input_json:{nonce:randomUUID()}};const task=await svc.createTask('echo_upper',subject,null);assert.equal((await svc.createTask('echo_upper',subject,null)).id,task.id);const claims=await Promise.allSettled([svc.claim({task_id:task.id}),svc.claim({task_id:task.id})]);assert.equal(claims.filter(c=>c.status==='fulfilled').length,1);const claim=(claims.find(c=>c.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof svc.claim>>>).value;const stored=await svc.getTask(task.id);assert.equal(stored.lease_token_hash,digest(claim.lease_token));assert.ok(!JSON.stringify(stored).includes(claim.lease_token));await assert.rejects(svc.submit(task.id,claim.lease_token,'bad',{upper:'wrong'}),/WRONG_CASE/);assert.equal((await svc.getTask(task.id)).state,'claimed');const before=applied;await svc.submit(task.id,claim.lease_token,'probe',{upper:'FIXTURE'},true);assert.equal(applied,before);const r=await svc.submit(task.id,claim.lease_token,'submit-once',{upper:'FIXTURE'});assert.deepEqual(await svc.submit(task.id,claim.lease_token,'submit-once',{upper:'WRONG'}),r);assert.equal(applied,before+1);assert.equal((await svc.getTask(task.id)).state,'succeeded');const receipt=(await db.query('SELECT response_json FROM agent_task_receipts')).rows;assert.ok(!JSON.stringify(receipt).includes('FIXTURE'));assert.ok(!JSON.stringify(receipt).includes(claim.lease_token));const other=new AgentTasks(db,randomUUID());await assert.rejects(other.getTask(task.id));}finally{await db.close();}
});
test('租约过期重排、最终失败钩子与取消钩子',async()=>{
 const db=await openDatabase(),tenant=randomUUID();try{await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[tenant,'虚构过期测试']);const svc=new AgentTasks(db,tenant);const task=await svc.createTask('echo_upper',{subject_type:'ping',subject_id:randomUUID(),input_json:{}},null);await svc.claim({task_id:task.id});await db.query("UPDATE agent_tasks SET lease_until=now()-interval '1 second' WHERE id=$1",[task.id]);await svc.sweep();assert.equal((await svc.getTask(task.id)).state,'queued');const claim=await svc.claim({task_id:task.id});const before=failed;await svc.fail(task.id,claim.lease_token,'AGENT_FIXTURE',true);assert.equal((await svc.getTask(task.id)).state,'failed');assert.equal(failed,before+1);const next=await svc.createTask('echo_upper',{subject_type:'ping',subject_id:randomUUID(),input_json:{}},null);const beforeCancel=cancelled;await svc.cancel(next.id);assert.equal(cancelled,beforeCancel+1);assert.equal((await svc.getTask(next.id)).state,'cancelled');assert.throws(()=>getTaskType('not_registered'));}finally{await db.close();}
});
test('未完成接入时外部模式fail-closed，不读Key、不外发；模型模式原测试继续验收',async()=>{
 const previous=process.env.PROCESSING_MODE,previousToken=process.env.AGENT_WRITE_TOKEN_SHA256;
 const db=await openDatabase(),tenant=randomUUID(),user=randomUUID(),token=randomBytes(32).toString('base64url');let calls=0;
 await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[tenant,'虚构保护测试']);await db.query('INSERT INTO staff_users(id,tenant_id,username,password_hash,role) VALUES($1,$2,$3,$4,$5)',[user,tenant,'fixture','unusable','talent_lead']);await db.query("INSERT INTO sessions VALUES($1,$2,$3,$4,now()+interval '1 hour')",[digest(token),tenant,user,'fixture-csrf']);
 const app=createApp(db,{origin:'http://127.0.0.1:3100',contactKey:randomBytes(32),aiTransport:async()=>{calls++;return new Response('{}');}}),server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const addr=server.address();assert.ok(addr&&typeof addr!=='string');
 try{process.env.PROCESSING_MODE='external_agent';delete process.env.AGENT_WRITE_TOKEN_SHA256;const r=await fetch(`http://127.0.0.1:${addr.port}/api/v1/ai/run`,{method:'POST',headers:{Origin:'http://127.0.0.1:3100',Cookie:`qilun_session=${token}`,'X-CSRF-Token':'fixture-csrf','Content-Type':'application/json'},body:JSON.stringify({feature:'job_optimize',material:'虚构文本仅用于隔离安全测试',authorized_to_send:true})});assert.equal(r.status,503);assert.equal((await r.json()).error.code,'AGENT_NOT_CONFIGURED');assert.equal(calls,0);assert.equal((await db.query<{n:number}>('SELECT count(*)::int AS n FROM ai_runs')).rows[0].n,0);}finally{if(previous===undefined)delete process.env.PROCESSING_MODE;else process.env.PROCESSING_MODE=previous;if(previousToken===undefined)delete process.env.AGENT_WRITE_TOKEN_SHA256;else process.env.AGENT_WRITE_TOKEN_SHA256=previousToken;await new Promise<void>(r=>server.close(()=>r()));await db.close();}
});

async function businessFixture(){
 const db=await openDatabase(),tenant=randomUUID(),user=randomUUID(),key=randomBytes(32);
 await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[tenant,'虚构业务测试']);
 await db.query('INSERT INTO staff_users(id,tenant_id,username,password_hash,role) VALUES($1,$2,$3,$4,$5)',[user,tenant,'fixture','unusable','talent_lead']);
 const definitions=createBusinessTaskTypes(key),svc=new AgentTasks(db,tenant,()=>{},type=>{const d=definitions.find(x=>x.type===type);assert.ok(d);return d;});
 const run=async(type:keyof typeof agentFeatures,extra:Partial<RunContext>={})=>{
  const id=randomUUID(),context:RunContext={feature:type,feature_title:agentFeatures[type],created_at:new Date().toISOString(),user_prompt:'保留未知项',task_brief:'虚构测试',evidence:[{id:'E1',source:'transcript',text:'虚构材料：我完成了目录清单并复核了所有链接。'}],...extra};
  await db.query("INSERT INTO ai_runs(id,tenant_id,actor_id,feature,config_feature,config_snapshot,status,input_cipher,input_hash,reserved_cost,cost) VALUES($1,$2,$3,$4,'external_agent',$5,'awaiting_agent',$6,$7,0,0)",[id,tenant,user,type,JSON.stringify({provider:'external_agent',model:'grok-bot',feature:type}),encryptContact(JSON.stringify(context),key,`ai-run:${tenant}`),digest(JSON.stringify(context))]);
  const t=await svc.createTask(type,{subject_type:'ai_run',subject_id:id,input_json:{ai_run_id:id,feature:type}},user);return {id,context,t};
 };return {db,tenant,svc,run,definitions};
}
for(const type of Object.keys(agentFeatures) as (keyof typeof agentFeatures)[])test(`${type}业务任务：加密材料、指针队列、原引用校验、零费用落库`,async()=>{
 const f=await businessFixture();try{
  const mode=type==='interview_outline'?'questions':type==='comprehensive_review'?'evaluate':undefined;
  const {id,t}=await f.run(type,mode?{mode,question_count:10,rubric:[{name:'执行',requirement:'独立交付任务',weight:100}]}:{});
  assert.ok(!JSON.stringify(t.input_json).includes('目录清单'));const claim=await f.svc.claim({task_id:t.id});assert.ok(JSON.stringify(claim.context).includes('目录清单'));
  const citations=[{id:'E1',quote:'完成了目录清单'}];
  const output=mode==='questions'?{questions:Array.from({length:10},()=>({question:'请说明目录清单是如何交付的？',purpose:'核验实际交付过程',follow_up:'说明如何复核链接',citations}))}:mode==='evaluate'?{items:[{criterion:'执行',score:3,reason:'能够说明独立交付的过程',citations}],unknowns:[]}:{findings:[{kind:'observation',text:'材料有具体交付说明',citations}],unknowns:[]};
  await assert.rejects(f.svc.submit(t.id,claim.lease_token,randomUUID(),{...output,hire:true}));assert.equal((await f.svc.getTask(t.id)).state,'claimed');
  await f.svc.submit(t.id,claim.lease_token,randomUUID(),output,true);assert.equal((await f.db.query<{status:string}>('SELECT status FROM ai_runs WHERE id=$1',[id])).rows[0].status,'awaiting_agent');
  const receipt=await f.svc.submit(t.id,claim.lease_token,randomUUID(),output);assert.equal(receipt.ai_run_id,id);
  const row=(await f.db.query<{status:string;cost:string;result:{score?:number;coverage?:number}}> ('SELECT status,cost,result FROM ai_runs WHERE id=$1',[id])).rows[0];assert.equal(row.status,'completed');assert.equal(Number(row.cost),0);
  if(mode==='evaluate'){assert.equal(row.result.score,75);assert.equal(row.result.coverage,100);}
  const summary=(await f.svc.getTask(t.id)).result_summary;assert.ok(!JSON.stringify(summary).includes('目录清单'));assert.ok(JSON.stringify(summary).includes(mode==='questions'?'questions':mode==='evaluate'?'items':'findings'));
 }finally{await f.db.close();}
});
test('业务对象到期会取消，不恢复已取消的run；失败和人工取消保留材料',async()=>{
 const f=await businessFixture();try{
  const first=await f.run('resume_review'),claim=await f.svc.claim({task_id:first.t.id});
  await f.db.query("UPDATE ai_runs SET retention_until=now()-interval '1 second' WHERE id=$1",[first.id]);
  await assert.rejects(f.svc.submit(first.t.id,claim.lease_token,randomUUID(),{findings:[],unknowns:[]}),(e:any)=>e.code==='SUBJECT_CHANGED');assert.equal((await f.svc.getTask(first.t.id)).state,'cancelled');
  assert.equal((await f.db.query<{status:string}>('SELECT status FROM ai_runs WHERE id=$1',[first.id])).rows[0].status,'cancelled');
  const second=await f.run('resume_review');await f.svc.cancel(second.t.id);assert.equal((await f.db.query<{status:string}>('SELECT status FROM ai_runs WHERE id=$1',[second.id])).rows[0].status,'cancelled');
  const third=await f.run('resume_review'),c=await f.svc.claim({task_id:third.t.id});await f.svc.fail(third.t.id,c.lease_token,'AGENT_FIXTURE',false);const failed=(await f.db.query<{status:string;error_code:string;input_cipher:string}>('SELECT status,error_code,input_cipher FROM ai_runs WHERE id=$1',[third.id])).rows[0];assert.equal(failed.status,'failed');assert.equal(failed.error_code,'AGENT_FAILED');assert.ok(failed.input_cipher);
 }finally{await f.db.close();}
});
test('面试任务严格保留题数、rubric和文稿引用校验，不接受智能体总分',async()=>{
 const f=await businessFixture();try{
  const {t}=await f.run('comprehensive_review',{mode:'evaluate',rubric:[{name:'执行',requirement:'独立交付任务',weight:70},{name:'复盘',requirement:'说明复盘过程',weight:30}],evidence:[{id:'E1',source:'job',text:'岗位要求独立交付任务'},{id:'E2',source:'transcript',text:'我完成了目录清单并复核了所有链接。'}]});
  const c=await f.svc.claim({task_id:t.id}),item={criterion:'执行',score:3,reason:'依据面试文稿进行判断',citations:[{id:'E2',quote:'完成了目录清单'}]},unknown={criterion:'复盘',score:null,reason:'未提供足够证据',citations:[]};
  const submit=(items:unknown[])=>f.svc.submit(t.id,c.lease_token,randomUUID(),{items,unknowns:[]},true);
  await assert.rejects(submit([item]),/RUBRIC_MISMATCH/);await assert.rejects(submit([{...item,citations:[]},unknown]),/SCORE_WITHOUT_EVIDENCE/);await assert.rejects(submit([{...item,citations:[{id:'E1',quote:'独立交付任务'}]},unknown]),/UNVERIFIABLE_INTERVIEW_CITATION/);
  await assert.rejects(f.svc.submit(t.id,c.lease_token,randomUUID(),{items:[item,unknown],unknowns:[],score:100},true));
  await f.svc.submit(t.id,c.lease_token,randomUUID(),{items:[item,unknown],unknowns:[]});const row=(await f.db.query<{result:{score:number|null;coverage:number}}>('SELECT result FROM ai_runs WHERE id=$1',[t.subject_id])).rows[0];assert.equal(row.result.score,null);assert.equal(row.result.coverage,70);
  const questions=await f.run('interview_outline',{mode:'questions',question_count:10}),q=await f.svc.claim({task_id:questions.t.id});await assert.rejects(f.svc.submit(q.task_id,q.lease_token,randomUUID(),{questions:[]},true));
 }finally{await f.db.close();}
});
test('连通测试校验nonce并报告领取与提交耗时；业务注册表可输出JSON Schema',async()=>{
 const f=await businessFixture();try{
  assert.equal(f.definitions.length,7);for(const def of f.definitions){assert.ok(z.toJSONSchema(def.output_schema));assert.deepEqual(def.context_tools,[]);}
  const nonce=randomUUID(),t=await f.svc.createTask('agent_ping',{subject_type:'ping',subject_id:nonce,input_json:{}},null),c=await f.svc.claim({task_id:t.id});
  assert.equal((c.context as {nonce:string}).nonce,nonce);await assert.rejects(f.svc.submit(t.id,c.lease_token,randomUUID(),{nonce:randomUUID(),ok:true}));
  const receipt=await f.svc.submit(t.id,c.lease_token,randomUUID(),{nonce,ok:true});assert.equal(receipt.status,'completed');assert.ok(Number(receipt.total_seconds)>=0);
 }finally{await f.db.close();}
});
test('错误明细不回显材料；重复创建只唤醒一次，作用域注册表不共享密钥',async()=>{
 const f=await businessFixture();try{let wakes=0;const svc=new AgentTasks(f.db,f.tenant,()=>{wakes++;},type=>f.definitions.find(d=>d.type===type)!);const subject={subject_type:'ping' as const,subject_id:randomUUID(),input_json:{}};await Promise.all([svc.createTask('agent_ping',subject,null),svc.createTask('agent_ping',subject,null)]);assert.equal(wakes,1);assert.deepEqual(validationErrors(new Error('UNVERIFIABLE_CITATION'))[0].code,'UNVERIFIABLE_CITATION');assert.ok(!JSON.stringify(validationErrors(new Error('私密虚构材料'))).includes('私密虚构材料'));}finally{await f.db.close();}
});
test('提交回执也严格限制租户，不因request_id重放泄漏另一租户结果',async()=>{
 const f=await businessFixture();try{const {t}=await f.run('resume_review'),c=await f.svc.claim({task_id:t.id}),requestId=randomUUID();await f.svc.submit(t.id,c.lease_token,requestId,{findings:[],unknowns:[]});const other=new AgentTasks(f.db,randomUUID());await assert.rejects(other.submit(t.id,c.lease_token,requestId,{findings:[],unknowns:[]}),(e:any)=>e.code==='AGENT_TASK_NOT_FOUND');}finally{await f.db.close();}
});
