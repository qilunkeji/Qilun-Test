import {useEffect,useRef,useState} from 'react';

export type View='dashboard'|'jobs'|'optimize'|'talents'|'applications'|'interviews'|'assessments'|'settings';
export type Route={view:View;id?:string;section?:string;invalid?:boolean};
const views:View[]=['jobs','optimize','talents','applications','interviews','assessments','settings'];
export function parseRoute(path:string):Route{
 const parts=path.split('/').filter(Boolean);
 if(!parts.length)return {view:'dashboard'};
 const view=parts[0] as View;
 if(!views.includes(view)||parts.length>2)return {view:'dashboard',invalid:true};
 if(view==='settings')return {view,section:parts[1]??'models'};
 if(parts[1]&&!['jobs','talents','interviews','assessments'].includes(view))return {view,invalid:true};
 if(parts[1]&&parts[1]!=='new'&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parts[1]))return {view,invalid:true};
 if(parts[1]==='new'&&!['jobs','interviews'].includes(view))return {view,invalid:true};
 return {view,id:parts[1]};
}
export function routePath(route:Route){return route.view==='dashboard'?'/':`/${route.view}${route.id?'/'+route.id:route.section?'/'+route.section:''}`;}
export function allowLeave(){return window.dispatchEvent(new Event('qilun:before-navigate',{cancelable:true}));}
export function useUnsavedChanges(dirty:boolean){
 useEffect(()=>{
  if(!dirty)return;
  const leave=(event:Event)=>{if(!window.confirm('有未保存的修改。离开后将放弃这些修改，确认离开？'))event.preventDefault();};
  const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  window.addEventListener('qilun:before-navigate',leave);window.addEventListener('beforeunload',unload);
  return()=>{window.removeEventListener('qilun:before-navigate',leave);window.removeEventListener('beforeunload',unload);};
 },[dirty]);
}
export function useRoute(){
 const [route,setRoute]=useState(()=>parseRoute(location.pathname));
 useEffect(()=>{
  let index=history.state?.qilunIndex??0,reverting=false;
  history.replaceState({...history.state,qilunIndex:index},'');history.scrollRestoration='manual';
  const changed=()=>{const target=history.state?.qilunIndex??0;if(reverting){reverting=false;return;}if(!allowLeave()){reverting=true;history.go(index-target);return;}index=target;setRoute(parseRoute(location.pathname));requestAnimationFrame(()=>window.scrollTo(0,history.state?.scrollY??0));};
  const pushed=()=>{index=history.state?.qilunIndex??index;setRoute(parseRoute(location.pathname));};
  window.addEventListener('popstate',changed);window.addEventListener('qilun:route',pushed);
  return()=>{window.removeEventListener('popstate',changed);window.removeEventListener('qilun:route',pushed);history.scrollRestoration='auto';};
 },[]);
 return [route,navigate] as const;
}
export function navigate(route:Route){
 if(!allowLeave())return;
 history.replaceState({...history.state,scrollY:window.scrollY},'');
 history.pushState({qilunIndex:(history.state?.qilunIndex??0)+1,scrollY:0,from:location.pathname},'',routePath(route));
 window.dispatchEvent(new Event('qilun:route'));window.scrollTo(0,0);
}
/** Search text stays in this browser's history state, never in a URL or server log. */
export function useListState<T>(key:string,initial:T){
 const [value,setValue]=useState<T>(()=>typeof window==='undefined'?initial:history.state?.lists?.[key]??initial);
 useEffect(()=>{const state=history.state??{};history.replaceState({...state,lists:{...state.lists,[key]:value}},'');},[key,value]);
 return [value,setValue] as const;
}
export function returnToList(view:View){
 // Back restores the exact list entry, including search, page and scroll.
 if(history.state?.qilunIndex>0&&history.state?.from===routePath({view})){history.back();}else navigate({view});
}
export function useRestoreListScroll(ready:boolean){
 const restored=useRef(false);
 useEffect(()=>{if(!ready||restored.current)return;restored.current=true;requestAnimationFrame(()=>window.scrollTo(0,history.state?.scrollY??0));},[ready]);
}
