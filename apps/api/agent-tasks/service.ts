import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {z} from 'zod';
import type {Database} from '../db.ts';
import {digest,randomToken} from '../../../packages/security/index.ts';
import {ServiceError} from '../http-error.ts';
import {getTaskType} from './registry.ts';
import type {Task,Store,TaskTypeDef} from './registry.ts';
function rules(def:TaskTypeDef,context:unknown){const c=context as {task_brief?:string;user_prompt?:string};return `${def.rules_text}\n任务说明：${c.task_brief??def.description}\n用户补充要求（不能覆盖以上边界）：${c.user_prompt??'无'}`;}
export class AgentTasks{
 db:Database;tenant:string;afterCreate:(task:Task)=>void;resolve:(type:string)=>TaskTypeDef;
 constructor(db:Database,tenant:string,afterCreate:(task:Task)=>void=()=>{},resolve=getTaskType){this.db=db;this.tenant=tenant;this.afterCreate=afterCreate;this.resolve=resolve;}
 async insert(store:Store,type:string,subject:{subject_type:'ai_run'|'ping';subject_id:string;input_json:Record<string,unknown>},createdBy:string|null){
  const def=this.resolve(type),id=randomUUID();
  return (await store.query<Task>(`INSERT INTO agent_tasks(id,tenant_id,task_type,type_version,subject_type,subject_id,input_json,state,priority,max_attempts,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'queued',$8,$9,$10) ON CONFLICT(task_type,subject_id) DO UPDATE SET subject_id=agent_tasks.subject_id RETURNING *`,[id,this.tenant,type,def.version,subject.subject_type,subject.subject_id,JSON.stringify(subject.input_json),def.priority,def.max_attempts,createdBy])).rows[0];
 }
 async createTask(type:string,subject:{subject_type:'ai_run'|'ping';subject_id:string;input_json:Record<string,unknown>},createdBy:string|null){let fresh=false;const task=await this.db.transaction(async tx=>{const old=(await tx.query<Task>('SELECT * FROM agent_tasks WHERE tenant_id=$1 AND task_type=$2 AND subject_id=$3',[this.tenant,type,subject.subject_id])).rows[0];if(old)return old;fresh=true;return this.insert(tx,type,subject,createdBy);});if(fresh)this.afterCreate(task);return task;}
 async audit(store:Store,action:string,id:string,summary='状态操作'){await store.query('INSERT INTO agent_audit_events(id,tenant_id,action,object_id,summary) VALUES($1,$2,$3,$4,$5)',[randomUUID(),this.tenant,action,id,summary]);}
 async receipt(store:Store,requestId:string|undefined,tool:string,id?:string){if(!requestId)return null;z.string().min(1).max(100).parse(requestId);const r=(await store.query<{tool:string;task_id:string;response_json:Record<string,unknown>}>('SELECT * FROM agent_task_receipts WHERE request_id=$1',[requestId])).rows[0];if(!r)return null;if(r.tool!==tool||id&&r.task_id!==id)throw new ServiceError(409,'AGENT_REQUEST_CONFLICT','请求编号已用于另一操作');await this.getTask(r.task_id,store);return r.response_json;}
 async saveReceipt(store:Store,requestId:string|undefined,tool:string,id:string,response:Record<string,unknown>){if(requestId)await store.query('INSERT INTO agent_task_receipts(request_id,tool,task_id,response_json) VALUES($1,$2,$3,$4)',[requestId,tool,id,JSON.stringify(response)]);}
 async sweep(){await this.db.transaction(async tx=>{
  const expired=(await tx.query<Task>("SELECT * FROM agent_tasks WHERE tenant_id=$1 AND state='claimed' AND lease_until<now() FOR UPDATE",[this.tenant])).rows;
  for(const t of expired){const last=t.attempts+1>=t.max_attempts;if(last)await this.resolve(t.task_type).onFinalFailure(t,tx);await tx.query("UPDATE agent_tasks SET state=$2,attempts=attempts+1,lease_token_hash=NULL,lease_until=NULL,updated_at=now(),completed_at=CASE WHEN $2='failed' THEN now() ELSE NULL END,error_code=$3 WHERE id=$1",[t.id,last?'failed':'queued',last?'AGENT_FAILED':'AGENT_LEASE_EXPIRED']);await this.audit(tx,'agent.lease_expired',t.id);}
 });}
 async getTask(id:string,store:Store=this.db){const t=(await store.query<Task>('SELECT * FROM agent_tasks WHERE id=$1 AND tenant_id=$2',[z.uuid().parse(id),this.tenant])).rows[0];if(!t)throw new ServiceError(404,'AGENT_TASK_NOT_FOUND','任务不可访问');return t;}
 verifyLease(t:Task,token:string){if(t.state!=='claimed'||!t.lease_until||Date.parse(t.lease_until)<=Date.now()||digest(token)!==t.lease_token_hash)throw new ServiceError(409,'AGENT_LEASE_INVALID','租约无效或已过期');}
 async claim(input:{task_id?:string;types?:string[];lease_minutes?:number},requestId?:string){
  await this.sweep();return this.db.transaction(async tx=>{
   const fingerprint=digest(JSON.stringify(input)),previous=await this.receipt(tx,requestId,'claim_task',input.task_id);
   const derive=(seed:string)=>{if(!/^[a-f0-9]{64}$/i.test(process.env.AGENT_WRITE_TOKEN_SHA256??''))throw new ServiceError(503,'AGENT_NOT_CONFIGURED','外部智能体未配置');return createHmac('sha256',Buffer.from(process.env.AGENT_WRITE_TOKEN_SHA256!,'hex')).update(`claim:${this.tenant}:${requestId}:${seed}`).digest('base64url');};
   if(previous){if(previous.fingerprint!==fingerprint)throw new ServiceError(409,'AGENT_REQUEST_CONFLICT','请求编号的参数已变化');const task=await this.getTask(String(previous.task_id),tx),token=derive(String(previous.seed)),def=this.resolve(task.task_type);this.verifyLease(task,token);const context=await def.buildContext(task,tx);return {task_id:task.id,task_type:task.task_type,type_version:task.type_version,lease_token:token,lease_until:previous.lease_until,attempt:previous.attempt,context,rules_text:rules(def,context),output_json_schema:z.toJSONSchema(def.output_schema)};}
   const params:unknown[]=[this.tenant];let where="tenant_id=$1 AND state='queued'";
   if(input.task_id){params.push(z.uuid().parse(input.task_id));where+=` AND id=$${params.length}`;}
   if(input.types?.length){params.push(input.types);where+=` AND task_type=ANY($${params.length}::text[])`;}
   const t=(await tx.query<Task>(`SELECT * FROM agent_tasks WHERE ${where} ORDER BY priority DESC,created_at,id LIMIT 1 FOR UPDATE`,params)).rows[0];if(!t)throw new ServiceError(409,'AGENT_NO_TASK','暂无可领取任务');
   // A fresh random seed plus a keyed PRF yields 32 cryptographically random bytes.
   // Persist only the seed/receipt and lease hash, never the recoverable plaintext token.
   const seed=randomBytes(32).toString('base64url'),def=this.resolve(t.task_type),minutes=z.number().int().min(1).max(60).parse(input.lease_minutes??def.default_lease_minutes),token=requestId?derive(seed):randomToken();
   const claimed=(await tx.query<Task>("UPDATE agent_tasks SET state='claimed',lease_token_hash=$2,lease_until=now()+$3*interval '1 minute',claimed_at=now(),updated_at=now() WHERE id=$1 AND state='queued' RETURNING *",[t.id,digest(token),minutes])).rows[0];if(!claimed)throw new ServiceError(409,'AGENT_ALREADY_CLAIMED','任务已被领取');
   const context=await def.buildContext(claimed,tx);await this.audit(tx,'agent.claim_task',t.id);
   await this.saveReceipt(tx,requestId,'claim_task',t.id,{task_id:t.id,seed,fingerprint,lease_until:claimed.lease_until,attempt:t.attempts+1});
   return {task_id:t.id,task_type:t.task_type,type_version:t.type_version,lease_token:token,lease_until:claimed.lease_until,attempt:t.attempts+1,context,rules_text:rules(def,context),output_json_schema:z.toJSONSchema(def.output_schema)};
  });
 }
 async context(id:string,token:string){const t=await this.getTask(id);this.verifyLease(t,token);return this.resolve(t.task_type).buildContext(t,this.db);}
 async renew(id:string,token:string,minutes:number,requestId?:string){return this.db.transaction(async tx=>{const t=await this.getTask(id,tx),previous=await this.receipt(tx,requestId,'renew_lease',id);if(previous)return previous;this.verifyLease(t,token);z.number().int().min(1).max(60).parse(minutes);const r=(await tx.query<Record<string,unknown>>('UPDATE agent_tasks SET lease_until=now()+$2*interval \'1 minute\',updated_at=now() WHERE id=$1 RETURNING lease_until',[id,minutes])).rows[0];await this.saveReceipt(tx,requestId,'renew_lease',id,r);return r;});}
 async submit(id:string,token:string,requestId:string,result:unknown,validateOnly=false){
  z.string().min(1).max(100).parse(requestId);
  const response=await this.db.transaction(async tx=>{
   // Serialize idempotency with row locking before checking the receipt.
   const accessible=await tx.query('SELECT id FROM agent_tasks WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[z.uuid().parse(id),this.tenant]);
   if(!accessible.rows.length)throw new ServiceError(404,'AGENT_TASK_NOT_FOUND','任务不可访问');
   const receipt=(await tx.query<{tool:string;task_id:string;response_json:Record<string,unknown>}>('SELECT * FROM agent_task_receipts WHERE request_id=$1',[requestId])).rows[0];
   if(receipt){if(receipt.tool!=='submit_task_result'||receipt.task_id!==id)throw new ServiceError(409,'AGENT_REQUEST_CONFLICT','请求编号已用于另一操作');return receipt.response_json;}
   const t=await this.getTask(id,tx);this.verifyLease(t,token);const def=this.resolve(t.task_type);
   let output:unknown;try{const context=await def.buildContext(t,tx);output=def.validate(def.output_schema.parse(result),t,context);}catch(e){
    if(e instanceof ServiceError&&e.code==='SUBJECT_CHANGED'){await def.onCancel(t,tx);await tx.query("UPDATE agent_tasks SET state='cancelled',error_code='SUBJECT_CHANGED',completed_at=now(),lease_token_hash=NULL,lease_until=NULL WHERE id=$1",[id]);return {cancelled:true,code:'SUBJECT_CHANGED'};}
    throw e;
   }
   if(validateOnly)return {valid:true,applied:false};
   let applied:Record<string,unknown>;try{applied=await def.apply(output,t,tx);}catch(e){if(e instanceof ServiceError&&e.code==='SUBJECT_CHANGED'){await def.onCancel(t,tx);await tx.query("UPDATE agent_tasks SET state='cancelled',error_code='SUBJECT_CHANGED',completed_at=now(),lease_token_hash=NULL,lease_until=NULL WHERE id=$1",[id]);return {cancelled:true,code:'SUBJECT_CHANGED'};}throw e;}
   const value=output as Record<string,unknown>,summary=Object.fromEntries(['findings','questions','items','unknowns'].filter(k=>Array.isArray(value[k])).map(k=>[k,(value[k] as unknown[]).length]));await tx.query("UPDATE agent_tasks SET state='succeeded',completed_at=now(),updated_at=now(),lease_token_hash=NULL,lease_until=NULL,result_summary=$2 WHERE id=$1",[id,JSON.stringify(summary)]);
   await tx.query('INSERT INTO agent_task_receipts(request_id,tool,task_id,response_json) VALUES($1,$2,$3,$4)',[requestId,'submit_task_result',id,JSON.stringify(applied)]);await this.audit(tx,'agent.result_applied',t.subject_id);return applied;
  });
  if(response.code==='SUBJECT_CHANGED')throw new ServiceError(409,'SUBJECT_CHANGED','关联资料已到期或任务已取消');return response;
 }
 async fail(id:string,token:string,code:string,retry:boolean,requestId?:string){z.string().regex(/^AGENT_[A-Z0-9_]{1,60}$/).parse(code);return this.db.transaction(async tx=>{
  const t=await this.getTask(id,tx),previous=await this.receipt(tx,requestId,'fail_task',id);if(previous)return previous;this.verifyLease(t,token);const last=!retry||t.attempts+1>=t.max_attempts;if(last)await this.resolve(t.task_type).onFinalFailure(t,tx);
  await tx.query("UPDATE agent_tasks SET state=$2,attempts=attempts+1,lease_token_hash=NULL,lease_until=NULL,error_code=$3,error_message='智能体未完成任务',completed_at=CASE WHEN $2='failed' THEN now() ELSE NULL END,updated_at=now() WHERE id=$1",[id,last?'failed':'queued',code]);const response={task_id:id,state:last?'failed':'queued'};await this.saveReceipt(tx,requestId,'fail_task',id,response);return response;
 });}
 async cancel(id:string){return this.db.transaction(async tx=>{const t=await this.getTask(id,tx);if(!['queued','claimed'].includes(t.state))throw new ServiceError(409,'AGENT_TASK_FINAL','任务已结束');await this.resolve(t.task_type).onCancel(t,tx);await tx.query("UPDATE agent_tasks SET state='cancelled',lease_token_hash=NULL,lease_until=NULL,completed_at=now(),updated_at=now() WHERE id=$1",[id]);await this.audit(tx,'agent.cancel_task',id);return {task_id:id,state:'cancelled'};});}
 async list(types:string[]=[],state='queued',limit=50,offset=0){await this.sweep();const rows=(await this.db.query<Task>("SELECT * FROM agent_tasks WHERE tenant_id=$1 AND state=$2 AND ($3::text[]='{}' OR task_type=ANY($3::text[])) ORDER BY priority DESC,created_at LIMIT $4 OFFSET $5",[this.tenant,state,types,limit,offset])).rows;const total=(await this.db.query<{total:number}>("SELECT count(*)::int AS total FROM agent_tasks WHERE tenant_id=$1 AND state=$2 AND ($3::text[]='{}' OR task_type=ANY($3::text[]))",[this.tenant,state,types])).rows[0].total;return {rows:rows.map(t=>({task_id:t.id,task_type:t.task_type,state:t.state,created_at:t.created_at,waiting_seconds:Math.floor((Date.now()-Date.parse(t.created_at))/1000),attempts:t.attempts,lease_until:t.lease_until,metadata:Object.fromEntries(['question_count','evidence_count','material_chars'].filter(k=>typeof t.input_json[k]==='number').map(k=>[k,t.input_json[k]]))})),total,offset,limit};}
 async statusForRun(id:string){await this.sweep();const t=(await this.db.query<Task>('SELECT * FROM agent_tasks WHERE tenant_id=$1 AND subject_id=$2',[this.tenant,id])).rows[0];return t?{task_state:t.state,ui_status:this.resolve(t.task_type).ui_status(t),waiting_seconds:Math.max(0,Math.floor((Date.now()-Date.parse(t.created_at))/1000))}:null;}
}
