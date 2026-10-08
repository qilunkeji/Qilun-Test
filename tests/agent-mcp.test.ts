import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {agentEnvironment,agentFixture} from './helpers/agent-fixture.ts';
import {registerTaskType,pendingStatus} from '../apps/api/agent-tasks/registry.ts';
import {machineTools} from '../apps/api/agent-tasks/mcp.ts';
import {buildRunMaterial,runInput} from '../apps/api/ai-material.ts';
const forbidden=/deepseek|openai|fixture-model-secret|模型供应商/i;
registerTaskType({type:'echo_rpc',version:'test/1',title:'隔离扩展任务',description:'大写虚构文本',priority:1,default_lease_minutes:1,max_attempts:2,permissions:{trigger:['talent_lead'],read:['talent_lead']},rules_text:'转为大写',output_schema:z.object({upper:z.string()}).strict(),context_tools:[],validation_codes:['WRONG_CASE'],buildContext:async()=>({text:'fixture'}),validate:r=>{if((r as {upper:string}).upper!=='FIXTURE')throw Error('WRONG_CASE');return r;},apply:async()=>({applied:true}),onCancel:async()=>{},onFinalFailure:async()=>{},ui_status:pendingStatus});
test('MCP JSON-RPC生命周期、只认机器token、方法限制、业务token隔离',async()=>{const restore=agentEnvironment(),f=await agentFixture();try{
 for(const role of ['talent_lead','hr'])assert.equal((await f.request('/mcp/agent',{jsonrpc:'2.0',id:1,method:'ping'},role)).status,401);
 assert.equal((await f.request('/mcp/agent',undefined,null)).status,405);assert.equal((await f.request('/mcp/agent',{},null,{},'DELETE')).status,405);
 const auth={Authorization:`Bearer ${f.writer}`};assert.equal((await f.request('/api/v1/ai/meta',undefined,null,auth)).status,401);assert.equal((await f.request('/api/v1/ai/meta',undefined,'talent_lead',auth)).status,401);
 for(const method of ['initialize','ping','tools/list']){const r=await f.request('/mcp/agent',{jsonrpc:'2.0',id:1,method},null,auth);assert.equal(r.status,200);assert.ok(r.body.result);if(method==='tools/list')assert.deepEqual(r.body.result.tools.map((t:any)=>t.name),machineTools);}
 assert.equal((await f.request('/mcp/agent',{jsonrpc:'2.0',method:'notifications/initialized'},null,auth)).status,202);
 const bad=await f.request('/mcp/agent',{jsonrpc:'1.0',method:'ping'},null,auth);assert.equal(bad.status,400);
 const status=await f.rpc('get_queue_status');assert.equal(status.data.mode,'external_agent');assert.equal(status.data.wake.configured,false);
 delete process.env.AGENT_WRITE_TOKEN_SHA256;assert.equal((await f.request('/mcp/agent',{jsonrpc:'2.0',id:1,method:'ping'},null,auth)).status,503);
 }finally{await f.close();restore();}});
test('扩展类型无需增加工具：长轮询、校验留租约、试验不落库、写操作幂等、无上下文检索',async()=>{const restore=agentEnvironment(),f=await agentFixture();try{
 assert.ok((await f.rpc('list_task_types')).data.types.some((t:any)=>t.type==='echo_rpc'));
 const start=Date.now();assert.deepEqual((await f.rpc('wait_for_tasks',{types:['echo_rpc'],timeout_seconds:1})).data.queued,[]);assert.ok(Date.now()-start>=900);
 assert.equal((await f.rpc('wait_for_tasks',{timeout_seconds:26})).isError,true);
 const waiting=f.rpc('wait_for_tasks',{types:['echo_rpc'],timeout_seconds:5});await new Promise(r=>setTimeout(r,150));const svc=f.app.locals.agentRuntime.service(f.tenant),task=await svc.createTask('echo_rpc',{subject_type:'ping',subject_id:randomUUID(),input_json:{}},null);assert.equal((await waiting).data.queued[0].task_id,task.id);
 const request_id=randomUUID(),args={task_id:task.id,request_id},claim=await f.rpc('claim_task',args);assert.equal(claim.isError,false);assert.equal((await f.rpc('claim_task',args)).data.lease_token,claim.data.lease_token);
 assert.equal((await f.rpc('claim_task',{...args,lease_minutes:2})).isError,true);assert.equal((await f.rpc('get_task_context',{task_id:task.id,lease_token:claim.data.lease_token})).data.text,'fixture');
 const renew={task_id:task.id,lease_token:claim.data.lease_token,lease_minutes:2,request_id:randomUUID()};assert.deepEqual((await f.rpc('renew_lease',renew)).data,(await f.rpc('renew_lease',renew)).data);
 const submit={task_id:task.id,lease_token:claim.data.lease_token,request_id:randomUUID(),result:{upper:'wrong'}};assert.equal((await f.rpc('submit_task_result',submit)).isError,true);assert.equal((await f.rpc('get_task',{task_id:task.id})).data.state,'claimed');
 assert.equal((await f.rpc('get_contact',{task_id:task.id,lease_token:claim.data.lease_token})).data.code,'TOOL_NOT_ALLOWED_FOR_TASK');
 assert.equal((await f.rpc('submit_task_result',{...submit,result:{upper:'FIXTURE'},validate_only:true})).data.applied,false);const applied=await f.rpc('submit_task_result',{...submit,result:{upper:'FIXTURE'}});assert.equal(applied.isError,false);assert.deepEqual((await f.rpc('submit_task_result',submit)).data,applied.data);
 const receipts=JSON.stringify((await f.db.query('SELECT * FROM agent_task_receipts')).rows);assert.ok(!receipts.includes(claim.data.lease_token));assert.ok(!receipts.includes('FIXTURE'));
 const retryTask=await svc.createTask('echo_rpc',{subject_type:'ping',subject_id:randomUUID(),input_json:{}},null),c=await f.rpc('claim_task',{task_id:retryTask.id});const fail={task_id:retryTask.id,lease_token:c.data.lease_token,error_code:'AGENT_FIXTURE',message:'PRIVATE_MARKER',retry:true,request_id:randomUUID()};assert.deepEqual((await f.rpc('fail_task',fail)).data,(await f.rpc('fail_task',fail)).data);assert.equal((await svc.getTask(retryTask.id)).attempts,1);assert.ok(!JSON.stringify((await f.db.query('SELECT * FROM agent_tasks')).rows).includes('PRIVATE_MARKER'));
 }finally{await f.close();restore();}});
