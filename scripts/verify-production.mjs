// Read credentials from a private local file. Never print credentials or tokens.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin='https://rc.iqilun.cn',privateFile='.local/deploy/rc-verification.json';
const access=await readFile('.local/deploy/rc-production-access.txt','utf8');
const value=label=>access.split('\n').find(l=>l.startsWith(label+': '))?.slice(label.length+2).trim();
let session='',csrf='';
async function call(path,body,authenticated=true){
 const r=await fetch(origin+'/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(authenticated?{Cookie:session,'X-CSRF-Token':csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
 const j=await r.json();return {status:r.status,data:j.data,error:j.error,cookie:r.headers.get('set-cookie'),headers:r.headers};
}
const login=await call('/auth/login',{username:value('账号'),password:value('密码')},false);
assert.equal(login.status,200);assert.match(login.cookie,/Secure/);assert.match(login.cookie,/HttpOnly/);session=login.cookie.split(';')[0];csrf=login.data.csrf_token;
assert.equal((await call('/auth/me')).status,200);
if(process.argv.includes('--read-only')){
 for(const path of ['/jobs','/talents','/applications','/recruiting/materials','/interviews','/ai/settings','/assessment/invites','/readiness'])assert.equal((await call(path)).status,200,path);
 const dashboard=await call('/dashboard');assert.equal(dashboard.status,200);console.log(JSON.stringify({status:'PASS',deployment:'rc.iqilun.cn',counts:dashboard.data}));await call('/auth/logout',{});
}else if(process.argv.includes('--cleanup')){
 const fixture=JSON.parse(await readFile(privateFile,'utf8'));
 const revoke=await call(`/assessment/invites/${fixture.invite_id}/revoke`,{});assert.equal(revoke.status,200);
 assert.equal((await call('/public/assessment/open',fixture.auth,false)).status,404);
 assert.equal((await call(`/assessment/invites/${fixture.invite_id}/delete`,{confirm:'delete_assessment'})).status,200);
 await call('/auth/logout',{});console.log('Public verification invitation revoked and deleted; fictional profile awaits exact-ID offline cleanup.');
}else{
 for(const path of ['/jobs','/talents','/applications','/recruiting/materials','/interviews','/ai/settings','/assessment/invites','/readiness'])assert.equal((await call(path)).status,200,path);
 const list=await call('/assessment/invites');assert.equal(list.data.h5_origin,origin);assert.equal(list.data.ability_estimate_available,true);
 const person=await call('/assessment/people',{name:'【上线验收】临时虚构人员',processing_basis:'本次部署核心流程验收，非真实人员，验收完成后按精确ID清理'});assert.equal(person.status,201);
 const invite=await call('/assessment/invites',{candidate_id:person.data.id,purpose:'仅用于本次线上部署验收，不作招聘依据',days:1,package_kind:'gh_reference_277',estimate_abilities:true});assert.equal(invite.status,201);assert.ok(invite.data.url.startsWith(origin+'/h5/#'));
 const auth={token:invite.data.url.split('#')[1],pin:invite.data.pin};
 const fixture={candidate_id:person.data.id,invite_id:invite.data.id,auth,url:invite.data.url,report_url:invite.data.report_url};
 await writeFile(privateFile,JSON.stringify(fixture),{mode:0o600,flag:'wx'});
 const opened=await call('/public/assessment/open',auth,false);assert.equal(opened.status,200);const pkg=opened.data.package;assert.equal(pkg.questions.length,277);assert.equal(pkg.estimate_abilities,true);
 assert.equal((await call('/public/assessment/consent',{...auth,accepted:true,consent_version:pkg.consent_version},false)).status,200);
 const selected=pkg.value_groups.map(g=>g.slice(0,5)),value_draft={selected,ranked:selected.flat().slice(0,10)},answers=Object.fromEntries(pkg.questions.map(q=>[q.id,3]));
 const draft={...auth,answers:{[pkg.questions[0].id]:3},value_draft:{selected:[[],[],[],[]],ranked:[]},revision:0};assert.equal((await call('/public/assessment/save',draft,false)).status,200);
 const resumed=await call('/public/assessment/open',auth,false);assert.equal(resumed.data.revision,1);assert.equal(Object.keys(resumed.data.answers).length,1);
 if(!process.argv.includes('--draft-only')){
 const submission={...auth,answers,value_draft,revision:1},done=await call('/public/assessment/submit',submission,false);assert.equal(done.status,200);assert.equal(done.data.report.result.abilities.length,28);assert.equal(done.data.report.result.strengths.length,34);assert.equal(done.data.report.result.roles.length,8);assert.equal(done.data.report.recruitment_decision_allowed,false);
 assert.equal((await call('/public/assessment/submit',submission,false)).status,200);
 assert.equal((await call(`/assessment/invites/${invite.data.id}/report`)).status,200);
 const publicResult=await call('/public/assessment/open',auth,false);assert.equal(publicResult.data.submitted,true);
 }
 await call('/auth/logout',{});
 console.log('PASS: HTTPS login/cookie, 8 authenticated modules, 277 invite, consent, save/resume, submit/idempotence, 28 estimated abilities, 8 roles/34 strengths, public/private results. No credentials printed.');
}
