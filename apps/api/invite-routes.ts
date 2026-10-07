import type {Express,Request,Response} from 'express';
import {randomUUID,randomInt} from 'node:crypto';
import {z} from 'zod';
import type {Database} from './db.ts';
import {digest,randomToken,encryptContact} from '../../packages/security/index.ts';
import {selfReviewPackage,validateAnswers,scoreSelfReview} from '../../packages/assessment-engine/self-review.ts';
import type {SelfPackage} from '../../packages/assessment-engine/self-review.ts';
import {ServiceError} from './http-error.ts';
import {ghValueDraftSchema,emptyGhValues,validateGhInviteDraft,scoreGhInvite,qilunStandardInvitePackage} from '../../packages/assessment-engine/gh-invite.ts';
import type {GhInvitePackage,GhValueDraft} from '../../packages/assessment-engine/gh-invite.ts';
import {ghProgressSchema} from '../../packages/assessment-engine/gh-progress.ts';
import type {GhProgress} from '../../packages/assessment-engine/gh-progress.ts';
import {qilunStandardVersion} from '../../packages/assessment-engine/qilun-standard.ts';
import {loadAssessmentRuntime} from './assessment-product.ts';
import type {AssessmentRuntime} from './assessment-product.ts';
import {profileSchema,reportMetadata,boundedActiveSeconds} from './assessment-metadata.ts';
type Invite={profile_cipher:string|null;active_seconds:number|null;timing_updated_at:string|null;id:string;tenant_id:string;candidate_id:string;application_id:string|null;package:SelfPackage|GhInvitePackage;value_draft:GhValueDraft|null;ui_progress:GhProgress|null;package_hash:string;purpose:string;expires_at:string;revoked_at:string|null;answers:Record<string,number>;revision:number;consent_at:string|null;submitted_at:string|null;answer_hash:string|null;report:unknown;created_by:string;name:string};
function isGh(pkg:Invite['package']):pkg is GhInvitePackage{return 'kind' in pkg&&pkg.kind==='gh_reference_277';}
const missing=()=>new ServiceError(404,'INVITE_UNAVAILABLE','链接或访问码无效，或邀请已撤销、到期；请联系邀请人。');
const send=(res:Response,data:unknown,status=200)=>res.status(status).json({data,request_id:res.locals.requestId});
function business(res:Response){const a=res.locals.auth;if(!['hr','talent_lead'].includes(a.role))throw new ServiceError(403,'FORBIDDEN_SCOPE','当前角色无测评管理权限');return a;}
const authFields={token:z.string().min(32).max(128),pin:z.string().regex(/^\d{6}$/)};
export function registerPublicInvites(app:Express,db:Database,runtime:AssessmentRuntime,contactKey:Buffer){
 const inverse=runtime.legacy;
 const failures=new Map<string,{count:number;until:number}>();
 async function lookup(req:Request,tx:Pick<Database,'query'>,input:{token:string;pin:string},lock=false){
  for(const [k,v] of failures)if(v.until<Date.now())failures.delete(k);
  const ip=digest(req.ip??'local');
  if((failures.get(ip)?.count??0)>=10||failures.size>10000)throw new ServiceError(429,'RATE_LIMITED','访问码尝试过多，请10分钟后再试');
  const hash=digest(input.token);
  const row=(await tx.query<Invite>(`SELECT i.*,c.name FROM assessment_invites i JOIN candidates c ON c.tenant_id=i.tenant_id AND c.id=i.candidate_id WHERE i.token_hash=$1 AND i.pin_hash=$2 AND i.revoked_at IS NULL AND i.expires_at>now() AND c.retention_until>now() ${lock?'FOR UPDATE OF i':''}`,[hash,digest(`${hash}:${input.pin}`)])).rows[0];
  if(!row){failures.set(ip,{count:(failures.get(ip)?.count??0)+1,until:Date.now()+600000});throw missing();}
  return row;
 }
 app.post('/api/v1/public/assessment/open',async(req,res)=>{
  const input=z.object(authFields).strict().parse(req.body),row=await lookup(req,db,input);
  send(res,{id:row.id,name:row.name,metadata:reportMetadata(row,contactKey),package:row.package,purpose:row.purpose,expires_at:row.expires_at,answers:row.answers,...(isGh(row.package)?{value_draft:row.value_draft??emptyGhValues(),ui_progress:row.ui_progress}:{}),revision:row.revision,consented:!!row.consent_at,submitted:!!row.submitted_at,report:row.report,submitted_at:row.submitted_at,package_hash:row.package_hash});
 });
 app.post('/api/v1/public/assessment/consent',async(req,res)=>{
  const input=z.object({...authFields,consent_version:z.string().max(100),accepted:z.literal(true),profile:profileSchema.optional()}).strict().parse(req.body);
  const row=await lookup(req,db,input);
  if(input.consent_version!==row.package.consent_version)throw new ServiceError(400,'INVALID_CONSENT_VERSION','请阅读本次邀请对应的说明后确认');
  const metadata=await db.transaction(async tx=>{const locked=await lookup(req,tx,input,true);if(locked.submitted_at)throw new ServiceError(409,'ALREADY_SUBMITTED','已提交的资料不可修改');const cipher=input.profile?encryptContact(JSON.stringify(input.profile),contactKey,locked.tenant_id):locked.profile_cipher;await tx.query('UPDATE assessment_invites SET consent_at=coalesce(consent_at,now()),profile_cipher=$2,active_seconds=coalesce(active_seconds,0),timing_updated_at=coalesce(timing_updated_at,now()) WHERE id=$1',[locked.id,cipher]);return reportMetadata({...locked,profile_cipher:cipher,active_seconds:locked.active_seconds??0},contactKey);});send(res,{consented:true,metadata});
 });
 for(const action of ['save','submit'] as const)app.post(`/api/v1/public/assessment/${action}`,async(req,res)=>{
  const input=z.object({...authFields,revision:z.number().int().min(0),answers:z.record(z.string(),z.number().int().min(1).max(5)),value_draft:ghValueDraftSchema.optional(),ui_progress:ghProgressSchema.optional(),active_seconds:z.number().int().min(0).max(86400).optional()}).strict().parse(req.body);
  const data=await db.transaction(async tx=>{
   const row=await lookup(req,tx,input,true);
   if(!row.consent_at)throw new ServiceError(409,'CONSENT_REQUIRED','请先阅读并同意说明');
   if(input.ui_progress&&!isGh(row.package))throw new ServiceError(400,'INVALID_PROGRESS','此版本不支持此进度格式');
   let answers:Record<string,number>,values:GhValueDraft|null=null;
   try{if(isGh(row.package)){answers=input.answers;values=validateGhInviteDraft(row.package,answers,input.value_draft??row.value_draft??emptyGhValues(),action==='submit');}else{if(input.value_draft)throw new Error('不支持价值观字段');answers=validateAnswers(row.package,input.answers,action==='submit');}}catch(e){throw new ServiceError(400,'INVALID_ANSWERS',isGh(row.package)?(e as Error).message:'题目或答案无效，提交前必须答完全部题目');}
   const sorted=Object.entries(answers).sort(([a],[b])=>a.localeCompare(b));
   const hash=digest(JSON.stringify(values?{answers:sorted,selected:values.selected.map(g=>[...g].sort()),ranked:values.ranked}:sorted));
   if(row.submitted_at){if(action==='submit'&&row.answer_hash===hash)return {revision:row.revision,report:row.report,submitted:true,metadata:reportMetadata(row,contactKey),submitted_at:row.submitted_at};throw new ServiceError(409,'ALREADY_SUBMITTED','已提交的答卷不可修改');}
   if(input.revision!==row.revision)throw new ServiceError(409,'DRAFT_CONFLICT','另一页面已保存新版本，请重新进入后继续；当前答案未覆盖服务器');
   if(action==='submit'&&isGh(row.package)&&row.package.version===qilunStandardVersion&&(!runtime.standard||!('rule_profile' in row.package)||row.package.rule_profile.fingerprint!==runtime.standard.rules_fingerprint))throw new ServiceError(503,'INVITE_RULES_UNAVAILABLE','本次邀请对应的固定测评规则暂不可用，未提交；答案仍可保存，请联系邀请人。');
   if(action==='submit'&&isGh(row.package)&&row.package.estimate_abilities&&row.package.model_hash!==inverse?.hash)throw new ServiceError(503,'INVITE_MODEL_UNAVAILABLE','本次邀请对应的推算模型未加载或已变化，未提交；请联系邀请人。');
   const report=action==='submit'?(isGh(row.package)?scoreGhInvite(row.package,answers,values!,inverse?.model,runtime.standard):scoreSelfReview(row.package,answers)):null;
   const elapsed=boundedActiveSeconds(row.active_seconds,input.active_seconds,row.timing_updated_at);
   await tx.query(`UPDATE assessment_invites SET active_seconds=$8,timing_updated_at=now(),answers=$2,revision=revision+1,report=$3,answer_hash=$4,submitted_at=CASE WHEN $5 THEN now() ELSE NULL END,value_draft=$6,ui_progress=coalesce($7,ui_progress) WHERE id=$1`,[row.id,JSON.stringify(answers),report?JSON.stringify(report):null,action==='submit'?hash:null,action==='submit',values?JSON.stringify(values):null,input.ui_progress?JSON.stringify(input.ui_progress):null,elapsed]);
   if(action==='submit')await tx.query('INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),row.tenant_id,row.created_by,'assessment.public_submitted',row.id]);
   const saved=(await tx.query<{submitted_at:string|null}>('SELECT submitted_at FROM assessment_invites WHERE id=$1',[row.id])).rows[0];
   return {revision:row.revision+1,report,submitted:action==='submit',metadata:reportMetadata({...row,active_seconds:elapsed},contactKey),submitted_at:saved.submitted_at};
  });send(res,data);
 });
}
export function registerInviteAdmin(app:Express,db:Database,h5Origin:string,runtime:AssessmentRuntime,contactKey:Buffer){
 const inverse=runtime.legacy;
 app.post('/api/v1/assessment/people',async(req,res)=>{
  const a=business(res),input=z.object({name:z.string().trim().min(1).max(80),processing_basis:z.string().trim().min(5).max(500)}).strict().parse(req.body),id=randomUUID();
  await db.transaction(async tx=>{
   await tx.query("INSERT INTO candidates(id,tenant_id,name,purpose,processing_basis,retention_until,created_by) VALUES($1,$2,$3,'talent_pool',$4,now()+interval '365 days',$5)",[id,a.tenant_id,input.name,input.processing_basis,a.user_id]);
   await tx.query('INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),a.tenant_id,a.user_id,'assessment.person_created',id]);
  });send(res,{id},201);
 });
 app.get('/api/v1/assessment/invites',async(req,res)=>{
  const a=business(res);const query=z.object({q:z.string().max(100).optional()}).strict().parse(req.query);
  const rows=(await db.query(`SELECT i.id,i.candidate_id,i.application_id,c.name,i.package->>'title' AS title,i.package->>'version' AS version,i.purpose,i.expires_at,i.revoked_at,i.submitted_at,i.revision,i.created_at FROM assessment_invites i JOIN candidates c ON c.tenant_id=i.tenant_id AND c.id=i.candidate_id WHERE i.tenant_id=$1 AND c.retention_until>now() AND c.name ILIKE $2 ORDER BY i.created_at DESC LIMIT 100`,[a.tenant_id,`%${query.q??''}%`])).rows;
  send(res,{items:rows,h5_origin:h5Origin,package:selfReviewPackage,reference_available:true,ability_estimate_available:!!inverse,standard_assessment_available:!!runtime.standard,standard_assessment_version:qilunStandardVersion,limit:100});
 });
 app.post('/api/v1/assessment/invites',async(req,res)=>{
  const a=business(res),input=z.object({candidate_id:z.uuid(),application_id:z.uuid().optional(),purpose:z.string().trim().min(5).max(200),days:z.number().int().min(1).max(30),package_kind:z.enum(['self_review_24','gh_reference_277']).default('gh_reference_277'),estimate_abilities:z.boolean().optional()}).strict().parse(req.body);
  // Accept the deprecated checkbox field from already-open old clients, but
  // never allow it to disable mandatory abilities in a NEW standard snapshot.
  if(input.package_kind==='self_review_24')throw new ServiceError(409,'STANDARD_ASSESSMENT_REQUIRED','现在统一提供齐论完整测评，请刷新页面后重新发起邀请。已有测评可继续完成。');
  if(input.package_kind==='gh_reference_277'&&!runtime.standard)throw new ServiceError(503,'STANDARD_RULES_UNAVAILABLE','测评服务暂不可用，请稍后重试；未创建不完整的测评邀请。');
  const candidate=(await db.query<{retention_until:string}>('SELECT retention_until FROM candidates WHERE tenant_id=$1 AND id=$2 AND retention_until>now()',[a.tenant_id,input.candidate_id])).rows[0];if(!candidate)throw missing();
  if(input.application_id&&!(await db.query('SELECT id FROM applications WHERE tenant_id=$1 AND id=$2 AND candidate_id=$3',[a.tenant_id,input.application_id,input.candidate_id])).rows.length)throw missing();
  const id=randomUUID(),token=randomToken(),pin=String(randomInt(100000,1000000)),hash=digest(token),pkg=JSON.stringify(input.package_kind==='gh_reference_277'?qilunStandardInvitePackage(runtime.standard!):selfReviewPackage);
  const expires=new Date(Math.min(Date.now()+input.days*86400000,new Date(candidate.retention_until).getTime())).toISOString();
  await db.transaction(async tx=>{
   await tx.query('INSERT INTO assessment_invites(id,tenant_id,candidate_id,application_id,token_hash,pin_hash,package,package_hash,purpose,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,a.tenant_id,input.candidate_id,input.application_id??null,hash,digest(`${hash}:${pin}`),pkg,digest(pkg),input.purpose,expires,a.user_id]);
   await tx.query('INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),a.tenant_id,a.user_id,'assessment.invited',id]);
  });send(res,{id,url:`${h5Origin}/h5/#${token}`,report_url:`${h5Origin}/h5/report#${token}`,pin,expires_at:expires},201);
 });
 app.post('/api/v1/assessment/invites/:id/revoke',async(req,res)=>{
  const a=business(res);z.object({}).strict().parse(req.body);const id=z.uuid().parse(req.params.id);
  const rows=await db.query('UPDATE assessment_invites SET revoked_at=coalesce(revoked_at,now()) WHERE tenant_id=$1 AND id=$2 RETURNING id',[a.tenant_id,id]);if(!rows.rows.length)throw missing();
  await db.query('INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),a.tenant_id,a.user_id,'assessment.revoked',id]);send(res,{revoked:true});
 });
 app.get('/api/v1/assessment/invites/:id/report',async(req,res)=>{
  const a=business(res);const row=(await db.query<Invite>(`SELECT i.id,i.tenant_id,i.profile_cipher,i.active_seconds,c.name,i.package_hash,i.report,i.submitted_at FROM assessment_invites i JOIN candidates c ON c.id=i.candidate_id AND c.tenant_id=i.tenant_id WHERE i.tenant_id=$1 AND i.id=$2 AND c.retention_until>now() AND i.submitted_at IS NOT NULL`,[a.tenant_id,z.uuid().parse(req.params.id)])).rows[0];if(!row)throw missing();const {profile_cipher,tenant_id,...publicRow}=row;send(res,{...publicRow,metadata:reportMetadata(row as Invite,contactKey)});
 });
 app.post('/api/v1/assessment/invites/:id/delete',async(req,res)=>{
  const a=business(res);if(a.role!=='talent_lead')throw new ServiceError(403,'FORBIDDEN_SCOPE','仅人才负责人可以删除测评数据');
  const id=z.uuid().parse(req.params.id);z.object({confirm:z.literal('delete_assessment')}).strict().parse(req.body);
  await db.transaction(async tx=>{const result=await tx.query('DELETE FROM assessment_invites WHERE tenant_id=$1 AND id=$2 RETURNING id',[a.tenant_id,id]);if(!result.rows.length)throw missing();await tx.query('INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),a.tenant_id,a.user_id,'assessment.deleted',id]);});
  send(res,{deleted:true,scope:'当前数据库中的本次邀请、答卷和报告；不包含既有离线备份或已下载文件'});
 });
}