for(const feature of ['job_optimize','resume_review','interview_outline','transcript_analysis','comprehensive_review','report_interpretation'])test(`HTTP→MCP→结果 ${feature}，零模型调用、保留引用和零费用`,async()=>{const restore=agentEnvironment(),f=await agentFixture();try{
 await f.db.query("INSERT INTO ai_configs VALUES($1,'default','deepseek','fixture-model-secret','unreadable-key','保留未知项',1,1,1,now())",[f.tenant]);
 const input={feature,material:'PRIVATE_MARKER 虚构工作材料：完成了目录清单，手机13800000000，邮箱fixture@example.invalid。',authorized_to_send:true};
 const response=await f.request('/api/v1/ai/run',input);assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.data.status,'awaiting_agent');
 const {id,task_id}=response.body.data,tasks=(await f.db.query<{input_json:unknown}>('SELECT input_json FROM agent_tasks WHERE id=$1',[task_id])).rows;assert.ok(!JSON.stringify(tasks).includes('PRIVATE_MARKER'));
 const claim=await f.rpc('claim_task',{task_id}),evidence=claim.data.context.evidence;assert.ok(!JSON.stringify(evidence).includes('13800000000'));assert.ok(!JSON.stringify(evidence).includes('fixture@example.invalid'));assert.ok(claim.data.rules_text.includes('保留未知项'));
 // With contact redaction disabled, all six routes use exactly the original shared material builder.
 process.env.AGENT_REDACT_CONTACTS='false';const original=await buildRunMaterial(f.db,f.key,f.tenant,runInput.parse(input)),second=await f.request('/api/v1/ai/run',input),secondId=second.body.data.task_id,unredacted=await f.rpc('claim_task',{task_id:secondId});assert.deepEqual(unredacted.data.context.evidence,original.evidence);await f.request(`/api/v1/ai/tasks/${secondId}/cancel`,{});process.env.AGENT_REDACT_CONTACTS='true';
 const result={findings:[{kind:'observation',text:'有明确交付说明',citations:[{id:'E1',quote:'完成了目录清单'}]}],unknowns:[]};
 assert.equal((await f.rpc('submit_task_result',{task_id,lease_token:claim.data.lease_token,request_id:randomUUID(),result})).isError,false);const row=await f.request(`/api/v1/ai/runs/${id}`);assert.equal(row.body.data.status,'completed');assert.equal(f.modelCalls(),0);
 for(const path of ['/api/v1/ai/meta','/api/v1/ai/settings','/api/v1/ai/runs',`/api/v1/ai/runs/${id}`,'/api/v1/readiness'])assert.doesNotMatch(JSON.stringify((await f.request(path)).body),forbidden,path);
 await f.app.locals.agentRuntime.wake.drain();const logs=JSON.stringify((await f.db.query('SELECT * FROM agent_wake_log')).rows);assert.ok(!logs.includes('PRIVATE_MARKER'));assert.ok(logs.includes('skipped_unconfigured'));assert.equal(Number((await f.db.query<{cost:string}>('SELECT cost FROM ai_runs WHERE id=$1',[id])).rows[0].cost),0);
 }finally{await f.close();restore();}});
