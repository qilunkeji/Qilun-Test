import {useEffect,useId,useRef} from 'react';
import type { ReactNode,FormEvent } from 'react';
export function Field({label,name,value='',required=true,area=false,type='text',placeholder='',help}:{label:string;name:string;value?:string;required?:boolean;area?:boolean;type?:string;placeholder?:string;help?:string}){
  const id=useId();return <label className={area?'field wide':'field'} htmlFor={id}><span>{label}{required&&<small> *</small>}</span>{area?<textarea id={id} name={name} defaultValue={value} required={required} rows={5} placeholder={placeholder} aria-describedby={help?id+'-help':undefined}/>:<input id={id} name={name} type={type} defaultValue={value} required={required} placeholder={placeholder} aria-describedby={help?id+'-help':undefined}/ >}{help&&<small id={id+'-help'}>{help}</small>}</label>;
}
export const formValues=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();return Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string,string>;};
export function Notice({children,kind='info'}:{children:ReactNode;kind?:string}){return <div className={`notice ${kind}`} role={kind==='error'?'alert':'status'}>{children}</div>;}
export function Empty({children}:{children:ReactNode}){return <div className="empty"><span className="empty-mark">＋</span><h3>这里还没有记录</h3><p>{children}</p></div>;}
export function Badge({children}:{children:ReactNode}){return <span className="badge">{children}</span>;}
export function Pager({page,total,setPage}:{page:number;total:number;setPage:(page:number)=>void}){return <div className="pager"><span>共 {total} 条 · 第 {page} 页</span><button disabled={page===1} onClick={()=>setPage(page-1)}>上一页</button><button disabled={page*20>=total} onClick={()=>setPage(page+1)}>下一页</button></div>;}
export const date=(value?:string|null)=>{const d=new Date(value??''),p=(n:number)=>String(n).padStart(2,'0');return Number.isFinite(d.getTime())?`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`:'未知';};
export function Loading({children='正在读取…'}:{children?:ReactNode}){return <div className="loading-state" role="status" aria-busy="true">{children}</div>;}
export function RetryError({onRetry,children='读取失败，请重试。'}:{onRetry:()=>void;children?:ReactNode}){return <div className="error-state" role="alert"><p>{children}</p><button onClick={onRetry}>重新读取</button></div>;}
export function ConfirmDialog({title,children,busy=false,onCancel,onConfirm,confirmLabel,error}:{title:string;children:ReactNode;busy?:boolean;onCancel:()=>void;onConfirm:()=>void;confirmLabel:string;error?:string}){
 const ref=useRef<HTMLDialogElement>(null),id=useId();
 useEffect(()=>{const before=document.activeElement as HTMLElement|null,dialog=ref.current;dialog?.showModal();return()=>{dialog?.close();before?.focus();};},[]);
 return <dialog className="confirm-dialog" ref={ref} aria-labelledby={id} onCancel={e=>{e.preventDefault();if(!busy)onCancel();}}><h2 id={id}>{title}</h2><div className="dialog-body">{children}{error&&<Notice kind="error">{error}</Notice>}</div><div className="dialog-actions"><button autoFocus disabled={busy} onClick={onCancel}>取消</button><button className="danger" disabled={busy} onClick={onConfirm}>{busy?'正在处理…':confirmLabel}</button></div></dialog>;
}
