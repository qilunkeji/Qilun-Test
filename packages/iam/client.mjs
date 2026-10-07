// Server-only adaptation of 齐论AI系统账号管理/sdk/index.mjs (2026-10-06).
// Built with pinned openid-client 6.8.1; never import this into a browser bundle.
import * as oidc from 'openid-client';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash,createHmac,timingSafeEqual} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const hash=v=>createHash('sha256').update(v).digest('hex');
const random=()=>randomBytes(32).toString('base64url');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
export function createIAM(options){
 const {issuer,clientId,clientSecret,origin,webhookSecret,systemId,onIdentity}=options;
 if(!issuer||!clientId||!clientSecret||!origin||!webhookSecret||!systemId||!onIdentity)throw new Error('IAM configuration is incomplete');
 for(const value of [issuer,origin]){const url=new URL(value);if(url.origin!==value||url.username||url.password||(!value.startsWith('https://')&&!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(value)))throw new Error('IAM requires an exact HTTPS origin');}
 const filename=options.database;fs.mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
 const db=new DatabaseSync(filename);fs.chmodSync(filename,0o600);
 db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS iam_sessions(hash TEXT PRIMARY KEY,payload TEXT,expires INTEGER); CREATE TABLE IF NOT EXISTS iam_states(hash TEXT PRIMARY KEY,payload TEXT,expires INTEGER); CREATE TABLE IF NOT EXISTS iam_events(id TEXT PRIMARY KEY,created INTEGER);');
 const name='iam_'+hash(clientId).slice(0,12),stateName=name+'_state',secure=origin.startsWith('https:');
 const getCookie=(req,key)=>(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(key+'='))?.slice(key.length+1)||'';
 const cookie=(key,value,max=28800)=>`${key}=${value}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${max}${secure?'; Secure':''}`;
 let configPromise;
 const config=()=>configPromise||(configPromise=oidc.discovery(new URL(issuer),clientId,clientSecret,oidc.ClientSecretPost(clientSecret),{timeout:8,execute:[oidc.enableNonRepudiationChecks,...(issuer.startsWith('http:')?[oidc.allowInsecureRequests]:[])]}).catch(e=>{configPromise=null;throw e}));
 const json=async r=>{const body=await r.text();if(body.length>65536)fail(503,'统一身份响应过大');return JSON.parse(body)};
 const liveUser=async(token)=>{
  const r=await fetch(issuer+'/api/v1/me',{headers:{authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!r.ok)fail([400,401,403,428].includes(r.status)?r.status:503,'统一账号失效、未授权或需要修改初始密码');
  return json(r);
 };
 const checkedIdentity=async(user,subject)=>{
  if(user?.id!==subject||user.auth_user_id!==subject||user.system_id!==systemId||user.status!=='active'||user.deleted_at||user.must_change)fail(403,'统一账号未获人才系统授权');
  return onIdentity(user);
 };
 const locks=new Map();
 async function current(req){
  const key=hash(getCookie(req,name)),row=db.prepare('SELECT * FROM iam_sessions WHERE hash=? AND expires>?').get(key,Date.now());
  if(!row)return null;
  let payload=JSON.parse(row.payload);
  try{
   if(payload.expires_at<Date.now()+30000){
    if(!locks.has(key))locks.set(key,(async()=>{
     const tokens=await oidc.refreshTokenGrant(await config(),payload.refresh_token);
     if(tokens.claims()?.sub&&tokens.claims().sub!==payload.subject)fail(403,'统一身份不匹配');
     const next={...payload,...tokens,expires_at:Date.now()+(tokens.expires_in||600)*1000};
     const changed=db.prepare('UPDATE iam_sessions SET payload=? WHERE hash=?').run(JSON.stringify(next),key);
     if(!changed.changes)fail(401,'登录已失效');return next;
    })().finally(()=>locks.delete(key)));
    payload=await locks.get(key);
   }
   // Always re-check the live, client-scoped grant; never authorize from cached claims.
   const user=await liveUser(payload.access_token),local=await checkedIdentity(user,payload.subject);
   return {...user,local,csrf:payload.csrf};
  }catch(e){if([400,401,403,428].includes(e.status))db.prepare('DELETE FROM iam_sessions WHERE hash=?').run(key);throw e;}
 }
 async function handle(req){
  const url=new URL(req.url);if(url.origin!==origin)fail(400,'请求地址无效');
  if(url.pathname==='/api/iam/login'&&req.method==='GET'){
   const state=oidc.randomState(),nonce=oidc.randomNonce(),verifier=oidc.randomPKCECodeVerifier(),challenge=await oidc.calculatePKCECodeChallenge(verifier);
   const returnTo=url.searchParams.get('returnTo')||'/';if(!/^\/(?!\/)/.test(returnTo)||/[\\\r\n]/.test(returnTo)||new URL(returnTo,origin).origin!==origin)fail(400,'返回地址无效');
   db.prepare('DELETE FROM iam_states WHERE expires<?').run(Date.now());
   db.prepare('DELETE FROM iam_sessions WHERE expires<?').run(Date.now());
   if(db.prepare('SELECT count(*) n FROM iam_states').get().n>=1000)fail(429,'登录请求过多，请稍后重试');
   // OIDC Core requires an explicit consent prompt before an authorization
   // server may grant offline_access and issue a refresh token.
   const target=oidc.buildAuthorizationUrl(await config(),{redirect_uri:origin+'/api/iam/callback',scope:'openid profile offline_access',response_type:'code',response_mode:'query',prompt:'consent',state,nonce,code_challenge:challenge,code_challenge_method:'S256'});
   db.prepare('INSERT INTO iam_states VALUES(?,?,?)').run(hash(state),JSON.stringify({state,nonce,verifier,returnTo}),Date.now()+600000);
   return new Response(null,{status:302,headers:{location:target.href,'set-cookie':cookie(stateName,state,600)}});
  }
  if(url.pathname==='/api/iam/callback'&&req.method==='GET'){
   const state=url.searchParams.get('state');if(!state||state!==getCookie(req,stateName))fail(400,'登录状态校验失败');
   const row=db.prepare('SELECT payload FROM iam_states WHERE hash=? AND expires>?').get(hash(state),Date.now());if(!row)fail(400,'登录请求已过期或已经使用');
   db.prepare('DELETE FROM iam_states WHERE hash=?').run(hash(state));const pending=JSON.parse(row.payload);
   const tokens=await oidc.authorizationCodeGrant(await config(),url,{pkceCodeVerifier:pending.verifier,expectedState:state,expectedNonce:pending.nonce,idTokenExpected:true});
   const subject=tokens.claims()?.sub;if(!subject||!tokens.refresh_token)fail(403,'统一身份或刷新令牌缺失');
   const user=await liveUser(tokens.access_token);await checkedIdentity(user,subject);
   const token=random(),headers=new Headers({location:pending.returnTo});
   db.prepare('INSERT INTO iam_sessions VALUES(?,?,?)').run(hash(token),JSON.stringify({...tokens,subject,csrf:random(),expires_at:Date.now()+(tokens.expires_in||600)*1000}),Date.now()+28800000);
   headers.append('set-cookie',cookie(name,token));headers.append('set-cookie',cookie(stateName,'',0));
   return new Response(null,{status:302,headers});
  }
  if(url.pathname==='/api/iam/webhook'&&req.method==='POST'){
   const timestamp=req.headers.get('x-iam-timestamp')||'',signature=req.headers.get('x-iam-signature')||'';
   if(!/^\d+$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>300000)fail(401,'同步签名已过期');
   const body=await req.text();if(Buffer.byteLength(body)>256000)fail(413,'同步数据过大');
   const expected=createHmac('sha256',webhookSecret).update(timestamp+'.'+body).digest('hex');
   if(!/^[0-9a-f]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))fail(401,'同步签名无效');
   let event;try{event=JSON.parse(body)}catch{fail(400,'同步事件格式错误')}
   if(typeof event.event_id!=='string'||event.event_id.length>128||typeof event.user?.id!=='string'||event.system_id!==systemId)fail(400,'同步事件格式错误');
   if(!db.prepare('SELECT id FROM iam_events WHERE id=?').get(event.event_id)){
    const r=await fetch(issuer+'/api/v1/service/users/'+encodeURIComponent(event.user.id),{headers:{'x-client-id':clientId,'x-client-secret':clientSecret},redirect:'error',signal:AbortSignal.timeout(8000)});
    // Invalidate first; a stale webhook must never re-create an old grant/session.
    db.prepare("DELETE FROM iam_sessions WHERE json_extract(payload,'$.subject')=?").run(event.user.id);
    if(r.ok){const user=await json(r);try{await checkedIdentity(user,event.user.id)}catch(e){if(e.status!==403)throw e;}}
    else if(r.status!==403)fail(r.status===401?401:503,'同步查询失败');
    db.prepare('INSERT OR IGNORE INTO iam_events VALUES(?,?)').run(event.event_id,Date.now());
   }
   return Response.json({ok:true,event_id:event.event_id});
  }
  if(url.pathname==='/api/iam/session'&&req.method==='GET'){const user=await current(req);return Response.json({user:user?{id:user.id,name:user.name,roles:user.roles,permissions:user.permissions,csrf:user.csrf}:null});}
  if(url.pathname==='/api/iam/logout'&&req.method==='POST'){
   if(req.headers.get('origin')!==origin)fail(403,'请求来源无效');
   const row=db.prepare('SELECT payload FROM iam_sessions WHERE hash=? AND expires>?').get(hash(getCookie(req,name)),Date.now());
   if(!row||req.headers.get('x-csrf-token')!==JSON.parse(row.payload).csrf)fail(403,'会话校验失败');
   db.prepare('DELETE FROM iam_sessions WHERE hash=?').run(hash(getCookie(req,name)));
   return Response.json({ok:true},{headers:{'set-cookie':cookie(name,'',0)}});
  }
  return new Response('Not found',{status:404});
 }
 return {handle,current,close:()=>db.close()};
}
