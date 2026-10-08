import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,generateKeyPairSync,sign,createHash,createHmac} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer,type Server} from 'node:http';
import {openDatabase,type Database} from '../apps/api/db.ts';
import {createApp} from '../apps/api/app.ts';
import {iamConfig,mapIAMIdentity,selectIAMRole,type IAMBridge} from '../apps/api/iam.ts';
import {createIAM} from '../packages/iam/vendor/iam-client.mjs';
import {hashPassword} from '../packages/security/index.ts';

let db:Database;
const tenant=randomUUID(),otherTenant=randomUUID(),legacy=randomUUID(),otherUser=randomUUID(),password='Fictional-IAM-check-984!';
const identity={id:'usr_fictional',auth_user_id:'usr_fictional',system_id:'sys_talent',username:'same-name',status:'active',must_change:0,roles:['hr'],permissions:['talent.view','talent.recruit'],local_user_id:null};
const mappingConfig={issuer:'https://zh.iqilun.cn',systemId:'sys_talent',tenantId:tenant};
before(async()=>{db=await openDatabase();const hash=await hashPassword(password);for(const id of [tenant,otherTenant])await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[id,'虚构验收']);for(const [id,tid] of [[legacy,tenant],[otherUser,otherTenant]])await db.query('INSERT INTO staff_users(id,tenant_id,username,password_hash,role) VALUES($1,$2,$3,$4,$5)',[id,tid,'same-name',hash,'talent_lead']);});
after(async()=>{await db.close();});
const listen=async(server:Server)=>{await new Promise<void>(r=>server.once('listening',r));const a=server.address();assert.ok(a&&typeof a!=='string');return `http://127.0.0.1:${a.port}`;};
const close=(s:Server)=>new Promise<void>(r=>s.close(()=>r()));

