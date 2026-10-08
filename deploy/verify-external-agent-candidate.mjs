// Isolated in-memory database, fictional fixtures, random ephemeral credentials.
// Never point this verifier at a production database. No network transport is used.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {agentEnvironment,agentFixture} from '../tests/helpers/agent-fixture.ts';
const restore=agentEnvironment(),f=await agentFixture(undefined,resolve('dist/admin-web'));
const passed=[];
try{
 const page=await fetch(f.origin+'/');assert.equal(page.status,200);assert.match(await page.text(),/assets\/index-/);
 const health=(await f.request('/api/v1/health',undefined,null)).body.data;assert.equal(health.assessment.ready,true);
 assert.equal((await f.db.query('SELECT version FROM schema_migrations WHERE version=10')).rows.length,1);
 const before=(await f.db.query('SELECT count(*)::int n FROM candidates')).rows[0].n;
 for(const feature of ['job_optimize','resume_review','interview_outline','transcript_analysis','comprehensive_review','report_interpretation']){
  const r=await f.request('/api/v1/ai/run',{feature,material:'【虚构】隔离验收材料：完成了目录清单与链接核对。',authorized_to_send:true});assert.equal(r.status,200);
  const task_id=r.body.data.task_id,c=await f.rpc('claim_task',{task_id});assert.equal(c.isError,false);
  const submitted=await f.rpc('submit_task_result',{task_id,lease_token:c.data.lease_token,request_id:randomUUID(),result:{findings:[{kind:'observation',text:'有明确交付过程',citations:[{id:'E1',quote:'完成了目录清单'}]}],unknowns:[]}});assert.equal(submitted.isError,false);
  assert.equal((await f.request('/api/v1/ai/runs/'+r.body.data.id)).body.data.status,'completed');passed.push(feature);
 }
 for(const mode of ['questions','evaluate']){
  const feature=mode==='questions'?'interview_outline':'comprehensive_review',r=await f.request('/api/v1/ai/run',{feature,interview:{id:f.interview,mode,revision:1},authorized_to_send:true});assert.equal(r.status,200);
  const task_id=r.body.data.task_id,c=await f.rpc('claim_task',{task_id}),e=c.data.context.evidence.find(e=>e.source===(mode==='questions'?'resume':'transcript')),citations=[{id:e.id,quote:'完成了目录清单'}];
  const result=mode==='questions'?{questions:Array.from({length:10},()=>({question:'请说明如何完成清单？',purpose:'核验实际交付',follow_up:'请说明复核过程',citations}))}:{items:[{criterion:'执行',score:3,reason:'说明具体交付过程',citations},{criterion:'复盘',score:null,reason:'没有复盘证据',citations:[]}],unknowns:['需补问复盘']};
  assert.equal((await f.rpc('submit_task_result',{task_id,lease_token:c.data.lease_token,request_id:randomUUID(),result})).isError,false);passed.push('linked_interview_'+mode);
 }
 const ping=await f.request('/api/v1/ai/agent-test',{}),task_id=ping.body.data.task_id,c=await f.rpc('claim_task',{task_id});assert.equal((await f.rpc('submit_task_result',{task_id,lease_token:c.data.lease_token,request_id:randomUUID(),result:{nonce:c.data.context.nonce,ok:true}})).isError,false);
 const p=(await f.request('/api/v1/ai/agent-test/'+task_id)).body.data;assert.equal(p.status,'succeeded');assert.ok(p.timing.total_seconds>=0);passed.push('agent_ping');
 await f.app.locals.agentRuntime.wake.drain();assert.equal(f.modelCalls(),0);assert.equal((await f.db.query('SELECT count(*)::int n FROM candidates')).rows[0].n,before);
 assert.equal((await f.db.query("SELECT id FROM agent_tasks WHERE state<>'succeeded'")).rows.length,0);
 const logs=(await f.db.query('SELECT status FROM agent_wake_log')).rows;assert.ok(logs.every(x=>x.status==='skipped_unconfigured'));
 console.log(JSON.stringify({result:'passed',database:'isolated_memory',fixtures:'fictional_only',migration:12,static_page:200,assessment_ready:true,completed:passed,model_calls:0,wake:'skipped_unconfigured',timing:p.timing},null,2));
}finally{await f.close();restore();}
