import type {z} from 'zod';
import type {Database} from '../db.ts';
import {ServiceError} from '../http-error.ts';
export type Task={id:string;tenant_id:string;task_type:string;type_version:string;subject_type:string;subject_id:string;input_json:Record<string,unknown>;state:string;lease_token_hash:string|null;lease_until:string|null;attempts:number;max_attempts:number;created_at:string;claimed_at:string|null;completed_at:string|null;error_code:string|null;result_summary:unknown};
export type Store=Pick<Database,'query'>;
export type TaskTypeDef={type:string;version:string;title:string;description:string;priority:number;default_lease_minutes:number;max_attempts:number;permissions:{trigger:string[];read:string[]};rules_text:string;output_schema:z.ZodType;context_tools:string[];validation_codes:string[];buildContext:(task:Task,store:Store)=>Promise<unknown>;validate:(result:unknown,task:Task,context:unknown)=>unknown;apply:(result:unknown,task:Task,store:Store)=>Promise<Record<string,unknown>>;onCancel:(task:Task,store:Store)=>Promise<void>;onFinalFailure:(task:Task,store:Store)=>Promise<void>;ui_status:(task:Task)=>{label:string;stale:boolean}};
const definitions=new Map<string,TaskTypeDef>();
export function registerTaskType(def:TaskTypeDef){if(!/^[a-z][a-z0-9_]{1,60}$/.test(def.type)||definitions.has(def.type))throw new Error('Invalid or duplicate task type');definitions.set(def.type,def);}
export function getTaskType(type:string){const def=definitions.get(type);if(!def)throw new ServiceError(400,'AGENT_UNKNOWN_TASK_TYPE','未知智能体任务类型');return def;}
export function taskTypes(){return [...definitions.values()];}
export function pendingStatus(task:Task){const stale=Date.now()-Date.parse(task.created_at)>Number(process.env.AGENT_STALE_ALERT_MINUTES??10)*60000;return {label:stale?'AI 助手这会儿有点忙，结果会晚一些，材料已保存。':task.state==='claimed'?'AI 助手正在处理…':'已提交，AI 助手马上处理',stale};}
