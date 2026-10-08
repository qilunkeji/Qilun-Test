import type {Express} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {createAgentActor} from '../agent-auth.ts';
import {ServiceError} from '../http-error.ts';
import {validationErrors} from './validation-errors.ts';
import type {AgentRuntime} from './runtime.ts';
const uuid=z.uuid(),lease=z.string().regex(/^[A-Za-z0-9_-]{32,256}$/),request=z.string().min(1).max(100).optional(),types=z.array(z.string().regex(/^[a-z][a-z0-9_]{1,60}$/)).max(30).optional();
const schemas={
 get_queue_status:z.object({}).strict(),list_task_types:z.object({}).strict(),
 list_tasks:z.object({types,state:z.enum(['queued','claimed','failed']).optional(),limit:z.number().int().min(1).max(50).optional(),offset:z.number().int().min(0).max(100000).optional()}).strict(),
 wait_for_tasks:z.object({types,timeout_seconds:z.number().int().min(0).max(25).optional()}).strict(),
 claim_task:z.object({task_id:uuid.optional(),types,lease_minutes:z.number().int().min(1).max(60).optional(),request_id:request}).strict(),
 get_task_context:z.object({task_id:uuid,lease_token:lease}).strict(),renew_lease:z.object({task_id:uuid,lease_token:lease,lease_minutes:z.number().int().min(1).max(60),request_id:request}).strict(),
 submit_task_result:z.object({task_id:uuid,lease_token:lease,request_id:z.string().min(1).max(100),result:z.unknown(),validate_only:z.boolean().optional()}).strict(),
 fail_task:z.object({task_id:uuid,lease_token:lease,error_code:z.string().regex(/^AGENT_[A-Z0-9_]{1,60}$/),message:z.string().max(500).optional(),retry:z.boolean(),request_id:request}).strict(),get_task:z.object({task_id:uuid}).strict()
};
export const machineTools=Object.keys(schemas);
export function registerAgentMCP(app:Express,runtime:AgentRuntime,tenant?:string){
 const actor=createAgentActor(tenant);
 app.all('/mcp/agent',async(req,res)=>{
  res.set('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).set('Allow','POST').json({error:{code:'METHOD_NOT_ALLOWED',message:'仅接受POST'}});
  const a=actor(req),svc=runtime.service(a.tenant_id);
  const envelope=z.object({jsonrpc:z.literal('2.0'),id:z.union([z.string().max(100),z.number(),z.null()]).optional(),method:z.string().max(100),params:z.unknown().optional()}).strict().safeParse(req.body);
  if(!envelope.success)return res.status(400).json({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid Request'}});
  const rpc=envelope.data,send=(result:unknown)=>res.json({jsonrpc:'2.0',id:rpc.id??null,result});
  await runtime.db.query('INSERT INTO agent_state(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=now()',[`agent_last_seen:${a.tenant_id}`,JSON.stringify({at:new Date().toISOString()})]);
  // Run maintenance asynchronously so a slow webhook never holds a machine request.
  void runtime.wake.sweep().catch(()=>console.error('AGENT_WAKE_STORAGE_FAILED'));
  if(['initialize','notifications/initialized','ping','tools/list'].includes(rpc.method))await svc.audit(runtime.db,`agent.protocol.${rpc.method.replace(/[^a-z_]/g,'_')}`,'-','协议调用');
  if(rpc.method==='notifications/initialized')return res.status(202).end();
  if(rpc.method==='initialize')return send({protocolVersion:'2024-11-05',capabilities:{tools:{listChanged:false}},serverInfo:{name:'qilun-talent-agent',version:'1.0.0'}});
  if(rpc.method==='ping')return send({});
  const typeList=()=>runtime.types().map(d=>({type:d.type,version:d.version,title:d.title,description:d.description,priority:d.priority,default_lease_minutes:d.default_lease_minutes,rules_text:d.rules_text,output_json_schema:z.toJSONSchema(d.output_schema),context_tools:d.context_tools,validation_codes:d.validation_codes}));
  if(rpc.method==='tools/list')return send({tools:machineTools.map(name=>({name,description:`齐论人才系统通用工具：${name}`,inputSchema:z.toJSONSchema(schemas[name as keyof typeof schemas])})),_meta:{task_types:typeList()}});
  if(rpc.method!=='tools/call')return res.json({jsonrpc:'2.0',id:rpc.id??null,error:{code:-32601,message:'Method not found'}});
  let tool='unknown_tool',object='-';
  try{
   const call=z.object({name:z.string().max(100),arguments:z.record(z.string(),z.unknown()).optional()}).strict().parse(rpc.params),args=call.arguments??{};
   if(!Object.hasOwn(schemas,call.name)){
    if(typeof args.task_id==='string'&&typeof args.lease_token==='string'){const t=await svc.getTask(args.task_id);svc.verifyLease(t,args.lease_token);if(!svc.resolve(t.task_type).context_tools.includes(call.name))throw new ServiceError(403,'TOOL_NOT_ALLOWED_FOR_TASK','该任务未授权此上下文工具');}
    throw new ServiceError(403,'TOOL_NOT_ALLOWED_FOR_TASK','未提供此上下文工具');
   }
   tool=call.name;const input=schemas[tool as keyof typeof schemas].parse(args) as Record<string,unknown>;if(typeof input.task_id==='string')object=input.task_id;
   await svc.audit(runtime.db,`agent.${tool}`,object,'通用工具调用');
   let result:unknown;
   switch(tool){
    case 'get_queue_status':result=await runtime.queue(a.tenant_id);break;
    case 'list_task_types':result={types:typeList()};break;
    case 'list_tasks':result=await svc.list(input.types as string[]|undefined,input.state as string|undefined,input.limit as number|undefined,input.offset as number|undefined);break;
    case 'wait_for_tasks':{const deadline=Date.now()+Number(input.timeout_seconds??25)*1000;do{const list=await svc.list(input.types as string[]|undefined,'queued');if(list.rows.length){result={queued:list.rows.map(t=>({task_id:t.task_id,task_type:t.task_type}))};break;}if(Date.now()>=deadline||res.destroyed){result={queued:[]};break;}await new Promise(r=>setTimeout(r,Math.max(1,Math.min(1000,deadline-Date.now()))));}while(true);break;}
    case 'claim_task':{const {request_id,...claim}=input;result=await svc.claim(claim as Parameters<typeof svc.claim>[0],String(request_id??randomUUID()));break;}
    case 'get_task_context':result=await svc.context(String(input.task_id),String(input.lease_token));break;
    case 'renew_lease':result=await svc.renew(String(input.task_id),String(input.lease_token),Number(input.lease_minutes),String(input.request_id??randomUUID()));break;
    case 'submit_task_result':result=await svc.submit(String(input.task_id),String(input.lease_token),String(input.request_id),input.result,input.validate_only===true);break;
    case 'fail_task':result=await svc.fail(String(input.task_id),String(input.lease_token),String(input.error_code),input.retry===true,String(input.request_id??randomUUID()));break;
    case 'get_task':{await svc.sweep();const t=await svc.getTask(String(input.task_id));result={task_id:t.id,task_type:t.task_type,state:t.state,attempts:t.attempts,error_code:t.error_code,completed_at:t.completed_at,result_summary:t.result_summary};break;}
   }
   return send({content:[{type:'text',text:JSON.stringify(result)}]});
  }catch(error){await svc.audit(runtime.db,`agent.${tool}.rejected`,object,'操作未通过校验');const details=validationErrors(error),code=details[0]?.code??'AGENT_FAILED';return send({isError:true,content:[{type:'text',text:JSON.stringify({code,message:details[0]?.message??'操作失败',details})}]});}
 });
}