test('去掉组织输入后由服务端固定范围，同名账号不会跨范围登录',async()=>{
 const origin='http://127.0.0.1:3100',app=createApp(db,{origin,defaultTenantId:tenant,contactKey:randomBytes(32)}),s=app.listen(0,'127.0.0.1'),base=await listen(s);
 try{
  const login=async(body:unknown)=>fetch(base+'/api/v1/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const good=await login({username:'same-name',password});assert.equal(good.status,200);assert.equal((await good.json()).data.tenant_id,tenant);
  assert.equal((await login({username:'same-name',password,tenant_id:otherTenant})).status,401);
  assert.equal((await login({username:'same-name',password:'wrong'})).status,401);
  const options=await (await fetch(base+'/api/v1/auth/options')).json();assert.equal(options.data.unified_login,false);assert.equal(JSON.stringify(options).includes(tenant),false);
  assert.equal((await fetch(base+'/api/iam/login')).status,503);
 }finally{await close(s);}
});
test('过期回调为浏览器提供新登录入口，API保留错误且不泄露回调凭据',async()=>{
 const bridge:IAMBridge={close(){},current:async()=>null,handle:async()=>{throw Object.assign(new Error('private-upstream-secret'),{status:400});}};
 const origin='http://127.0.0.1:3100',s=createApp(db,{origin,defaultTenantId:tenant,contactKey:randomBytes(32),iam:bridge}).listen(0,'127.0.0.1'),base=await listen(s);
 try{
  const html=await fetch(base+'/api/iam/callback?code=private-code&state=private-state',{headers:{Accept:'text/html'}});assert.equal(html.status,400);assert.match(html.headers.get('content-type')??'',/text\/html/);const body=await html.text();assert.match(body,/href="\/api\/iam\/login"/);assert.doesNotMatch(body,/private-code|private-state|private-upstream-secret/);
  const json=await fetch(base+'/api/iam/callback',{headers:{Accept:'application/json'}});assert.equal(json.status,400);assert.equal((await json.json()).error.code,'IAM_UNAVAILABLE');
 }finally{await close(s);}
});
test('没有固定范围且有多个工作区时拒绝猜测；单工作区可不填ID',async()=>{
 const app=createApp(db,{origin:'http://127.0.0.1:3100',contactKey:randomBytes(32)}),s=app.listen(0,'127.0.0.1'),base=await listen(s);
 try{assert.equal((await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{Origin:'http://127.0.0.1:3100','Content-Type':'application/json'},body:JSON.stringify({username:'same-name',password})})).status,503);}finally{await close(s);}
 const single=await openDatabase();await single.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[tenant,'单一虚构工作区']);await single.query('INSERT INTO staff_users(id,tenant_id,username,password_hash,role) VALUES($1,$2,$3,$4,$5)',[legacy,tenant,'same-name',await hashPassword(password),'hr']);
 const one=createApp(single,{origin:'http://127.0.0.1:3100',contactKey:randomBytes(32)}).listen(0,'127.0.0.1'),url=await listen(one);
 try{assert.equal((await fetch(url+'/api/v1/auth/login',{method:'POST',headers:{Origin:'http://127.0.0.1:3100','Content-Type':'application/json'},body:JSON.stringify({username:'same-name',password})})).status,200);}finally{await close(one);await single.close();}
});
test('统一身份配置必须完整，生产限制固定中心、域名与私有会话路径',()=>{
 assert.equal(iamConfig({},'https://rc.iqilun.cn'),undefined);
 assert.throws(()=>iamConfig({IAM_ENABLED:'1'},'https://rc.iqilun.cn'),/incomplete/);
 const env={NODE_ENV:'production',IAM_ENABLED:'1',IAM_ISSUER:'https://zh.iqilun.cn',IAM_CLIENT_ID:'test-client',IAM_CLIENT_SECRET:'fictional-secret',IAM_WEBHOOK_SECRET:'fictional-hook',IAM_SYSTEM_ID:'sys_talent',IAM_SESSION_DB:'/app/.local/iam/sessions.sqlite',DEFAULT_TENANT_ID:tenant};
 assert.ok(iamConfig(env,'https://rc.iqilun.cn'));
 assert.throws(()=>iamConfig({...env,IAM_ISSUER:'https://other.invalid'},'https://rc.iqilun.cn'));
 assert.throws(()=>iamConfig({...env,IAM_SESSION_DB:'/app/dist/admin-web/session.sqlite'},'https://rc.iqilun.cn'));
 assert.throws(()=>iamConfig({...env,IAM_ENABLED:'true'},'https://rc.iqilun.cn'));
});
test('中央角色与人才权限必须同时满足，不自动取管理员或合并多角色',()=>{
 assert.equal(selectIAMRole(['hr'],['talent.view','talent.recruit']),'hr');
 assert.equal(selectIAMRole(['ops'],['talent.view','talent.audit']),'ops');
 assert.equal(selectIAMRole(['interviewer'],['talent.view']),'interviewer');
 for(const [roles,perms] of [[['admin'],['talent.manage']], [['talent_lead'],['talent.view']], [['hr','talent_lead'],['talent.view','talent.recruit','talent.manage']], [[],['talent.view']]])assert.throws(()=>selectIAMRole(roles,perms));
});
test('统一ID稳定建档；不凭同名绑定、不复制密码，降权与跨系统校验在服务端',async()=>{
 const first=await mapIAMIdentity(db,mappingConfig,identity);assert.notEqual(first.user_id,legacy);assert.equal(first.role,'hr');
 assert.equal((await mapIAMIdentity(db,mappingConfig,identity)).user_id,first.user_id);
 const staff=(await db.query<{username:string;password_hash:string}>('SELECT username,password_hash FROM staff_users WHERE id=$1',[first.user_id])).rows[0];assert.match(staff.username,/^iam_/);assert.equal(staff.password_hash,'iam-only');
 assert.equal((await db.query<{role:string}>('SELECT role FROM staff_users WHERE id=$1',[legacy])).rows[0].role,'talent_lead');
 const downgraded=await mapIAMIdentity(db,mappingConfig,{...identity,roles:['ops'],permissions:['talent.view','talent.audit']});assert.equal(downgraded.role,'ops');
 for(const bad of [{...identity,system_id:'other'}, {...identity,status:'disabled'}, {...identity,auth_user_id:'wrong'}, {...identity,must_change:1}, {...identity,local_user_id:legacy}, {...identity,roles:['hr'],permissions:[]}])await assert.rejects(mapIAMIdentity(db,mappingConfig,bad));
 await assert.rejects(mapIAMIdentity(db,{...mappingConfig,tenantId:otherTenant},identity));
});
test('只有中心明确确认的旧用户ID可绑定；绑定不改密码，不允许跨工作区或二次占用',async()=>{
 const oldHash=(await db.query<{password_hash:string}>('SELECT password_hash FROM staff_users WHERE id=$1',[legacy])).rows[0].password_hash;
 const bound=await mapIAMIdentity(db,mappingConfig,{...identity,id:'usr_bound',auth_user_id:'usr_bound',local_user_id:legacy});assert.equal(bound.user_id,legacy);
 assert.equal((await db.query<{password_hash:string}>('SELECT password_hash FROM staff_users WHERE id=$1',[legacy])).rows[0].password_hash,oldHash);
 await assert.rejects(mapIAMIdentity(db,mappingConfig,{...identity,id:'usr_conflict',auth_user_id:'usr_conflict',local_user_id:legacy}));
 await assert.rejects(mapIAMIdentity(db,mappingConfig,{...identity,id:'usr_wrong_scope',auth_user_id:'usr_wrong_scope',local_user_id:otherUser}));
});
test('启用统一登录后不回退本地密码或旧Cookie，实时角色降权、中心故障及CSRF均拒绝',async()=>{
 let live:'hr'|'talent_lead'|'ops'|'disabled'|'unavailable'='hr',calls=0;
 const bridge:IAMBridge={close(){},handle:async()=>new Response(null,{status:302,headers:{location:'https://zh.iqilun.cn/auth'}}),current:async req=>{calls++;if(live==='unavailable')throw new Error('unavailable');if(live==='disabled')throw Object.assign(new Error('disabled'),{status:403});if(!req.headers.get('cookie')?.includes('mock=1'))return null;return {local:{tenant_id:tenant,user_id:legacy,username:'central-account',role:live},csrf:'fictional-csrf'};}};
 const origin='http://127.0.0.1:3100',s=createApp(db,{origin,defaultTenantId:tenant,contactKey:randomBytes(32),iam:bridge}).listen(0,'127.0.0.1'),base=await listen(s);
 try{
  const req=(path:string,body?:object,headers:Record<string,string>={})=>fetch(base+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'mock=1',...headers},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual'});
  assert.equal((await req('/api/v1/auth/login',{username:'same-name',password})).status,403);
  assert.equal((await req('/api/v1/auth/me',undefined,{Cookie:'qilun_session=old-password-session'})).status,401);
  assert.equal((await req('/api/v1/jobs')).status,200);assert.ok(calls>=2);
  assert.equal((await req('/api/v1/assessment/rules')).status,403);
  live='talent_lead';assert.equal((await req('/api/v1/assessment/rules')).status,200);
  live='hr';assert.equal((await req('/api/v1/assessment/rules')).status,403);
  assert.equal((await req('/api/v1/assessment/people',{name:'x',processing_basis:'test'})).status,403);
  live='ops';assert.equal((await req('/api/v1/jobs')).status,403);assert.equal((await req('/api/v1/audit-events')).status,200);
  live='disabled';assert.equal((await req('/api/v1/auth/me')).status,403);
  live='unavailable';assert.equal((await req('/api/v1/auth/me')).status,503);
  assert.equal((await req('/api/iam/logout',{}, {Origin:'https://evil.invalid'})).status,403);
 }finally{await close(s);}
});
test('登录界面与工作台不展示组织ID，统一按钮由服务端配置决定',async()=>{
 const src=await readFile(new URL('../apps/admin-web/src/main.tsx',import.meta.url),'utf8');assert.ok(!src.includes('label="组织 ID"'));assert.ok(!src.includes('session.tenant_name'));assert.match(src,/loginOptions.unified_login/);
 for(const file of ['talents.tsx','recruiting.tsx','h5.tsx','h5-reference.tsx'])assert.doesNotMatch(await readFile(new URL('../apps/admin-web/src/'+file,import.meta.url),'utf8'),/本组织|本地组织|邀请组织/);
});

