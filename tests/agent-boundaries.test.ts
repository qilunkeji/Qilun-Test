import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {agentEnvironment,agentFixture} from './helpers/agent-fixture.ts';
import {AgentTasks} from '../apps/api/agent-tasks/service.ts';
test('MCP原引用校验不放宽；试验提交拒绝伪造、错误编号及额外录用字段',async()=>{const restore=agentEnvironment(),f=await agentFixture();try{
 const r=await f.request('/api/v1/ai/run',{feature:'resume_review',material:'【虚构】完成了目录清单与链接核对。',authorized_to_send:true}),task_id=r.body.data.task_id,c=await f.rpc('claim_task',{task_id}),base={task_id,lease_token:c.data.lease_token};
 for(const citation of [{id:'E999',quote:'完成了目录清单'},{id:'E1',quote:'没有出现的伪造引用'}]){const s=await f.rpc('submit_task_result',{...base,request_id:randomUUID(),result:{findings:[{kind:'observation',text:'虚构判断',citations:[citation]}],unknowns:[]}});assert.equal(s.data.code,'UNVERIFIABLE_CITATION');}
 assert.equal((await f.rpc('submit_task_result',{...base,request_id:randomUUID(),result:{findings:[],unknowns:[],hire:true}})).isError,true);assert.equal((await f.rpc('get_task',{task_id})).data.state,'claimed');
 }finally{await f.close();restore();}});
test('MCP面试题数/标准/文稿来源/总分 strict；智能体无法写其他业务对象',async()=>{const restore=agentEnvironment(),f=await agentFixture();try{
 const snapshot=JSON.stringify((await f.db.query('SELECT * FROM applications')).rows);
 for(const mode of ['questions','evaluate']){const r=await f.request('/api/v1/ai/run',{feature:mode==='questions'?'interview_outline':'comprehensive_review',interview:{id:f.interview,mode,revision:1},authorized_to_send:true}),task_id=r.body.data.task_id,c=await f.rpc('claim_task',{task_id}),e=c.data.context.evidence.find((e:any)=>e.source!=='transcript'),citation={id:e.id,quote:e.text.slice(0,4)},base={task_id,lease_token:c.data.lease_token};
  if(mode==='questions')assert.equal((await f.rpc('submit_task_result',{...base,request_id:randomUUID(),result:{questions:[{question:'请说明具体过程？',purpose:'核验交付',follow_up:'提供证明',citations:[citation]}]}})).isError,true);
  else {for(const [result,code] of [[{items:[{criterion:'错误标准',score:null,reason:'证据不足',citations:[]}],unknowns:[]},'RUBRIC_MISMATCH'],[{items:[{criterion:'执行',score:3,reason:'来自简历',citations:[citation]},{criterion:'复盘',score:null,reason:'没有证据',citations:[]}],unknowns:[]},'UNVERIFIABLE_INTERVIEW_CITATION']] as const)assert.equal((await f.rpc('submit_task_result',{...base,request_id:randomUUID(),result})).data.code,code);
   assert.equal((await f.rpc('submit_task_result',{...base,request_id:randomUUID(),result:{items:[],unknowns:[],total_score:99}})).isError,true);
  }
 }
 for(const name of ['update_candidate','publish_job','update_application','update_interview','create_assessment_invite'])assert.equal((await f.rpc(name)).data.code,'TOOL_NOT_ALLOWED_FOR_TASK');assert.equal(JSON.stringify((await f.db.query('SELECT * FROM applications')).rows),snapshot);
 }finally{await f.close();restore();}});
test('并发领取只有一个成功；重建服务后领取回执一致；已取消/到期run提交取消任务',async()=>{const restore=agentEnvironment(),f=await agentFixture();try{
 for(const boundary of ['cancelled','expired']){const r=await f.request('/api/v1/ai/run',{feature:'resume_review',material:'【虚构】完成了目录清单与链接核对。',authorized_to_send:true}),task_id=r.body.data.task_id,request_id=randomUUID(),args={task_id,request_id};
 const claims=await Promise.all([f.rpc('claim_task',args),f.rpc('claim_task',{task_id})]);assert.equal(claims.filter(c=>!c.isError).length,1);const c=claims.find(c=>!c.isError)!;
 if(!claims[0].isError){const service=f.app.locals.agentRuntime.service(f.tenant),restarted=new AgentTasks(f.db,f.tenant,()=>{},service.resolve);await f.rpc('renew_lease',{task_id,lease_token:c.data.lease_token,lease_minutes:30});assert.deepEqual(JSON.parse(JSON.stringify(await restarted.claim({task_id},request_id))),c.data);}
 if(boundary==='cancelled')await f.db.query("UPDATE ai_runs SET status='cancelled' WHERE id=$1",[r.body.data.id]);else await f.db.query("UPDATE ai_runs SET retention_until=now()-interval '1 second' WHERE id=$1",[r.body.data.id]);
 assert.equal((await f.rpc('submit_task_result',{task_id,lease_token:c.data.lease_token,request_id:randomUUID(),result:{findings:[],unknowns:[]}})).data.code,'SUBJECT_CHANGED');assert.equal((await f.rpc('get_task',{task_id})).data.state,'cancelled');
 }
 }finally{await f.close();restore();}});
