import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { z, ZodError } from 'zod';
import type { Database } from './db.ts';
import { loginInput, jobInput, versionInput, importInput, applicationInput, listInput, id } from '@qilun/contracts/index.ts';
import { randomToken, digest, verifyPassword, hashPassword, encryptContact, decryptContact } from '@qilun/security/index.ts';
import { registerAssessmentRoutes } from './assessment-routes.ts';
import {registerProjectRoutes} from './project-routes.ts';
import {registerPublicInvites,registerInviteAdmin} from './invite-routes.ts';
import {loadAssessmentRuntime} from './assessment-product.ts';
import {registerAIRoutes} from './ai-routes.ts';
import {ServiceError} from './http-error.ts';
import type {IAMBridge,IAMLocal} from './iam.ts';
import {canManageAssessment} from '@qilun/security/assessment-access.ts';
import {AgentRuntime} from './agent-tasks/runtime.ts';
import {registerAgentMCP} from './agent-tasks/mcp.ts';
import {externalAgentMode,agentConfigured} from './processing-mode.ts';
import {importResume} from './resume-import.ts';
import {registerResumeExtension,registerResumeLibrary} from './resume-library.ts';

type Auth = { tenant_id:string; user_id:string; role:string; username:string; csrf_token:string };
type Context = { auth:Auth; requestId:string };
type Job = {id:string; job_id:string; version:number; title:string; status:string};
class ApiError extends Error {
  status:number; code:string;
  constructor(status:number,code:string,message:string) {super(message);this.status=status;this.code=code;}
}
const missing = () => new ApiError(404,'NOT_FOUND','对象不存在或不在授权范围内');
const conflict = (message:string) => new ApiError(409,'VERSION_CONFLICT',message);
const context = (res:Response) => res.locals as Context;
const allowBusiness = (res:Response) => {
  if (!['hr','talent_lead'].includes(context(res).auth.role)) throw new ApiError(403,'FORBIDDEN_SCOPE','当前角色没有业务档案权限');
};
const allowedKeys = (req:Request) => {
  for (const key of Object.keys(req.query)) if (!['page','page_size','q'].includes(key)) throw new ApiError(400,'INVALID_INPUT','不支持的查询条件');
};
export function createApp(db:Database, config:{origin:string; contactKey:Buffer; staticDir?:string;h5Origin?:string;production?:boolean;defaultTenantId?:string;iam?:IAMBridge;aiTransport?:typeof fetch;agentWakeTransport?:typeof fetch;localReportPreview?:{directory:string;tenantId:string}}) {
  if(config.contactKey.length!==32) throw new Error('Contact encryption key must be 32 bytes');
  if(config.defaultTenantId)id.parse(config.defaultTenantId);
  const app=express(); app.disable('x-powered-by');
  const agentRuntime=new AgentRuntime(db,config.contactKey,config.agentWakeTransport);app.locals.agentRuntime=agentRuntime;if(config.defaultTenantId)agentRuntime.service(config.defaultTenantId);
  const assessmentRuntime=loadAssessmentRuntime();
  if(config.production){
    app.set('trust proxy','loopback');
    app.use((req,res,next)=>{
      if(req.get('host')!==new URL(config.origin).host)return res.status(421).json({error:{code:'INVALID_HOST',message:'请求域名不允许'}});
      if(!req.secure)return res.status(400).json({error:{code:'HTTPS_REQUIRED',message:'请通过HTTPS网关访问'}});
      res.set('Strict-Transport-Security','max-age=31536000');next();
    });
  }
  app.use((_req,res,next)=>{
    res.locals.requestId=randomUUID();
    res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store','X-Frame-Options':'DENY',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}); next();
  });
  const iamRequest=(req:Request,path=req.originalUrl)=>new globalThis.Request(new URL(path,config.origin),{method:req.method,headers:new Headers(Object.entries(req.headers).flatMap(([key,value])=>value===undefined?[]:[[key,Array.isArray(value)?value.join('; '):value]])),...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.isBuffer(req.body)?new Uint8Array(req.body):JSON.stringify(req.body??{})})});
  const iamError=(error:unknown)=>{
    if(error instanceof ServiceError)return error;
    const status=(error as {status?:number})?.status;
    return new ServiceError(status&&[400,401,403,413,428,429].includes(status)?status:503,'IAM_UNAVAILABLE',status===403?'齐论账号暂无人才系统权限':status===401?'齐论登录已失效，请重新登录':status===400?'统一登录请求无效或已过期':status===428?'请先在齐论账号中心修改初始密码':'统一账号服务暂不可用，请稍后重试');
  };
  const relayIAM=async(req:Request,res:Response,path?:string)=>{
    if(!config.iam)throw new ServiceError(503,'IAM_NOT_CONFIGURED','统一登录接口已准备，等待账号中心登记应用');
    try{
      const result=await config.iam.handle(iamRequest(req,path));
      for(const [key,value] of result.headers)if(key!=='set-cookie')res.setHeader(key,value);
      const cookies=result.headers.getSetCookie();if(cookies.length)res.setHeader('set-cookie',cookies);
      res.status(result.status).send(await result.text());
    }catch(error){
      const failure=iamError(error);
      if(req.method==='GET'&&req.path==='/api/iam/callback'&&req.get('accept')?.includes('text/html')){
        // Never reflect callback codes, state, arbitrary upstream errors or credentials.
        const message=failure.code==='IAM_ROLE_CONFLICT'?'人才系统仅支持一个业务角色。请联系账号中心管理员保留一个人才角色后重新登录。':failure.status===400||failure.status===401?'这次登录链接已失效或已被使用。请从下面的入口重新发起统一登录，不要刷新旧的回调页面。':failure.status===403?'当前账号暂不能进入人才系统。请联系管理员核对人才角色与权限。':'统一登录暂不可用，请稍后重新尝试。';
        res.status(failure.status).type('html').send(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>重新登录 · 齐论人才系统</title><body style="margin:0;background:#f7f8fa;color:#202124;font:16px/1.7 system-ui,sans-serif"><main style="max-width:520px;margin:12vh auto;padding:32px"><p style="color:#b40000">齐论 AI · 人才系统</p><h1 style="font-size:28px">登录尚未完成</h1><p>${message}</p><a href="/api/iam/login" style="display:inline-block;padding:10px 24px;background:#b40000;color:white;text-decoration:none;border-radius:6px">重新统一登录</a><p><a href="/" style="color:#454545">返回人才系统</a></p></main></body></html>`);
        return;
      }
      throw failure;
    }
  };
  // Only the HMAC-signed webhook bypasses browser Origin/CSRF; raw bytes are essential.
  app.all('/api/iam/{*path}',express.raw({type:()=>true,limit:'256kb'}),async(req,res)=>{
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??''))throw new ApiError(403,'LOCAL_ADMIN_ONLY','请通过受信任网关访问');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.path!=='/api/iam/webhook'&&req.get('origin')!==config.origin)throw new ApiError(403,'ORIGIN_REJECTED','请求来源不允许');
    await relayIAM(req,res);
  });
  app.use(express.json({limit:'1mb'}));
  registerAgentMCP(app,agentRuntime,config.defaultTenantId);
  registerResumeExtension(app,db,config.contactKey);
  app.use('/api',(req,_res,next)=>{
    if(req.get('authorization')?.startsWith('Bearer '))return next(new ApiError(401,'UNAUTHENTICATED','业务接口需要浏览器登录会话'));
    const publicPath=req.path.startsWith('/v1/public/assessment/');
    const remote=req.socket.remoteAddress??'';
    if(!publicPath&&!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote))return next(new ApiError(403,'LOCAL_ADMIN_ONLY','管理后台只允许本机访问'));
    const origins=publicPath?[config.origin,config.h5Origin??config.origin]:[config.origin];
    if(!['GET','HEAD','OPTIONS'].includes(req.method) && !origins.includes(req.get('origin')??'')) return next(new ApiError(403,'ORIGIN_REJECTED','请求来源不允许'));
    next();
  });
  const send=(res:Response,data:unknown,status=200)=>res.status(status).json({data,request_id:context(res).requestId});
  app.get('/api/v1/health', async (_req,res)=>{await db.query('SELECT 1');send(res,{status:'ok',stage:'P2-P3',database:db.driver,deployment:config.production?'single-instance-https':'local-only',assessment:{version:'qilun-internal-assessment/1.0.0',ready:!!assessmentRuntime.standard}});});
  const failures=new Map<string,{count:number;until:number}>();
  const dummyHash=hashPassword(randomToken());
  registerPublicInvites(app,db,assessmentRuntime,config.contactKey);
  app.get('/api/v1/auth/options',(_req,res)=>send(res,{unified_login:!!config.iam,local_password_login:!config.iam,login_url:config.iam?'/api/iam/login':null}));
  app.post('/api/v1/auth/login',async(req,res)=>{
    if(config.iam)throw new ApiError(403,'IAM_REQUIRED','请使用齐论统一账号登录');
    const input=loginInput.parse(req.body);
    if(config.defaultTenantId&&input.tenant_id&&input.tenant_id!==config.defaultTenantId)throw new ApiError(401,'INVALID_CREDENTIALS','账号或密码不正确');
    const tenantId=config.defaultTenantId??input.tenant_id??(await db.query<{id:string}>('SELECT id FROM tenants ORDER BY created_at,id LIMIT 2')).rows.reduce<string|undefined>((only,row,_index,rows)=>rows.length===1?row.id:undefined,undefined);
    if(!tenantId)throw new ApiError(503,'LOGIN_NOT_CONFIGURED','登录配置尚未完成，请联系管理员');
    const key=digest(`${req.ip}|${tenantId}|${input.username}`);
    for(const [k,v] of failures) if(v.until<Date.now()) failures.delete(k);
    if(failures.size>10000) throw new ApiError(429,'RATE_LIMITED','登录繁忙，请稍后重试');
    const ipKey=digest(`ip:${req.ip}`);
    if((failures.get(key)?.count??0)>=5 || (failures.get(ipKey)?.count??0)>=40) throw new ApiError(429,'RATE_LIMITED','登录尝试过多，请15分钟后重试');
    const row=(await db.query<{id:string;password_hash:string;role:string}>("SELECT id,password_hash,role FROM staff_users WHERE tenant_id=$1 AND username=$2 AND password_hash<>'iam-only'",[tenantId,input.username])).rows[0];
    const valid=await verifyPassword(input.password,row?.password_hash??await dummyHash);
    if(!row||!valid){
      for(const k of [key,ipKey]) failures.set(k,{count:(failures.get(k)?.count??0)+1,until:Date.now()+900000});
      throw new ApiError(401,'INVALID_CREDENTIALS','账号或密码不正确');
    }
    failures.delete(key);
    const token=randomToken(),csrf=randomToken();
    await db.transaction(async tx=>{
      await tx.query('DELETE FROM sessions WHERE expires_at<now()');
      await tx.query("INSERT INTO sessions VALUES($1,$2,$3,$4,now()+interval '8 hours')",[digest(token),tenantId,row.id,csrf]);
      await tx.query('INSERT INTO audit_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),tenantId,row.id,'auth.login']);
    });
    res.cookie('qilun_session',token,{httpOnly:true,sameSite:'strict',secure:config.origin.startsWith('https:'),maxAge:28800000,path:'/api'});
    send(res,{tenant_id:tenantId,username:input.username,role:row.role,csrf_token:csrf});
  });
  app.use('/api',async(req,res,next)=>{
    if(config.iam){
      let identity;try{identity=await config.iam.current(iamRequest(req));}catch(error){throw iamError(error);}
      if(!identity)throw new ApiError(401,'UNAUTHENTICATED','请使用齐论账号登录');
      const local=identity.local as IAMLocal;
      if(!local?.user_id||local.tenant_id!==config.defaultTenantId||!['hr','talent_lead','ops','interviewer'].includes(local.role))throw new ApiError(403,'IAM_FORBIDDEN','统一身份授权范围不正确');
      res.locals.auth={...local,csrf_token:identity.csrf};
      if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('x-csrf-token')!==identity.csrf)throw new ApiError(403,'CSRF_REJECTED','会话校验失败，请刷新后重试');
      return next();
    }
    const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('qilun_session='))?.slice(14);
    if(!token) throw new ApiError(401,'UNAUTHENTICATED','请先登录');
    const row=(await db.query<Auth>(`SELECT s.tenant_id,s.user_id,s.csrf_token,u.role,u.username FROM sessions s
      JOIN staff_users u ON u.tenant_id=s.tenant_id AND u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[digest(token)])).rows[0];
    if(!row) throw new ApiError(401,'UNAUTHENTICATED','登录已失效');
    res.locals.auth=row;
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('x-csrf-token')!==row.csrf_token) throw new ApiError(403,'CSRF_REJECTED','会话校验失败，请刷新后重试');
    next();
  });
  app.get('/api/v1/auth/me',async(_req,res)=>{
    const a=context(res).auth;
    const tenant=(await db.query<{name:string}>('SELECT name FROM tenants WHERE id=$1',[a.tenant_id])).rows[0];
    send(res,{...a,tenant_name:tenant.name});
  });
  app.post('/api/v1/auth/logout',async(req,res)=>{
    if(config.iam)return relayIAM(req,res,'/api/iam/logout');
    const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('qilun_session='))?.slice(14);
    await db.query('DELETE FROM sessions WHERE token_hash=$1',[digest(token??'')]);res.clearCookie('qilun_session',{path:'/api'});send(res,{logged_out:true});
  });
  registerAssessmentRoutes(app,db,config.localReportPreview,assessmentRuntime);
  registerProjectRoutes(app,db);
  registerInviteAdmin(app,db,config.h5Origin??config.origin,assessmentRuntime,config.contactKey);
  registerAIRoutes(app,db,config.contactKey,config.aiTransport,agentRuntime);
  registerResumeLibrary(app,db,config.contactKey,agentRuntime);
  app.get('/api/v1/readiness',(_req,res)=>send(res,{
    stage:'P1', features:[
      {name:'岗位、档案与申请',status:'available',detail:'本地持久化业务；人工导入 UTF-8 TXT / 文本'},
      {name:'BOSS 渠道',status:'waiting_for_authorization',detail:'未取得真实平台许可与接口；使用人工导入'},
      ...(canManageAssessment(context(res).auth.role)?[{name:'高禾原版兼容测评',status:'blocked_missing_rules',detail:'测评后台提供依据、已知公式试算和服务端阻塞校验；完整计分与匹配仍缺规则'}]:[]),
      {name:'齐论测评与手机 H5',status:'available',detail:'新邀请使用固定成品V1.0，完整七模块与28项能力参考评分；保留历史邀请版本。多人共用链接、免访问码登记、独立答卷与自动保存续答已实现；能力不是实际技能或绩效，不作心理诊断或自动录用依据。'},
      ...(externalAgentMode()?[
      {name:'AI 功能',status:agentConfigured()?'available':'waiting_for_configuration',detail:agentConfigured()?'由齐论人才系统接入的 AI 助手（外部智能体）异步处理，通常 1–3 分钟；结果保留引用并需人工复核，无模型费用。':'外部智能体未配置；不会自动使用其他处理方式。'},
      {name:'招聘优化与面试评估',status:agentConfigured()?'available':'waiting_for_configuration',detail:'提问与证据评估交由 AI 助手异步处理；测评不参与匹配分，缺证据不按零分，需人工复核；音频转写未实现。'}
      ]:[{name:'AI 功能与费用',status:'requires_model',detail:'已实现分功能配置、加密Key、引用校验、预算及调用记录；配置不代表供应商连接健康，真实生成需模型配置与本次材料外传许可。'},
      {name:'招聘优化与面试评估',status:'requires_model',detail:'本地资料库、需求表单、面试档案及文本保存已实现；提问与证据评估依赖外部模型。测评不参与匹配分，缺证据不按零分，需人工复核；音频转写未实现。'}]),
      {name:'员工档案与全局物理删除',status:'planned_P4',detail:'尚未完整实现；到期数据当前只限制访问，未声明已完成全局删除'},
      {name:'任务队列与渠道批量',status:externalAgentMode()?'available':'planned_P5',detail:externalAgentMode()?'AI 任务队列支持租约、引用校验与受限重试；渠道批量尚未实现，没有抓取或处理量承诺。':'尚未实现；没有抓取或处理量承诺'}
    ]
  }));
  app.get('/api/v1/dashboard',async(_req,res)=>{
    allowBusiness(res);const {tenant_id}=context(res).auth;
    const result=(await db.query<Record<string,unknown>>(`SELECT
      (SELECT count(*)::int FROM jobs WHERE tenant_id=$1) AS jobs,
      (SELECT count(*)::int FROM candidates WHERE tenant_id=$1 AND retention_until>now()) AS candidates,
      (SELECT count(*)::int FROM applications a JOIN candidates c ON c.id=a.candidate_id AND c.tenant_id=a.tenant_id WHERE a.tenant_id=$1 AND c.retention_until>now()) AS applications,
      (SELECT count(*)::int FROM candidates WHERE tenant_id=$1 AND retention_until<=now()) AS expired`,[tenant_id])).rows[0];send(res,{...result,...(externalAgentMode()?{agent_pending:await agentRuntime.queue(tenant_id)}:{})});
  });
  app.get('/api/v1/jobs',async(req,res)=>{
    allowBusiness(res);allowedKeys(req);const {page,page_size,q}=listInput.parse(req.query);const a=context(res).auth;
    const base=`FROM jobs j JOIN job_versions v ON v.tenant_id=j.tenant_id AND v.job_id=j.id AND v.version=j.revision WHERE j.tenant_id=$1 AND v.title ILIKE $2`;
    const params=[a.tenant_id,`%${q}%`];
    const rows=(await db.query(`SELECT j.id,j.revision,v.title,v.department,v.owner,v.location,v.status,v.id AS version_id,j.created_at ${base} ORDER BY j.created_at DESC,j.id LIMIT $3 OFFSET $4`,[...params,page_size,(page-1)*page_size])).rows;
    const count=(await db.query<{count:number}>(`SELECT count(*)::int AS count ${base}`,params)).rows[0].count;send(res,{items:rows,total:count,page,page_size});
  });
  app.post('/api/v1/jobs',async(req,res)=>{
    allowBusiness(res);const input=jobInput.parse(req.body),a=context(res).auth;const jobId=randomUUID(),versionId=randomUUID();
    await db.transaction(async tx=>{
      await tx.query('INSERT INTO jobs(id,tenant_id,created_by) VALUES($1,$2,$3)',[jobId,a.tenant_id,a.user_id]);
      await tx.query('INSERT INTO job_versions(id,tenant_id,job_id,version,title,department,owner,location,tasks,criteria,public_jd,status,change_reason,created_by) VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[versionId,a.tenant_id,jobId,input.title,input.department,input.owner,input.location,input.tasks,input.criteria,input.public_jd,input.status,input.change_reason,a.user_id]);
      await tx.query('INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),a.tenant_id,a.user_id,'job.created',jobId]);
    });send(res,{id:jobId,version_id:versionId,revision:1},201);
  });
  app.get('/api/v1/jobs/:id',async(req,res)=>{
    allowBusiness(res);const jobId=id.parse(req.params.id),a=context(res).auth;
    const job=(await db.query('SELECT id,revision,created_at FROM jobs WHERE tenant_id=$1 AND id=$2',[a.tenant_id,jobId])).rows[0];if(!job)throw missing();
    const versions=(await db.query('SELECT * FROM job_versions WHERE tenant_id=$1 AND job_id=$2 ORDER BY version DESC',[a.tenant_id,jobId])).rows;send(res,{...job,versions});
  });
  app.post('/api/v1/jobs/:id/versions',async(req,res)=>{
    allowBusiness(res);const jobId=id.parse(req.params.id),input=versionInput.parse(req.body),a=context(res).auth;const versionId=randomUUID();
    await db.transaction(async tx=>{
      const prior=(await tx.query<{revision:number}>('SELECT revision FROM jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[a.tenant_id,jobId])).rows[0];
      if(!prior)throw missing();if(prior.revision!==input.expected_revision)throw conflict('岗位已被修改，请重新加载后再保存');
      await tx.query('INSERT INTO job_versions(id,tenant_id,job_id,version,title,department,owner,location,tasks,criteria,public_jd,status,change_reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[versionId,a.tenant_id,jobId,prior.revision+1,input.title,input.department,input.owner,input.location,input.tasks,input.criteria,input.public_jd,input.status,input.change_reason,a.user_id]);
      await tx.query('UPDATE jobs SET revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',[a.tenant_id,jobId]);
      await tx.query('INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),a.tenant_id,a.user_id,'job.version_created',versionId]);
    });send(res,{id:jobId,version_id:versionId,revision:input.expected_revision+1},201);
  });
  app.post('/api/v1/talents/imports',async(req,res)=>{
    allowBusiness(res);const result=await importResume(db,config.contactKey,context(res).auth,req.body);send(res,result,result.duplicate?200:201);
  });
  app.get('/api/v1/talents',async(req,res)=>{
    allowBusiness(res);const {group,...rest}=req.query;const selected=z.union([z.uuid(),z.literal('ungrouped')]).optional().parse(group);if(Object.keys(rest).some(k=>!['page','page_size','q'].includes(k)))throw new ServiceError(400,'INVALID_QUERY','查询条件无效');const {page,page_size,q}=listInput.parse(rest),a=context(res).auth;
    const base='FROM candidates WHERE tenant_id=$1 AND retention_until>now() AND name ILIKE $2'+(selected==='ungrouped'?' AND project_group_id IS NULL':selected?' AND project_group_id=$5':'');const params=[a.tenant_id,`%${q}%`];
    const rows=(await db.query(`SELECT id,name,purpose,retention_until,created_at,project_group_id ${base} ORDER BY created_at DESC,id LIMIT $3 OFFSET $4`,[...params,page_size,(page-1)*page_size,...(selected&&selected!=='ungrouped'?[selected]:[])])).rows;
    const count=(await db.query<{count:number}>(`SELECT count(*)::int AS count ${base.replace('$5','$3')}`,[...params,...(selected&&selected!=='ungrouped'?[selected]:[])])).rows[0].count;send(res,{items:rows,total:count,page,page_size});
  });
  app.get('/api/v1/talents/:id',async(req,res)=>{
    allowBusiness(res);const candidateId=id.parse(req.params.id),a=context(res).auth;
    const candidate=(await db.query('SELECT id,name,purpose,processing_basis,retention_until,created_at,project_group_id FROM candidates WHERE tenant_id=$1 AND id=$2 AND retention_until>now()',[a.tenant_id,candidateId])).rows[0];if(!candidate)throw missing();
    const sources=(await db.query('SELECT id,channel,external_id,authorization_ref,created_at FROM candidate_sources WHERE tenant_id=$1 AND candidate_id=$2',[a.tenant_id,candidateId])).rows;
    const resumes=(await db.query('SELECT id,source_id,version,filename,content_hash,completeness,created_at FROM resume_versions WHERE tenant_id=$1 AND candidate_id=$2 ORDER BY version DESC',[a.tenant_id,candidateId])).rows;
    const applications=(await db.query('SELECT a.*,v.title,v.version AS job_version FROM applications a JOIN job_versions v ON v.id=a.job_version_id AND v.tenant_id=a.tenant_id WHERE a.tenant_id=$1 AND a.candidate_id=$2 ORDER BY a.created_at DESC',[a.tenant_id,candidateId])).rows;
    const assessments=(await db.query('SELECT i.id,i.submitted_at,i.created_at,i.revoked_at FROM assessment_invites i LEFT JOIN assessment_archive_bindings b ON b.tenant_id=i.tenant_id AND b.invite_id=i.id WHERE i.tenant_id=$1 AND coalesce(i.candidate_id,b.candidate_id)=$2 ORDER BY i.created_at DESC',[a.tenant_id,candidateId])).rows;
    send(res,{...candidate,sources,resumes,applications,assessments});
  });
  app.post('/api/v1/talents/:id/contact-access',async(req,res)=>{
    allowBusiness(res);const candidateId=id.parse(req.params.id),a=context(res).auth;
    const value=await db.transaction(async tx=>{
      const row=(await tx.query<{contact_cipher:string|null}>('SELECT contact_cipher FROM candidates WHERE tenant_id=$1 AND id=$2 AND retention_until>now()',[a.tenant_id,candidateId])).rows[0];if(!row)throw missing();
      await tx.query('INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),a.tenant_id,a.user_id,'contact.read',candidateId]);
      return row.contact_cipher?decryptContact(row.contact_cipher,config.contactKey,a.tenant_id):null;
    });send(res,{contact:value});
  });
  app.get('/api/v1/resumes/:id',async(req,res)=>{
    allowBusiness(res);const resumeId=id.parse(req.params.id),a=context(res).auth;
    const resume=(await db.query('SELECT r.* FROM resume_versions r JOIN candidates c ON c.tenant_id=r.tenant_id AND c.id=r.candidate_id WHERE r.tenant_id=$1 AND r.id=$2 AND c.retention_until>now()',[a.tenant_id,resumeId])).rows[0];if(!resume)throw missing();
    const chunks=(await db.query('SELECT id,line_number,text_content FROM document_chunks WHERE tenant_id=$1 AND resume_version_id=$2 ORDER BY line_number',[a.tenant_id,resumeId])).rows;send(res,{...resume,chunks});
  });
  app.post('/api/v1/applications',async(req,res)=>{
    allowBusiness(res);const input=applicationInput.parse(req.body),a=context(res).auth;
    const result=await db.transaction(async tx=>{
      const c=(await tx.query<{purpose:string}>('SELECT purpose FROM candidates WHERE tenant_id=$1 AND id=$2 AND retention_until>now()',[a.tenant_id,input.candidate_id])).rows[0];if(!c)throw missing();
      if(c.purpose!=='recruitment')throw new ApiError(409,'PURPOSE_REVIEW_REQUIRED','储备用途不能自动转为本次招聘，请先核验用途和意向');
      const j=(await tx.query<Job>('SELECT v.id,v.status FROM job_versions v JOIN jobs j ON j.tenant_id=v.tenant_id AND j.id=v.job_id AND j.revision=v.version WHERE v.tenant_id=$1 AND v.id=$2 AND v.job_id=$3',[a.tenant_id,input.job_version_id,input.job_id])).rows[0];
      if(!j)throw missing();if(j.status!=='open')throw new ApiError(409,'JOB_NOT_OPEN','仅可对已确认招聘中的岗位建立新申请');
      const r=(await tx.query('SELECT id FROM resume_versions WHERE tenant_id=$1 AND id=$2 AND candidate_id=$3',[a.tenant_id,input.resume_version_id,input.candidate_id])).rows[0];if(!r)throw missing();
      const existing=(await tx.query<{id:string;job_version_id:string;resume_version_id:string}>('SELECT id,job_version_id,resume_version_id FROM applications WHERE tenant_id=$1 AND candidate_id=$2 AND job_id=$3 AND batch=$4',[a.tenant_id,input.candidate_id,input.job_id,input.batch])).rows[0];
      if(existing){if(existing.job_version_id!==input.job_version_id||existing.resume_version_id!==input.resume_version_id)throw conflict('该批次已有申请，不覆盖历史版本');return {id:existing.id,duplicate:true};}
      const appId=randomUUID();
      await tx.query('INSERT INTO applications(id,tenant_id,candidate_id,job_id,job_version_id,resume_version_id,batch,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[appId,a.tenant_id,input.candidate_id,input.job_id,input.job_version_id,input.resume_version_id,input.batch,a.user_id]);
      await tx.query('INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),a.tenant_id,a.user_id,'application.created',appId]);return {id:appId,duplicate:false};
    });send(res,result,result.duplicate?200:201);
  });
  app.get('/api/v1/applications',async(req,res)=>{
    allowBusiness(res);allowedKeys(req);const {page,page_size,q}=listInput.parse(req.query),a=context(res).auth;
    const base=`FROM applications a JOIN candidates c ON c.tenant_id=a.tenant_id AND c.id=a.candidate_id JOIN job_versions v ON v.tenant_id=a.tenant_id AND v.id=a.job_version_id JOIN resume_versions r ON r.tenant_id=a.tenant_id AND r.id=a.resume_version_id WHERE a.tenant_id=$1 AND c.retention_until>now() AND (c.name ILIKE $2 OR v.title ILIKE $2)`;
    const params=[a.tenant_id,`%${q}%`];
    const rows=(await db.query(`SELECT a.*,c.name,v.title,v.version AS job_version,r.version AS resume_version ${base} ORDER BY a.created_at DESC,a.id LIMIT $3 OFFSET $4`,[...params,page_size,(page-1)*page_size])).rows;
    const count=(await db.query<{count:number}>(`SELECT count(*)::int AS count ${base}`,params)).rows[0].count;send(res,{items:rows,total:count,page,page_size});
  });
  app.get('/api/v1/audit-events',async(req,res)=>{
    const a=context(res).auth;if(!['ops','talent_lead'].includes(a.role))throw new ApiError(403,'FORBIDDEN_SCOPE','需要审计权限');
    allowedKeys(req);const {page,page_size}=listInput.parse(req.query);
    const rows=(await db.query("SELECT * FROM (SELECT id,actor_id::text,action,object_id,created_at,NULL::text AS actor_label FROM audit_events WHERE tenant_id=$1 UNION ALL SELECT id,actor AS actor_id,action,object_id,created_at,'外部智能体' AS actor_label FROM agent_audit_events WHERE tenant_id=$1) e ORDER BY created_at DESC,id LIMIT $2 OFFSET $3",[a.tenant_id,page_size,(page-1)*page_size])).rows;send(res,{items:rows,page,page_size});
  });
  app.use('/api',(_req,_res,next)=>next(missing()));
  if(config.staticDir){app.use(express.static(config.staticDir));app.get('/{*path}',(_req,res)=>res.sendFile(resolve(config.staticDir!,'index.html')));}
  app.use(async(err:unknown,_req:Request,res:Response,_next:NextFunction)=>{
    if(err instanceof ApiError && err.status===403 && res.locals.auth){
      const a=context(res).auth;
      try{await db.query('INSERT INTO audit_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),a.tenant_id,a.user_id,'access.denied']);}
      catch{console.error(JSON.stringify({request_id:context(res).requestId,code:'AUDIT_WRITE_FAILED'}));}
    }
    if(err instanceof ZodError)return res.status(400).json({error:{code:'INVALID_INPUT',message:'输入格式不正确',fields:err.issues.map(x=>({path:x.path.join('.'),message:x.message}))},request_id:context(res).requestId});
    if(err instanceof ApiError||err instanceof ServiceError)return res.status(err.status).json({error:{code:err.code,message:err.message},request_id:context(res).requestId});
    const code=(err as {code?:string})?.code;
    if(code==='23505')return res.status(409).json({error:{code:'VERSION_CONFLICT',message:'重复或并发请求，请重新加载；没有覆盖原记录'},request_id:context(res).requestId});
    const status=(err as {status?:number})?.status;
    if(status===400||status===413)return res.status(status).json({error:{code:'INVALID_INPUT',message:'JSON 无效或请求过大'},request_id:context(res).requestId});
    // Never log request bodies, session tokens, raw SQL errors, or candidate content.
    console.error(JSON.stringify({request_id:context(res).requestId,code:'INTERNAL_ERROR'}));
    res.status(500).json({error:{code:'INTERNAL_ERROR',message:'服务错误，请凭请求编号联系管理员'},request_id:context(res).requestId});
  });return app;
}
