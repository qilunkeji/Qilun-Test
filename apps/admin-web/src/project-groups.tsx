import {useEffect,useState} from 'react';
import {api} from './api.ts';
import './project-groups.css';
export type ProjectGroup={id:string;name:string};
export function useProjectGroups(){
 const [groups,setGroups]=useState<ProjectGroup[]>([]),[error,setError]=useState('');
 async function reload(){try{setGroups((await api<{items:ProjectGroup[]}>('/project-groups')).items);setError('');}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void reload();},[]);return {groups,error,reload};
}
export function ProjectPicker({groups,value,onChange,filter=false,label}:{groups:ProjectGroup[];value:string;onChange:(value:string)=>void;filter?:boolean;label?:string}){
 return <select aria-label={label??(filter?'按项目组筛选':'所属项目组')} value={value} onChange={e=>onChange(e.target.value)}><option value="">{filter?'全部项目组':'未分组'}</option>{filter&&<option value="ungrouped">未分组</option>}{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>;
}
export function CreateProject({onCreated}:{onCreated:()=>void}){
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div className="project-create"><button type="button" onClick={()=>setOpen(!open)}>＋ 新建项目组</button>{open&&<form className="toolbar" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await api('/project-groups',{name});setName('');setOpen(false);onCreated();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><input aria-label="项目组名称" placeholder="项目组名称" required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/><button disabled={busy}>创建项目组</button></form>}{error&&<p role="alert">{error}</p>}</div>;
}
export function AssignProject({target,id,current,groups,onDone}:{target:'talents'|'assessment/invites';id:string;current?:string|null;groups:ProjectGroup[];onDone:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div className="project-assignment"><ProjectPicker groups={groups} value={current??''} onChange={async value=>{if(busy)return;setBusy(true);setError('');try{await api(`/${target}/${id}/project`,{project_group_id:value||null,previous_group_id:current??null});onDone();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}/>{busy&&<small>保存分组…</small>}{error&&<p role="alert">{error}</p>}</div>;
}
