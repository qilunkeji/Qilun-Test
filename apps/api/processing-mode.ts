export function externalAgentMode(){return process.env.PROCESSING_MODE==='external_agent';}
export function agentConfigured(){return /^[a-f0-9]{64}$/i.test(process.env.AGENT_WRITE_TOKEN_SHA256??'');}
export function agentNumber(name:string,fallback:number,max=10000){const value=Number(process.env[name]??fallback);return Number.isInteger(value)&&value>0&&value<=max?value:fallback;}
