export type SaveStatus='saved'|'pending'|'saving'|'error';
export function stableDraftJSON(value:unknown):string {
 const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v!==null&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):v;
 return JSON.stringify(canonical(value));
}
/** One in-flight write per invite. Edits made during a write are never marked
 * saved by an older response, and are sent with the acknowledged revision. */
export class DraftAutosaver<T> {
 revision:number;
 value:T;
 private sequence=0;
 private acknowledged=0;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private active:Promise<void>|undefined;
 private disposed=false;
 private send:(value:T,revision:number)=>Promise<{revision:number}>;
 private status:(state:SaveStatus,error?:unknown)=>void;
 private delay:number;
 constructor(revision:number,value:T,send:(value:T,revision:number)=>Promise<{revision:number}>,status:(state:SaveStatus,error?:unknown)=>void,delay=250){this.revision=revision;this.value=value;this.send=send;this.status=status;this.delay=delay;}
 get dirty(){return this.sequence!==this.acknowledged;}
 get isSaving(){return !!this.active;}
 cancelScheduled(){clearTimeout(this.timer);}
 update(value:T){
  if(this.disposed||stableDraftJSON(value)===stableDraftJSON(this.value))return;
  this.value=value;this.sequence++;this.status(this.active?'saving':'pending');
  clearTimeout(this.timer);
  this.timer=setTimeout(()=>{void this.flush().catch(()=>{});},this.delay);
 }
 flush():Promise<void>{
  clearTimeout(this.timer);
  if(this.active)return this.active;
  if(this.disposed||!this.dirty)return Promise.resolve();
  this.active=this.write().finally(()=>{this.active=undefined;});return this.active;
 }
 private async write(){
  try{
   while(this.dirty&&!this.disposed){
    const value=this.value,sequence=this.sequence;this.status('saving');
    const result=await this.send(value,this.revision);this.revision=result.revision;this.acknowledged=sequence;
   }
   if(!this.disposed)this.status(this.dirty?'pending':'saved');
  }catch(error){if(!this.disposed)this.status('error',error);throw error;}
 }
 dispose(){this.disposed=true;clearTimeout(this.timer);}
}
