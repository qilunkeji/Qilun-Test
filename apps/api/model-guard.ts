import {externalAgentMode} from './processing-mode.ts';
import {ServiceError} from './http-error.ts';
export function assertModelCallAllowed(purpose:string){
 if(externalAgentMode())throw new ServiceError(503,'EXTERNAL_AGENT_MODE',`外部智能体模式下禁止直接调用模型（${/^[a-z_]{1,60}$/.test(purpose)?purpose:'ai_task'}）`);
}
export function guardedTransport(transport:typeof fetch,purpose:string):typeof fetch{
 return (input,init)=>{assertModelCallAllowed(purpose);return transport(input,init);};
}