test('真实OIDC客户端：PKCE、签名、nonce/state、一次性回调、实时撤权、HMAC幂等与退出',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'qilun-iam-test-'));
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const jwk={...publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256',use:'sig'};
 let issuer='',nonce='',challenge='',liveUser=true,tamper=false,wrongNonce=false,serviceCalls=0,refreshCalls=0,refreshSoon=false;
 const jwt=()=>{const now=Math.floor(Date.now()/1000),parts=[Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key'})).toString('base64url'),Buffer.from(JSON.stringify({iss:issuer,aud:'test-client',sub:identity.id,iat:now,exp:now+600,nonce:wrongNonce?'wrong-nonce':nonce})).toString('base64url')];const signature=sign('RSA-SHA256',Buffer.from(parts.join('.')),privateKey).toString('base64url');return parts.join('.')+'.'+(tamper?(signature[0]==='X'?'Y':'X')+signature.slice(1):signature);};
 const central=createServer(async(req,res)=>{
  const url=new URL(req.url!,issuer);res.setHeader('Content-Type','application/json');
  if(url.pathname==='/.well-known/openid-configuration')return res.end(JSON.stringify({issuer,authorization_endpoint:issuer+'/auth',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256'],token_endpoint_auth_methods_supported:['client_secret_post']}));
  if(url.pathname==='/jwks')return res.end(JSON.stringify({keys:[jwk]}));
  if(url.pathname==='/token'){
   let raw='';for await(const chunk of req)raw+=chunk;const data=new URLSearchParams(raw);
   if(data.get('client_secret')!=='fictional-secret'){res.statusCode=401;return res.end(JSON.stringify({error:'invalid_client'}));}
   if(data.get('grant_type')==='authorization_code'&&createHash('sha256').update(data.get('code_verifier')!).digest('base64url')!==challenge){res.statusCode=400;return res.end(JSON.stringify({error:'invalid_grant'}));}
   if(data.get('grant_type')==='refresh_token')refreshCalls++;
   return res.end(JSON.stringify({access_token:'fictional-access',refresh_token:'fictional-refresh',token_type:'Bearer',expires_in:refreshSoon?1:600,id_token:jwt()}));
  }
  if(url.pathname==='/api/v1/me'||url.pathname.startsWith('/api/v1/service/users/')){
   if(url.pathname.includes('/service/')){serviceCalls++;assert.equal(req.headers['x-client-id'],'test-client');assert.equal(req.headers['x-client-secret'],'fictional-secret');}
   if(!liveUser){res.statusCode=403;return res.end(JSON.stringify({error:'revoked'}));}return res.end(JSON.stringify(identity));
  }
  res.statusCode=404;res.end('{}');
 }).listen(0,'127.0.0.1');issuer=await listen(central);
 const origin='http://127.0.0.1:3100',hook='fictional-webhook-secret',client=createIAM({issuer,origin,clientId:'test-client',clientSecret:'fictional-secret',webhookSecret:hook,systemId:identity.system_id,database:join(directory,'sessions.sqlite'),onIdentity:async()=>({tenant_id:tenant,user_id:legacy,username:identity.username,role:'hr'})});
 const begin=async()=>{const response=await client.handle(new Request(origin+'/api/iam/login'));assert.equal(response.status,302);const target=new URL(response.headers.get('location')!);assert.equal(target.searchParams.get('code_challenge_method'),'S256');assert.equal(target.searchParams.get('redirect_uri'),origin+'/api/iam/callback');assert.equal(target.searchParams.get('scope'),'openid profile offline_access');assert.equal(target.searchParams.get('prompt'),'consent');nonce=target.searchParams.get('nonce')!;challenge=target.searchParams.get('code_challenge')!;return {cookie:response.headers.getSetCookie()[0].split(';')[0],url:origin+'/api/iam/callback?code=fictional-code&state='+target.searchParams.get('state')+'&iss='+encodeURIComponent(issuer)};};
 const finish=async(pending:Awaited<ReturnType<typeof begin>>)=>client.handle(new Request(pending.url,{headers:{Cookie:pending.cookie}}));
 try{
  await assert.rejects(client.handle(new Request(origin+'/api/iam/login?returnTo=https://evil.invalid')));
  await assert.rejects(client.handle(new Request(origin+'/api/iam/login?returnTo=%2F%2Fevil.invalid')));
  const first=await begin();await assert.rejects(client.handle(new Request(first.url,{headers:{Cookie:'wrong=1'}})));
  const completed=await finish(first);assert.equal(completed.status,302);assert.equal(completed.headers.get('location'),'/');const session=completed.headers.getSetCookie().find(c=>!c.includes('_state='))!.split(';')[0];
  assert.match(completed.headers.getSetCookie()[0],/HttpOnly/);assert.match(completed.headers.getSetCookie()[0],/SameSite=Lax/);
  await assert.rejects(finish(first));
  const request=new Request(origin+'/api/v1/jobs',{headers:{Cookie:session}});const me=await client.current(request);assert.ok(me?.csrf);assert.equal(me!.local!==null,true);
  await assert.rejects(client.handle(new Request(origin+'/api/iam/logout',{method:'POST',headers:{Origin:origin,Cookie:session,'X-CSRF-Token':'wrong'}})));
  liveUser=false;await assert.rejects(client.current(request));assert.equal(await client.current(request),null);liveUser=true;
  tamper=true;await assert.rejects(finish(await begin()));tamper=false;
  wrongNonce=true;await assert.rejects(finish(await begin()));wrongNonce=false;
  refreshSoon=true;const fresh=await finish(await begin()),freshSession=fresh.headers.getSetCookie().find(c=>!c.includes('_state='))!.split(';')[0];refreshSoon=false;assert.ok(await client.current(new Request(origin+'/api/v1/jobs',{headers:{Cookie:freshSession}})));assert.equal(refreshCalls,1);
  const event=JSON.stringify({event_id:'evt_fictional',user:{id:identity.id},system_id:identity.system_id}),timestamp=String(Date.now()),signature=createHmac('sha256',hook).update(timestamp+'.'+event).digest('hex');
  const webhook=(sig=signature,time=timestamp)=>client.handle(new Request(origin+'/api/iam/webhook',{method:'POST',headers:{'X-IAM-Timestamp':time,'X-IAM-Signature':sig},body:event}));
  await assert.rejects(webhook('a'.repeat(64)));await assert.rejects(webhook(signature,'1'));
  assert.equal((await webhook()).status,200);assert.equal((await webhook()).status,200);assert.equal(serviceCalls,1);assert.equal(await client.current(new Request(origin+'/api/v1/jobs',{headers:{Cookie:freshSession}})),null);
  const last=await finish(await begin()),lastCookie=last.headers.getSetCookie().find(c=>!c.includes('_state='))!.split(';')[0],user=await client.current(new Request(origin+'/api/v1/jobs',{headers:{Cookie:lastCookie}}));
  assert.equal((await client.handle(new Request(origin+'/api/iam/logout',{method:'POST',headers:{Origin:origin,Cookie:lastCookie,'X-CSRF-Token':user!.csrf}}))).status,200);assert.equal(await client.current(new Request(origin+'/api/v1/jobs',{headers:{Cookie:lastCookie}})),null);
 }finally{client.close();await close(central);await rm(directory,{recursive:true,force:true});}
});
