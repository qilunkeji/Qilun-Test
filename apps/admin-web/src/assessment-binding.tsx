import {useState} from 'react';
import {api} from './api.ts';
import type {Talent} from './api.ts';
export function AssessmentBinding({id,name,people,onDone}:{id:string;name:string;people:Talent[];onDone:()=>void}){
 const [candidate,setCandidate]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <details><summary>关联人才档案</summary><div className="inset"><p>将“{name}”的本次测评关联到已有档案。不会改变答案和结果，也不会自动合并同名人员。</p><select aria-label="选择后补绑定档案" value={candidate} onChange={e=>{setCandidate(e.target.value);setConfirmed(false);}}><option value="">选择已有人才档案</option>{people.map(p=><option key={p.id} value={p.id}>{p.name} · {p.id.slice(0,8)}</option>)}</select><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我已核对参与者身份，确认关联到 {people.find(p=>p.id===candidate)?.name??'所选档案'}</label><button type="button" disabled={!candidate||!confirmed||busy} onClick={async()=>{setBusy(true);setError('');try{await api(`/assessment/invites/${id}/bind`,{candidate_id:candidate,confirm:'bind_assessment'});onDone();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>确认关联档案</button>{error&&<p role="alert">{error}</p>}</div></details>;
}
