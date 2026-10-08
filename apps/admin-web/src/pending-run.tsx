import {useEffect,useRef,useState} from 'react';
import {api} from './api.ts';
import {Notice,Loading,RetryError} from './ui.tsx';
export type AIMeta={mode:'external_agent'|'model';processing_label:string;consent_text:string;reply_hint:string;agent_configured:boolean};
export type PendingRun={id:string;status:string;result:unknown;error_code:string|null;pending?:{task_state:string;ui_status:{label:string;stale:boolean};waiting_seconds:number}|null};
export function useAIMeta(){const [meta,setMeta]=useState<AIMeta>(),[error,setError]=useState(''),[retry,setRetry]=useState(0);useEffect(()=>{let live=true;setError('');api<AIMeta>('/ai/meta').then(r=>{if(live)setMeta(r);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[retry]);return {meta,error,retry:()=>setRetry(n=>n+1)};}
export function MetaLoading({error,retry}:{error:string;retry:()=>void}){return error?<RetryError onRetry={retry}>{error}</RetryError>:<Loading>正在读取 AI 助手状态…</Loading>;}
export function usePendingRun(runId:string|undefined,onDone?:(run:PendingRun)=>void){
 const [run,setRun]=useState<PendingRun>(),[error,setError]=useState('');const done=useRef(onDone);done.current=onDone;
 useEffect(()=>{setRun(undefined);setError('');if(!runId)return;let live=true,finished=false,busy=false,timer:ReturnType<typeof setTimeout>|undefined;
  const poll=async()=>{if(!live||busy||finished||document.hidden)return;busy=true;try{const r=await api<PendingRun>(`/ai/runs/${runId}`);if(!live)return;setRun(r);setError('');if(r.status!=='awaiting_agent'){finished=true;done.current?.(r);}}catch(e){if(live)setError((e as Error).message);}finally{busy=false;if(live&&!finished&&!document.hidden)timer=setTimeout(()=>void poll(),5000);}};
  const visible=()=>{if(timer)clearTimeout(timer);if(!document.hidden)void poll();};void poll();document.addEventListener('visibilitychange',visible);
  return()=>{live=false;if(timer)clearTimeout(timer);document.removeEventListener('visibilitychange',visible);};
 },[runId]);return {run,error};
}
export function PendingRunNotice({id,meta,onDone}:{id:string;meta:AIMeta;onDone?:(r:PendingRun)=>void}){
 const {run,error}=usePendingRun(id,onDone);if(run&&run.status!=='awaiting_agent')return run.status==='completed'?null:<Notice kind="error">AI 助手这次没能完成，材料已保存，可以重新提交。{run.error_code?` [${run.error_code}]`:''}</Notice>;
 return <div className="agent-pending" role="status"><Notice kind={run?.pending?.ui_status.stale?'error':undefined}>{run?.pending?.ui_status.label??'已提交，AI 助手马上处理'}<small>{meta.reply_hint} · 可以先离开页面，结果会保存在记录里。</small>{error&&<small>暂时无法读取状态，将自动重试；不要重复提交。</small>}</Notice></div>;
}
