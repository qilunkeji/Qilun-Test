import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {createIAM} from '../../packages/iam/vendor/iam-client.mjs';
import {digest} from '../../packages/security/index.ts';
import type {Database} from './db.ts';
import {ServiceError} from './http-error.ts';
export type IAMLocal={tenant_id:string;user_id:string;username:string;role:string};
export type IAMBridge={handle:(request:Request)=>Promise<Response>;current:(request:Request)=>Promise<{local:unknown;csrf:string}|null>;close:()=>void};
const identitySchema=z.object({id:z.string().min(1).max(100),auth_user_id:z.string(),system_id:z.string(),status:z.literal('active'),must_change:z.union([z.boolean(),z.number()]).optional(),deleted_at:z.string().nullable().optional(),username:z.string().min(1).max(100),roles:z.array(z.string()).max(50),permissions:z.array(z.string()).max(100),local_user_id:z.uuid().nullable().optional()});
export function iamConfig(env:NodeJS.ProcessEnv,origin:string){
 if(env.IAM_ENABLED===undefined||env.IAM_ENABLED==='0')return undefined;
 if(env.IAM_ENABLED!=='1')throw new Error('IAM_ENABLED must be 0 or 1');
 const issuer=env.IAM_ISSUER,clientId=env.IAM_CLIENT_ID,clientSecret=env.IAM_CLIENT_SECRET,webhookSecret=env.IAM_WEBHOOK_SECRET,systemId=env.IAM_SYSTEM_ID,database=env.IAM_SESSION_DB,tenantId=env.DEFAULT_TENANT_ID;
 if(!issuer||!clientId||!clientSecret||!webhookSecret||!systemId||!database?.startsWith('/')||!tenantId)throw new Error('IAM configuration is incomplete');
 z.uuid().parse(tenantId);
 if(env.NODE_ENV==='production'&&(issuer!=='https://zh.iqilun.cn'||origin!=='https://rc.iqilun.cn'||!database.startsWith('/app/.local/')))throw new Error('IAM production origin or private session path is invalid');
 return {issuer,clientId,clientSecret,webhookSecret,systemId,database,origin,tenantId};
}
export function selectIAMRole(roles:string[],permissions:string[]){
 const needs:Record<string,string[]>={talent_lead:['talent.view','talent.manage'],hr:['talent.view','talent.recruit'],ops:['talent.view','talent.audit'],interviewer:['talent.view']};
 const matched=roles.filter(r=>Object.hasOwn(needs,r));
 if(matched.length>1)throw new ServiceError(403,'IAM_ROLE_CONFLICT','人才系统仅支持一个业务角色，请联系账号中心管理员保留一个人才角色');
 if(matched.length!==1||!needs[matched[0]].every(p=>permissions.includes(p)))throw new ServiceError(403,'IAM_FORBIDDEN','当前齐论账号未获人才系统角色授权');
 return matched[0];
}
export async function mapIAMIdentity(db:Database,config:{issuer:string;systemId:string;tenantId:string},input:unknown):Promise<IAMLocal>{
 const parsed=identitySchema.safeParse(input);if(!parsed.success)throw new ServiceError(403,'IAM_INVALID_IDENTITY','统一身份数据无效');
 const user=parsed.data;
 if(user.id!==user.auth_user_id||user.system_id!==config.systemId||user.must_change||user.deleted_at)throw new ServiceError(403,'IAM_FORBIDDEN','齐论账号尚未获授权或需要修改初始密码');
 const role=selectIAMRole(user.roles,user.permissions);
 return db.transaction(async tx=>{
  let mapping=(await tx.query<{user_id:string;tenant_id:string}>('SELECT user_id,tenant_id FROM iam_identities WHERE issuer=$1 AND subject=$2',[config.issuer,user.id])).rows[0];
  if(mapping&&(mapping.tenant_id!==config.tenantId||(user.local_user_id&&mapping.user_id!==user.local_user_id)))throw new ServiceError(403,'IAM_BINDING_CONFLICT','身份绑定不一致，请联系管理员核验');
  if(!mapping){
   const uid=user.local_user_id??randomUUID();
   if(user.local_user_id){
    const exists=await tx.query('SELECT id FROM staff_users WHERE tenant_id=$1 AND id=$2',[config.tenantId,uid]);
    if(!exists.rows.length)throw new ServiceError(403,'IAM_BINDING_CONFLICT','管理员指定的原账号不存在');
    if((await tx.query('SELECT subject FROM iam_identities WHERE tenant_id=$1 AND user_id=$2',[config.tenantId,uid])).rows.length)throw new ServiceError(403,'IAM_BINDING_CONFLICT','原账号已绑定另一统一身份');
   }else{
    // No username/email/phone matching and no copied or locally usable password.
    await tx.query('INSERT INTO staff_users(id,tenant_id,username,password_hash,role) VALUES($1,$2,$3,$4,$5)',[uid,config.tenantId,'iam_'+digest(config.issuer+'|'+user.id).slice(0,32),'iam-only',role]);
   }
   await tx.query('INSERT INTO iam_identities(issuer,subject,tenant_id,user_id) VALUES($1,$2,$3,$4)',[config.issuer,user.id,config.tenantId,uid]);
   await tx.query('INSERT INTO audit_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),config.tenantId,uid,user.local_user_id?'auth.iam.bound':'auth.iam.provisioned']);
   mapping={tenant_id:config.tenantId,user_id:uid};
  }
  const updated=await tx.query('UPDATE staff_users SET role=$3 WHERE tenant_id=$1 AND id=$2 AND role<>$3 RETURNING id',[config.tenantId,mapping.user_id,role]);
  if(updated.rows.length){
   await tx.query('DELETE FROM sessions WHERE tenant_id=$1 AND user_id=$2',[config.tenantId,mapping.user_id]);
   await tx.query('INSERT INTO audit_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),config.tenantId,mapping.user_id,'auth.iam.role_updated']);
  }
  return {tenant_id:config.tenantId,user_id:mapping.user_id,username:user.username,role};
 });
}
export function talentIAM(db:Database,config:NonNullable<ReturnType<typeof iamConfig>>):IAMBridge{
 return createIAM({...config,onIdentity:input=>mapIAMIdentity(db,config,input)});
}
