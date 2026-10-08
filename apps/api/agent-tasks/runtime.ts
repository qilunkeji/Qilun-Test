import type {Database} from '../db.ts';
import {AgentTasks} from './service.ts';
import {createBusinessTaskTypes} from './types.ts';
import {getTaskType,taskTypes} from './registry.ts';
import {AgentWake} from './wake.ts';
import {externalAgentMode,agentConfigured,agentNumber} from '../processing-mode.ts';
import {screenTaskType} from '../resume-screen.ts';
export class AgentRuntime{
 db:Database;wake:AgentWake;definitions:ReturnType<typeof createBusinessTaskTypes>;private services=new Map<string,AgentTasks>();
 constructor(db:Database,key:Buffer,wakeTransport?:typeof fetch,now?:()=>number){this.db=db;this.definitions=[...createBusinessTaskTypes(key),screenTaskType(key)];this.wake=new AgentWake(db,wakeTransport,now);}
 types(){return [...this.definitions,...taskTypes().filter(d=>!this.definitions.some(x=>x.type===d.type))];}
 service(tenant:string){let svc=this.services.get(tenant);if(!svc){svc=new AgentTasks(this.db,tenant,t=>this.wake.fire(t,t.task_type==='agent_ping'?'test':'created'),type=>this.definitions.find(d=>d.type===type)??getTaskType(type));this.services.set(tenant,svc);}return svc;}
 async sweep(){for(const svc of this.services.values())await svc.sweep();await this.wake.sweep();}
 async queue(tenant:string){await this.service(tenant).sweep();const rows=(await this.db.query<{task_type:string;state:string;count:number}>("SELECT task_type,state,count(*)::int AS count FROM agent_tasks WHERE tenant_id=$1 GROUP BY task_type,state",[tenant])).rows;const summary=(await this.db.query<{oldest_queued_seconds:number;stale_count:number;pending_count:number}>("SELECT coalesce(max(EXTRACT(epoch FROM now()-created_at)) FILTER(WHERE state='queued'),0)::int AS oldest_queued_seconds,count(*) FILTER(WHERE state IN ('queued','claimed') AND created_at<now()-$2*interval '1 minute')::int AS stale_count,count(*) FILTER(WHERE state IN ('queued','claimed'))::int AS pending_count FROM agent_tasks WHERE tenant_id=$1",[tenant,agentNumber('AGENT_STALE_ALERT_MINUTES',10)])).rows[0];return {mode:externalAgentMode()?'external_agent':'model',agent_configured:agentConfigured(),queue:rows,...summary,wake:await this.wake.status(tenant),now:new Date().toISOString()};}
}
