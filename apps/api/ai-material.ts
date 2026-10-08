import {z} from 'zod';
import type {Database} from './db.ts';
import {interviewEvidence,interviewRequest} from './interviews.ts';
import {recruitingBrief,recruitingEvidence} from './recruiting.ts';
import {ServiceError} from './http-error.ts';
import {redactContacts} from './agent-tasks/redact.ts';
export const runInput=z.object({feature:z.enum(['job_optimize','resume_review','interview_outline','transcript_analysis','comprehensive_review','report_interpretation']),material:z.string().trim().min(10).max(12000).optional(),recruiting:recruitingBrief.optional(),interview:interviewRequest.optional(),authorized_to_send:z.literal(true)}).strict();
export async function buildRunMaterial(db:Database,key:Buffer,tenant:string,input:z.infer<typeof runInput>,redact=false){
 if(input.recruiting&&input.feature!=='job_optimize')throw new ServiceError(400,'INVALID_FEATURE','招聘需求仅用于招聘优化');
 if(input.interview&&(input.recruiting||input.material||input.feature!==(input.interview.mode==='questions'?'interview_outline':'comprehensive_review')))throw new ServiceError(400,'INVALID_FEATURE','面试任务与功能不匹配');
 const original=input.interview?await interviewEvidence(db,key,tenant,input.interview):null;
 const raw=original?JSON.stringify(original.evidence):input.recruiting?await recruitingEvidence(db,key,tenant,input.recruiting):input.material;
 if(!raw)throw new ServiceError(400,'MATERIAL_REQUIRED','请填写招聘需求或材料');
 const evidence:{id:string;text:string;source?:string}[]=original?original.evidence.map(e=>({...e,text:redact?redactContacts(e.text):e.text})):(redact?redactContacts(raw):raw).split(/\n+/).filter(x=>x.trim()).map((text,i)=>({id:`E${i+1}`,text}));
 const interview=original?{...original,evidence:evidence as typeof original.evidence}:null;
 return {material:interview?JSON.stringify(evidence):redact?redactContacts(raw):raw,evidence,interview};
}