test('打码关闭时材料共用；面试问题/评估复用原校验、历史文稿与到期边界',async()=>{const restore=agentEnvironment({AGENT_REDACT_CONTACTS:'false'}),f=await agentFixture();try{
 for(const mode of ['questions','evaluate'] as const){const input=runInput.parse({feature:mode==='questions'?'interview_outline':'comprehensive_review',interview:{id:f.interview,mode,revision:1},authorized_to_send:true});const original=await buildRunMaterial(f.db,f.key,f.tenant,input);const run=await f.request('/api/v1/ai/run',input),task_id=run.body.data.task_id,c=await f.rpc('claim_task',{task_id});assert.deepEqual(c.data.context.evidence,original.evidence);
  const e=original.evidence.find(e=>mode==='questions'?e.source==='resume':e.source==='transcript')!,citations=[{id:e.id,quote:'完成了目录清单'}];
  const result=mode==='questions'?{questions:Array.from({length:10},()=>({question:'请说明如何交付目录清单？',purpose:'核验交付与复核过程',follow_up:'提供实际成果说明',citations}))}:{items:[{criterion:'执行',score:3,reason:'回答体现了具体过程',citations},{criterion:'复盘',score:null,reason:'缺少复盘回答证据',citations:[]}],unknowns:['需要补问复盘']};
  if(mode==='evaluate'){const bad={items:[{...result.items![0],citations:[]},result.items![1]],unknowns:[]};assert.equal((await f.rpc('submit_task_result',{task_id,lease_token:c.data.lease_token,request_id:randomUUID(),result:bad})).data.code,'SCORE_WITHOUT_EVIDENCE');await f.db.query('UPDATE interviews SET revision=2 WHERE id=$1',[f.interview]);}
  assert.equal((await f.rpc('submit_task_result',{task_id,lease_token:c.data.lease_token,request_id:randomUUID(),result})).isError,false);const r=await f.request(`/api/v1/ai/runs/${run.body.data.id}`);if(mode==='evaluate'){assert.equal(r.body.data.result.score,null);assert.equal(r.body.data.result.coverage,70);assert.equal(r.body.data.interview_revision,1);}
 }
 assert.doesNotMatch(JSON.stringify((await f.request(`/api/v1/interviews/${f.interview}`)).body),forbidden);
 const run=await f.request('/api/v1/ai/run',{feature:'comprehensive_review',interview:{id:f.interview,mode:'evaluate',revision:2},authorized_to_send:true}),task_id=run.body.data.task_id,c=await f.rpc('claim_task',{task_id});await f.db.query("UPDATE candidates SET retention_until=now()-interval '1 second' WHERE id=$1",[f.candidate]);const submit=await f.rpc('submit_task_result',{task_id,lease_token:c.data.lease_token,request_id:randomUUID(),result:{items:[],unknowns:[]}});assert.equal(submit.data.code,'SUBJECT_CHANGED');assert.equal((await f.rpc('get_task',{task_id})).data.state,'cancelled');
 }finally{await f.close();restore();}});
test('角色/材料组合/设置拒绝/限流与人工取消均由服务端限制',async()=>{const restore=agentEnvironment({AGENT_MAX_PENDING_PER_USER:'1',AGENT_HOURLY_LIMIT_PER_USER:'2'}),f=await agentFixture();try{
 const input={feature:'resume_review',material:'虚构工作材料：整理目录清单与核对链接。',authorized_to_send:true};for(const role of ['ops','interviewer'])assert.equal((await f.request('/api/v1/ai/run',input,role)).status,403);assert.equal((await f.request('/api/v1/ai/agent-test',{},'hr')).status,403);
 assert.equal((await f.request('/api/v1/ai/settings',{key:'PRIVATE_MARKER'})).status,409);assert.equal((await f.request('/api/v1/ai/settings/inherit',{feature:'job_optimize'})).status,409);
 assert.equal((await f.request('/api/v1/ai/run',{...input,authorized_to_send:false})).status,400);assert.equal((await f.request('/api/v1/ai/run',{...input,interview:{id:f.interview,mode:'evaluate',revision:1}})).status,400);
 const first=await f.request('/api/v1/ai/run',input);assert.equal((await f.request('/api/v1/ai/run',input)).status,429);assert.equal((await f.request(`/api/v1/ai/tasks/${first.body.data.task_id}/cancel`,{},'hr')).status,403);assert.equal((await f.request(`/api/v1/ai/tasks/${first.body.data.task_id}/cancel`,{})).status,200);const second=await f.request('/api/v1/ai/run',input);await f.request(`/api/v1/ai/tasks/${second.body.data.task_id}/cancel`,{});assert.equal((await f.request('/api/v1/ai/run',input)).status,429);
 assert.ok((await f.request('/api/v1/audit-events')).body.data.items.some((r:any)=>r.actor_label==='外部智能体'));assert.equal(f.modelCalls(),0);
 }finally{await f.close();restore();}});
