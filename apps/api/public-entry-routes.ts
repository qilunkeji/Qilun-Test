import type {Express,Response,Request} from 'express';
import {randomUUID,createHmac} from 'node:crypto';
import {z} from 'zod';
import type {Database} from './db.ts';
import type {AssessmentRuntime} from './assessment-product.ts';
import {digest,randomToken,encryptContact,decryptContact} from '../../packages/security/index.ts';
import {qilunStandardInvitePackage} from '../../packages/assessment-engine/gh-invite.ts';
import type {GhInvitePackage} from '../../packages/assessment-engine/gh-invite.ts';
import {profileSchema} from './assessment-metadata.ts';
import {checkProject} from './project-routes.ts';
import {ServiceError} from './http-error.ts';
// Accept an old client's PIN field during rollout, but never require or use it
// for a shared registration entrance.
const auth={token:z.string().min(32).max(128),pin:z.string().regex(/^\d{6}$/).optional()};
const send=(res:Response,data:unknown,status=200)=>res.status(status).json({data,request_id:res.locals.requestId});
const unavailable=()=>new ServiceError(404,'ENTRY_UNAVAILABLE','测评链接无效，或已停止登记、到期。请联系邀请人。');
type Entry={id:string;tenant_id:string;created_by:string;title:string;purpose:string;project_group_id:string|null;legacy_invite_id:string|null;package:GhInvitePackage;package_hash:string;expires_at:string};
function manager(res:Response){const a=res.locals.auth;if(!['talent_lead','hr'].includes(a.role))throw new ServiceError(403,'FORBIDDEN_SCOPE','当前角色无测评管理权限');return a;}
export async function createSharedEntry(db:Database,a:{tenant_id:string;user_id:string},input:{title:string;purpose:string;days:number;project_group_id?:string|null},h5Origin:string,runtime:AssessmentRuntime){
 if(!runtime.standard)throw new ServiceError(503,'STANDARD_RULES_UNAVAILABLE','测评服务暂不可用');
 await checkProject(db,a.tenant_id,input.project_group_id);
 const id=randomUUID(),token=randomToken(),hash=digest(token),pkg=JSON.stringify(qilunStandardInvitePackage(runtime.standard)),expires=new Date(Date.now()+input.days*86400000).toISOString();
 await db.transaction(async tx=>{
  await tx.query('INSERT INTO assessment_public_entries(id,tenant_id,created_by,title,purpose,project_group_id,token_hash,pin_hash,package,package_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,a.tenant_id,a.user_id,input.title,input.purpose,input.project_group_id??null,hash,digest(randomToken()),pkg,digest(pkg),expires]);
  await tx.query('INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),a.tenant_id,a.user_id,'assessment.public_entry_created',id]);
 });
 return {id,url:`${h5Origin}/h5/join#${token}`,expires_at:expires};
}
export function registerPublicEntryAdmin(app:Express,db:Database,h5Origin:string,runtime:AssessmentRuntime){
 app.get('/api/v1/assessment/public-entries',async(_req,res)=>{const a=manager(res);send(res,{items:(await db.query(`SELECT e.id,e.title,e.purpose,e.project_group_id,e.expires_at,e.revoked_at,e.created_at,count(i.id)::int AS participants,count(i.id) FILTER(WHERE i.submitted_at IS NOT NULL)::int AS completed FROM assessment_public_entries e LEFT JOIN assessment_invites i ON i.tenant_id=e.tenant_id AND i.public_entry_id=e.id WHERE e.tenant_id=$1 GROUP BY e.id ORDER BY e.created_at DESC LIMIT 100`,[a.tenant_id])).rows});});
 app.post('/api/v1/assessment/public-entries',async(req,res)=>{
  const a=manager(res),input=z.object({title:z.string().trim().min(1).max(80),purpose:z.string().trim().min(5).max(200),days:z.number().int().min(1).max(30),project_group_id:z.uuid().nullable().optional()}).strict().parse(req.body);
  send(res,await createSharedEntry(db,a,input,h5Origin,runtime),201);
 });
 app.post('/api/v1/assessment/public-entries/:id/revoke',async(req,res)=>{const a=manager(res);z.object({}).strict().parse(req.body);const id=z.uuid().parse(req.params.id);await db.transaction(async tx=>{if(!(await tx.query('UPDATE assessment_public_entries SET revoked_at=coalesce(revoked_at,now()) WHERE tenant_id=$1 AND id=$2 RETURNING id',[a.tenant_id,id])).rows.length)throw unavailable();await tx.query('INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),a.tenant_id,a.user_id,'assessment.public_entry_revoked',id]);});send(res,{revoked:true});});
}
export function registerPublicEntryEnrollment(app:Express,db:Database,key:Buffer,runtime:AssessmentRuntime){
 const limits=new Map<string,{count:number;until:number}>();
 function limit(req:Request){for(const [k,v] of limits)if(v.until<Date.now())limits.delete(k);const ip=digest(req.ip??'local'),v=limits.get(ip)??{count:0,until:Date.now()+60000};if(v.count>=60||limits.size>10000)throw new ServiceError(429,'RATE_LIMITED','访问过于频繁，请稍后再试');v.count++;limits.set(ip,v);}
 async function entry(tx:Pick<Database,'query'>,input:{token:string},lock=false){
  // Previously issued personal URLs also open their parent registration entry.
  // Their old PIN-protected credentials still work only when cached locally;
  // the URL alone never opens a historical participant's answers.
  const row=(await tx.query<Entry>(`SELECT e.* FROM assessment_public_entries e WHERE (e.token_hash=$1 OR e.id IN (SELECT i.public_entry_id FROM assessment_invites i WHERE i.token_hash=$1 AND i.pin_required=true AND i.revoked_at IS NULL AND i.expires_at>now() AND i.independent_retention_until>now())) AND e.revoked_at IS NULL AND e.expires_at>now() ${lock?'FOR UPDATE OF e':''}`,[digest(input.token)])).rows[0];
  if(!row)throw unavailable();return row;
 }
 function enrollmentPackage(row:Entry){
  // A legacy shared URL starts NEW standard assessments; its historical
  // participant's answers/report/package are never reused or rewritten.
  if(row.legacy_invite_id){if(!runtime.standard)throw new ServiceError(503,'ENTRY_RULES_UNAVAILABLE','测评服务暂不可用');return qilunStandardInvitePackage(runtime.standard);}
  return row.package;
 }
 app.post('/api/v1/public/assessment/entry/open',async(req,res)=>{limit(req);const row=await entry(db,z.object(auth).strict().parse(req.body));send(res,{title:row.title,purpose:row.purpose,expires_at:row.expires_at,consent_version:enrollmentPackage(row).consent_version});});
 app.post('/api/v1/public/assessment/entry/enroll',async(req,res)=>{
  limit(req);const input=z.object({...auth,participant_key:z.string().regex(/^[A-Za-z0-9_-]{43}$/),accepted:z.literal(true),consent_version:z.string().max(100),profile:profileSchema.extend({name:z.string().trim().min(1).max(80)})}).strict().parse(req.body);
  const data=await db.transaction(async tx=>{
   const row=await entry(tx,input,true),pkg=enrollmentPackage(row);
   if(input.consent_version!==pkg.consent_version)throw new ServiceError(400,'INVALID_CONSENT_VERSION','请阅读对应版本说明');
   if(!runtime.standard||!('rule_profile' in pkg)||pkg.rule_profile.fingerprint!==runtime.standard.rules_fingerprint)throw new ServiceError(503,'ENTRY_RULES_UNAVAILABLE','本入口对应的测评规则暂不可用');
   const personalToken=input.participant_key,hash=digest(personalToken);
   // A shared token can never double as a personal resume credential.
   if((await tx.query('SELECT id FROM assessment_public_entries WHERE token_hash=$1',[hash])).rows.length)throw unavailable();
   const prior=(await tx.query<{id:string;public_entry_id:string;tenant_id:string;revoked_at:string|null;expires_at:string;independent_retention_until:string;profile_cipher:string;pin_required:boolean}>('SELECT id,public_entry_id,tenant_id,revoked_at,expires_at,independent_retention_until,profile_cipher,pin_required FROM assessment_invites WHERE token_hash=$1',[hash])).rows[0];
   if(prior){
    if(prior.public_entry_id!==row.id||prior.tenant_id!==row.tenant_id||prior.revoked_at||Date.parse(prior.expires_at)<=Date.now()||Date.parse(prior.independent_retention_until)<=Date.now())throw unavailable();
    // A retry is only a retry for the same profile, not a second person using
    // the previous participant's pending registration key.
    if(JSON.stringify(profileSchema.parse(JSON.parse(decryptContact(prior.profile_cipher,key,row.tenant_id))))!==JSON.stringify(input.profile))throw new ServiceError(409,'PARTICIPANT_CONFLICT','登记资料已变化，请选择另一位参与者重新登记');
    return prior.pin_required?{token:personalToken,pin:String(100000+parseInt(createHmac('sha256',key).update(`entry:${row.id}:${personalToken}`).digest('hex').slice(0,10),16)%900000)}:{token:personalToken};
   }
   const id=randomUUID(),snapshot=JSON.stringify(pkg);
   await tx.query(`INSERT INTO assessment_invites(id,tenant_id,candidate_id,token_hash,pin_hash,package,package_hash,purpose,expires_at,created_by,participant_kind,project_group_id,profile_required,independent_retention_until,public_entry_id,profile_cipher,consent_at,active_seconds,timing_updated_at,pin_required) VALUES($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,'external',$10,true,now()+interval '365 days',$11,$12,now(),0,now(),false)`,[id,row.tenant_id,hash,digest(randomToken()),snapshot,digest(snapshot),row.purpose,row.expires_at,row.created_by,row.project_group_id,row.id,encryptContact(JSON.stringify(input.profile),key,row.tenant_id)]);
   await tx.query('INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),row.tenant_id,row.created_by,'assessment.public_entry_enrolled',id]);return {token:personalToken};
  });send(res,data,201);
 });
}
