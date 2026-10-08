import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {agentEnvironment,agentFixture} from './helpers/agent-fixture.ts';
const profile={name:'【虚构】同名参与者',phone:'13800000000',birth_date:'1990-06-15'};
async function fixture(t:{after:(fn:()=>Promise<void>)=>void}){const restore=agentEnvironment(),f=await agentFixture();t.after(async()=>{await f.close();restore();});return f;}
async function entry(f:Awaited<ReturnType<typeof agentFixture>>,group?:string){const r=await f.request('/api/v1/assessment/public-entries',{title:'【虚构】公共登记',purpose:'仅用于隔离的外部发展测评',days:7,project_group_id:group??null});assert.equal(r.status,201);const auth={token:r.body.data.url.split('#')[1],pin:r.body.data.pin},open=await f.request('/api/v1/public/assessment/entry/open',auth,null);assert.equal(open.status,200);return {...auth,id:r.body.data.id,consent_version:open.body.data.consent_version};}
test('公共入口多参与者同名不合并、个人凭据隔离、幂等登记与后台分组',async t=>{
 const f=await fixture(t),g=(await f.request('/api/v1/project-groups',{name:'【虚构】公共组'})).body.data.id,e=await entry(f,g);
 const count=async()=>Number((await f.db.query<{n:number}>('SELECT count(*)::int n FROM candidates')).rows[0].n),before=await count(),individuals=[];
 for(let i=0;i<2;i++){const input={token:e.token,pin:e.pin,consent_version:e.consent_version,accepted:true,profile,participant_key:randomBytes(32).toString('base64url')};const r=await f.request('/api/v1/public/assessment/entry/enroll',input,null);assert.equal(r.status,201);individuals.push(r.body.data);
  const retry=await f.request('/api/v1/public/assessment/entry/enroll',input,null);assert.equal(retry.status,201);assert.deepEqual(retry.body.data,r.body.data);
  assert.equal((await f.request('/api/v1/public/assessment/open',{token:r.body.data.token,pin:e.pin},null)).status,404);
 }
 assert.notEqual(individuals[0].token,individuals[1].token);assert.equal(await count(),before);
 const own=await f.request('/api/v1/public/assessment/open',individuals[0],null);assert.equal(own.status,200);assert.equal(own.body.data.metadata.participant_name,profile.name);assert.ok(own.body.data.consented);
 const q=own.body.data.package.questions[0].id;assert.equal((await f.request('/api/v1/public/assessment/save',{...individuals[0],revision:0,answers:{[q]:2}},null)).status,200);
 assert.deepEqual((await f.request('/api/v1/public/assessment/open',individuals[1],null)).body.data.answers,{});
 const list=(await f.request('/api/v1/assessment/invites?kind=external&group='+g)).body.data;assert.equal(list.total,2);assert.ok(list.items.every((x:{candidate_id:string|null})=>x.candidate_id===null));
 const admin=(await f.request('/api/v1/assessment/public-entries')).body.data.items;assert.equal(admin[0].participants,2);assert.equal(admin[0].completed,0);
 const raw=(await f.db.query<{profile_cipher:string;token_hash:string;pin_hash:string}>('SELECT profile_cipher,token_hash,pin_hash FROM assessment_invites WHERE public_entry_id=$1',[e.id])).rows;for(const row of raw){assert.ok(!row.profile_cipher.includes(profile.phone));assert.ok(!row.profile_cipher.includes(profile.name));assert.notEqual(row.token_hash,individuals[0].token);}
 assert.equal((await f.request('/api/v1/public/assessment/open',{token:e.token,pin:e.pin},null)).status,404);
});
test('公共登记校验资料/同意/版本、跨入口凭据与权限；撤销不删除已有个人报告',async t=>{
 const f=await fixture(t),e=await entry(f),e2=await entry(f);const body={token:e.token,pin:e.pin,consent_version:e.consent_version,accepted:true,profile,participant_key:randomBytes(32).toString('base64url')};
 for(const invalid of [{accepted:false},{consent_version:'wrong'},{profile:{...profile,name:''}},{profile:{...profile,birth_date:'2099-01-01'}},{candidate_id:f.candidate}])assert.equal((await f.request('/api/v1/public/assessment/entry/enroll',{...body,...invalid},null)).status,400);
 const enrolled=await f.request('/api/v1/public/assessment/entry/enroll',body,null);assert.equal(enrolled.status,201);
 assert.equal((await f.request('/api/v1/public/assessment/entry/enroll',{...body,token:e2.token,pin:e2.pin},null)).status,404);
 assert.equal((await f.request('/api/v1/assessment/public-entries',undefined,'ops')).status,403);assert.equal((await f.request('/api/v1/assessment/public-entries',undefined,null)).status,401);
 assert.equal((await f.request(`/api/v1/assessment/public-entries/${e.id}/revoke`,{})).status,200);
 assert.equal((await f.request('/api/v1/public/assessment/entry/open',{token:e.token,pin:e.pin},null)).status,404);
 assert.equal((await f.request('/api/v1/public/assessment/entry/enroll',body,null)).status,404);
 assert.equal((await f.request('/api/v1/public/assessment/open',enrolled.body.data,null)).status,200);
});
test('公共入口完整答卷生成个人报告、续答与后补绑定；招聘专属邀请自动关联申请',async t=>{
 const f=await fixture(t),e=await entry(f),r=await f.request('/api/v1/public/assessment/entry/enroll',{token:e.token,pin:e.pin,consent_version:e.consent_version,accepted:true,profile,participant_key:randomBytes(32).toString('base64url')},null),auth=r.body.data;
 assert.equal(r.status,201);const opened=(await f.request('/api/v1/public/assessment/open',auth,null)).body.data,pkg=opened.package,selected=pkg.value_groups.map((g:string[])=>g.slice(0,5));
 const submitted=await f.request('/api/v1/public/assessment/submit',{...auth,revision:0,answers:Object.fromEntries(pkg.questions.map((q:{id:string})=>[q.id,3])),value_draft:{selected,ranked:selected.flat().slice(0,10)}},null);assert.equal(submitted.status,200);assert.ok(submitted.body.data.report);
 const resumed=(await f.request('/api/v1/public/assessment/open',auth,null)).body.data;assert.ok(resumed.submitted);assert.deepEqual(resumed.report,submitted.body.data.report);
 assert.equal((await f.request(`/api/v1/assessment/invites/${opened.id}/bind`,{candidate_id:f.candidate,confirm:'bind_assessment'})).status,200);
 assert.deepEqual((await f.request(`/api/v1/assessment/invites/${opened.id}/report`)).body.data.report,resumed.report);
 const own=await f.request('/api/v1/assessment/invites',{candidate_id:f.candidate,application_id:f.application,participant_kind:'internal',purpose:'本岗位申请的自我了解与发展沟通',days:7});assert.equal(own.status,201);
 const row=(await f.db.query<{candidate_id:string;application_id:string;public_entry_id:string|null}>('SELECT candidate_id,application_id,public_entry_id FROM assessment_invites WHERE id=$1',[own.body.data.id])).rows[0];assert.equal(row.candidate_id,f.candidate);assert.equal(row.application_id,f.application);assert.equal(row.public_entry_id,null);
 assert.equal(f.modelCalls(),0);
});
test('公共入口拒绝跨租户项目与撤销、陌生凭据；频率限制不允许无限制造记录',async t=>{
 const f=await fixture(t);assert.equal((await f.request('/api/v1/assessment/public-entries',{title:'【虚构】',purpose:'仅用于虚构隔离',days:7,project_group_id:randomUUID()})).status,404);
 const e=await entry(f);assert.equal((await f.request('/api/v1/public/assessment/entry/open',{token:randomBytes(32).toString('base64url'),pin:e.pin},null)).status,404);
 const foreign=randomUUID(),user=randomUUID();await f.db.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[foreign,'虚构另租户']);await f.db.query("INSERT INTO staff_users(id,tenant_id,username,password_hash,role) VALUES($1,$2,'foreign','unusable','hr')",[user,foreign]);await f.db.query('UPDATE assessment_public_entries SET tenant_id=$2,created_by=$3 WHERE id=$1',[e.id,foreign,user]);
 assert.equal((await f.request(`/api/v1/assessment/public-entries/${e.id}/revoke`,{})).status,404);assert.equal((await f.request('/api/v1/assessment/public-entries')).body.data.items.length,0);
 let limited=false;for(let i=0;i<65;i++){const r=await f.request('/api/v1/public/assessment/entry/open',{token:e.token,pin:e.pin},null);if(r.status===429){limited=true;break;}}assert.ok(limited);
});
