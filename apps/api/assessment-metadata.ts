import {z} from 'zod';
import {decryptContact} from '../../packages/security/index.ts';
export const profileSchema=z.object({phone:z.string().trim().regex(/^\+?[0-9]{7,15}$/),birth_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value&&value>='1900-01-01'&&value<=new Date().toISOString().slice(0,10);},'出生日期无效')}).strict();
export function reportMetadata(row:{profile_cipher?:string|null;tenant_id:string;active_seconds?:number|null},key:Buffer){
 const profile=row.profile_cipher?profileSchema.parse(JSON.parse(decryptContact(row.profile_cipher,key,row.tenant_id))):null;
 return {phone:profile?.phone?profile.phone.slice(0,3)+'****'+profile.phone.slice(-4):null,birth_date:profile?.birth_date??null,active_seconds:row.active_seconds??null,profile_completed:!!profile,consistency:{status:'unavailable',label:'未评定',reason:'尚无经过验证的逻辑一致性评分规则'}};
}
export function boundedActiveSeconds(prior:number|null|undefined,input:number|undefined,last:string|null|undefined,now=Date.now()){
 if(input===undefined)return prior??null;
 const previous=prior??0,delta=last?Math.max(0,Math.ceil((now-new Date(last).getTime())/1000)):0;
 return Math.min(86400,Math.max(previous,Math.min(input,previous+Math.min(delta,120)+2)));
}
