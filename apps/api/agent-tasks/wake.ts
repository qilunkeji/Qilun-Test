import {randomUUID} from 'node:crypto';
import type {Database} from '../db.ts';
import type {Task} from './registry.ts';
import {agentNumber,externalAgentMode} from '../processing-mode.ts';
type WakeLog={id:string;reason:'created'|'rewake'|'test';task_id:string;attempts:number};
export function wakeConfiguration(){
 try{const url=new URL(process.env.AGENT_WAKE_WEBHOOK_URL??''),secret=process.env.AGENT_WAKE_WEBHOOK_SECRET??'',header=process.env.AGENT_WAKE_WEBHOOK_AUTH_HEADER??'Authorization';if(url.protocol!=='https:'||url.username||url.password||!secret||/[\r\n]/.test(secret)||!/^[A-Za-z0-9-]{1,100}$/.test(header)||['host','content-type','content-length','x-qilun-event'].includes(header.toLowerCase()))return null;return {url,secret,header};}catch{return null;}
}
export class AgentWake{
 db:Database;transport:typeof fetch;now:()=>number;private chain:Promise<unknown>=Promise.resolve();private maintenance:Promise<void>|undefined;private lastDelivery:{at:number;task:string}|undefined;
 constructor(db:Database,transport:typeof fetch=fetch,now:()=>number=Date.now){this.db=db;this.transport=transport;this.now=now;}
 fire(task:Task,reason:'created'|'rewake'|'test'='created'){this.chain=this.chain.then(()=>this.enqueue(task,reason)).catch(()=>{console.error('AGENT_WAKE_STORAGE_FAILED');});}
 async drain(){await this.chain;}
 async close(){await this.drain();await this.maintenance;}
 async enqueue(task:Task,reason:'created'|'rewake'|'test'){
  if(!this.lastDelivery){const last=(await this.db.query<{value:{at:string;task_id:string}}> ('SELECT value FROM agent_state WHERE key=$1',[`wake_last_success:${task.tenant_id}`])).rows[0];if(last)this.lastDelivery={at:Date.parse(last.value.at),task:last.value.task_id};}
  const config=wakeConfiguration(),previous=this.lastDelivery,coalesce=reason!=='test'&&previous&&this.now()-previous.at<agentNumber('AGENT_WAKE_COALESCE_SECONDS',10)*1000&&(await this.db.query("SELECT id FROM agent_tasks WHERE id=$1 AND tenant_id=$2 AND state='queued'",[previous.task,task.tenant_id])).rows.length;
  const state=!config?'skipped_unconfigured':coalesce?'coalesced':'failed',id=randomUUID();
  await this.db.transaction(async tx=>{await tx.query('INSERT INTO agent_wake_log(id,reason,task_id,status,completed_at) VALUES($1,$2,$3,$4,$5)',[id,reason,task.id,state,state==='failed'?null:new Date(this.now()).toISOString()]);await tx.query('UPDATE agent_tasks SET last_wake_at=$2,wake_count=wake_count+$3 WHERE id=$1',[task.id,new Date(this.now()).toISOString(),reason==='rewake'?1:0]);});
  if(state==='failed')await this.deliver({id,reason,task_id:task.id,attempts:0});
 }
 async deliver(log:WakeLog){
  const t=(await this.db.query<Task>('SELECT * FROM agent_tasks WHERE id=$1',[log.task_id])).rows[0];if(!t)return;
  if(t.state!=='queued'){await this.db.query("UPDATE agent_wake_log SET status='coalesced',completed_at=$2,next_attempt_at=NULL WHERE id=$1",[log.id,new Date(this.now()).toISOString()]);return;}
  const config=wakeConfiguration();if(!config){await this.db.query("UPDATE agent_wake_log SET status='skipped_unconfigured',completed_at=$2,next_attempt_at=NULL WHERE id=$1",[log.id,new Date(this.now()).toISOString()]);return;}
  const pending=(await this.db.query<{n:number}>("SELECT count(*)::int AS n FROM agent_tasks WHERE tenant_id=$1 AND state='queued'",[t.tenant_id])).rows[0].n;
  const payload={event:'agent_task.created',task_type:t.task_type,task_id:t.id,created_at:t.created_at,pending_count:pending,site:'rc.iqilun.cn'};
  let status:number|null=null,ok=false;
  try{const response=await this.transport(config.url,{method:'POST',headers:{'Content-Type':'application/json','X-Qilun-Event':'agent_task.created',[config.header]:config.header.toLowerCase()==='authorization'?`Bearer ${config.secret}`:config.secret},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(3000)});status=response.status;ok=response.ok;await response.body?.cancel();}catch{/* No raw exception, URL, key, response body, or candidate content in logs. */}
  // Initial delivery plus at most four retries: 2/5/15/60 seconds.
  const attempts=log.attempts+1,at=new Date(this.now()).toISOString(),retry=!ok&&attempts<=4?new Date(this.now()+[2,5,15,60][attempts-1]*1000).toISOString():null;
  await this.db.query('UPDATE agent_wake_log SET status=$2,http_status=$3,attempts=$4,next_attempt_at=$5,completed_at=$6 WHERE id=$1',[log.id,ok?'sent':'failed',status,attempts,retry,retry?null:at]);
  if(ok){this.lastDelivery={at:this.now(),task:t.id};await this.db.query("INSERT INTO agent_state(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=$3",[`wake_last_success:${t.tenant_id}`,JSON.stringify({at,task_id:t.id}),at]);}
 }
 async sweep(){if(!externalAgentMode())return;if(this.maintenance)return this.maintenance;this.maintenance=this.runSweep().finally(()=>{this.maintenance=undefined;});return this.maintenance;}
 private async runSweep(){
  await this.drain();
  const retries=(await this.db.query<WakeLog>("SELECT * FROM agent_wake_log WHERE status='failed' AND next_attempt_at<=$1 AND attempts<=4 ORDER BY next_attempt_at LIMIT 20",[new Date(this.now()).toISOString()])).rows;for(const log of retries)await this.deliver(log);
  const queued=(await this.db.query<Task&{last_wake_at:string|null;wake_count:number}>("SELECT * FROM agent_tasks WHERE state='queued' AND wake_count<5 ORDER BY created_at LIMIT 50")).rows;
  for(const t of queued){const age=this.now()-Date.parse(t.last_wake_at??t.created_at),interval=agentNumber('AGENT_REWAKE_AFTER_SECONDS',120)*1000*2**t.wake_count;if(age>=interval&&!((await this.db.query('SELECT id FROM agent_wake_log WHERE task_id=$1 AND next_attempt_at IS NOT NULL',[t.id])).rows.length))await this.enqueue(t,'rewake');}
 }
 async status(tenant:string){
  const logs=(await this.db.query<{status:string;http_status:number|null;created_at:string;completed_at:string|null}>("SELECT l.status,l.http_status,l.created_at,l.completed_at FROM agent_wake_log l JOIN agent_tasks t ON t.id=l.task_id WHERE t.tenant_id=$1 AND l.created_at>now()-interval '24 hours' ORDER BY l.created_at DESC",[tenant])).rows;
  const sent=logs.find(l=>l.status==='sent'),failed=logs.find(l=>l.status==='failed'),attempted=logs.filter(l=>['sent','failed'].includes(l.status));
  return {configured:!!wakeConfiguration(),host:wakeConfiguration()?.url.hostname??null,last_success_at:sent?.completed_at??null,last_failure_at:failed?.created_at??null,last_failure_status:failed?.http_status??null,success_rate_24h:attempted.length?Math.round(attempted.filter(l=>l.status==='sent').length/attempted.length*100):null,label:wakeConfiguration()?'已配置唤醒；是否连接成功以测试结果为准':'未配置，依赖智能体巡检'};
 }
}
