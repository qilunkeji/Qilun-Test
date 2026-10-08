let csrf='';
export function setCsrf(value:string){csrf=value;}
export async function api<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch(`/api/v1${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{})},credentials:'same-origin',...(body===undefined?{}:{body:JSON.stringify(body)})});
  const payload=await response.json();
  if(!response.ok)throw new Error(`${payload.error?.message??'请求失败'}${payload.error?.fields?.map((x:{path:string;message:string})=>`；${x.path}：${x.message}`).join('')??''} [${payload.error?.code??response.status}]`);
  return payload.data as T;
}
export type Page<T>={items:T[];total:number;page:number;page_size:number};
export type Session={tenant_id:string;tenant_name:string;username:string;role:string;csrf_token:string};
export type Job={id:string;revision:number;title:string;department:string;owner:string;location:string;status:string;version_id:string};
export type JobVersion={id:string;job_id:string;version:number;title:string;department:string;owner:string;location:string;tasks:string;criteria:string;public_jd:string;status:string;change_reason:string;created_at:string};
export type JobDetail={id:string;revision:number;versions:JobVersion[]};
export type Talent={project_group_id?:string|null;id:string;name:string;purpose:string;retention_until:string;created_at:string};
export type Resume={id:string;version:number;filename:string;content_hash:string;completeness:string;created_at:string};
export type Application={id:string;candidate_id:string;name:string;title:string;job_version:number;resume_version:number;job_version_id:string;resume_version_id:string;batch:string;status:string;created_at:string};
export type TalentDetail=Talent&{assessments?:{id:string;submitted_at:string|null;created_at:string;revoked_at:string|null}[];processing_basis:string;sources:{id:string;channel:string;external_id:string;authorization_ref:string}[];resumes:Resume[];applications:Application[]};
export type ResumeDetail=Resume&{text_content:string;chunks:{id:string;line_number:number;text_content:string}[]};
export const statusLabels:Record<string,string>={draft:'草稿',pending:'待确认',open:'招聘中',paused:'暂停',closed:'关闭',archived:'归档',pending_review:'待人工审阅',recruitment:'当前招聘',talent_pool:'授权储备',full:'完整材料',summary_only:'摘要资料'};
