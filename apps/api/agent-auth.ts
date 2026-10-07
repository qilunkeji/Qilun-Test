import {timingSafeEqual} from 'node:crypto';
import type {Request} from 'express';
import {digest} from '../../packages/security/index.ts';
import {ServiceError} from './http-error.ts';
import {agentConfigured} from './processing-mode.ts';
export function createAgentActor(defaultTenantId?:string,now:()=>number=Date.now){
 const failures=new Map<string,{count:number;until:number}>();
 return (req:Request)=>{
  const ip=req.socket.remoteAddress??'';
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip))throw new ServiceError(403,'LOCAL_ADMIN_ONLY','请通过受信任网关访问');
  for(const [key,item] of failures)if(item.until<=now())failures.delete(key);
  // req.ip is derived only from the trusted loopback proxy in production.
  const key=digest(req.ip??ip),prior=failures.get(key);
  if((prior?.count??0)>=20||failures.size>=10000&&!prior)throw new ServiceError(429,'AGENT_RATE_LIMITED','认证尝试过多，请稍后重试');
  const failed=()=>{const count=(prior?.count??0)+1;failures.set(key,{count,until:count>=20?now()+600000:prior?.until??now()+600000});};
  const match=req.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/);
  if(!match){failed();throw new ServiceError(401,'AUTH_REQUIRED','需要智能体专用凭证');}
  if(!agentConfigured()||!defaultTenantId)throw new ServiceError(503,'AGENT_NOT_CONFIGURED','外部智能体未配置');
  const expected=Buffer.from(process.env.AGENT_WRITE_TOKEN_SHA256!,'hex'),actual=Buffer.from(digest(match[1]),'hex');
  if(!timingSafeEqual(actual,expected)){failed();throw new ServiceError(401,'AUTH_REQUIRED','智能体凭证无效');}
  failures.delete(key);return {id:'agent:grok-bot',role:'agent',tenant_id:defaultTenantId};
 };
}
