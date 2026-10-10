import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {agentEnvironment,agentFixture} from './helpers/agent-fixture.ts';
import {createApp} from '../apps/api/app.ts';
import {loadAssessmentRuntime} from '../apps/api/assessment-product.ts';
import {qilunStandardInvitePackage} from '../packages/assessment-engine/gh-invite.ts';
import {digest,encryptContact} from '../packages/security/index.ts';
const profile={name:'【虚构】同名参与者',phone:'13800000000',birth_date:'1990-06-15'};
async function fixture(t:{after:(fn:()=>Promise<void>)=>void}){const restore=agentEnvironment(),f=await agentFixture();t.after(async()=>{await f.close();restore();});return f;}
async function entry(f:Awaited<ReturnType<typeof agentFixture>>,group?:string){
 const r=await f.request('/api/v1/assessment/public-entries',{title:'【虚构】公共登记',purpose:'仅用于隔离的外部发展测评',days:7,project_group_id:group??null});assert.equal(r.status,201);assert.equal(r.body.data.pin,undefined);
 const url=new URL(r.body.data.url),token=url.hash.slice(1);assert.equal(url.pathname,'/h5');assert.equal(url.search,'');assert.match(token,/^[A-Za-z0-9_-]{22}$/);assert.equal(Buffer.from(token,'base64url').length,16);const open=await f.request('/api/v1/public/assessment/entry/open',{token},null);assert.equal(open.status,200);assert.doesNotMatch(JSON.stringify(open.body),/participant_name|answers|profile_cipher|pin/);return {token,id:r.body.data.id,consent_version:open.body.data.consent_version};
}
function enrollment(e:Awaited<ReturnType<typeof entry>>,name=profile.name){return {token:e.token,consent_version:e.consent_version,accepted:true,profile:{...profile,name},participant_key:randomBytes(32).toString('base64url')};}
test('同一链接十人无密码登记：同名不合并、答案隔离、幂等重试与独立报告',async t=>{
 const f=await fixture(t),g=(await f.request('/api/v1/project-groups',{name:'【虚构】公共组'})).body.data.id,e=await entry(f,g);
 const before=(await f.db.query<{n:number}>('SELECT count(*)::int n FROM candidates')).rows[0].n;
 const inputs=Array.from({length:10},(_,i)=>enrollment(e,i<2?profile.name:`【虚构】参与者${i+1}`));
 const individuals=await Promise.all(inputs.map(async input=>{const r=await f.request('/api/v1/public/assessment/entry/enroll',input,null);assert.equal(r.status,201);assert.equal(r.body.data.pin,undefined);return r.body.data;}));
 assert.equal(new Set(individuals.map(c=>c.token)).size,10);assert.ok(individuals.every(c=>/^[A-Za-z0-9_-]{43}$/.test(c.token)));
 assert.equal((await f.request('/api/v1/public/assessment/entry/enroll',inputs[0],null)).body.data.token,individuals[0].token);
 const own=(await f.request('/api/v1/public/assessment/open',individuals[0],null)).body.data;assert.equal(own.name,profile.name);assert.equal(own.metadata.participant_name,profile.name);assert.ok(own.consented);
 const q=own.package.questions[0].id;
 for(let i=0;i<10;i++){assert.equal((await f.request('/api/v1/public/assessment/save',{...individuals[i],revision:0,answers:{[q]:i%5+1}},null)).status,200);}
 for(let i=0;i<10;i++){const opened=(await f.request('/api/v1/public/assessment/open',individuals[i],null)).body.data;assert.deepEqual(opened.answers,{[q]:i%5+1});assert.equal(opened.name,inputs[i].profile.name);}
 for(let i=0;i<2;i++){const pkg=own.package,selected=pkg.value_groups.map((g:string[])=>g.slice(0,5)),r=await f.request('/api/v1/public/assessment/submit',{...individuals[i],revision:1,answers:Object.fromEntries(pkg.questions.map((q:{id:string})=>[q.id,i+2])),value_draft:{selected,ranked:selected.flat().slice(0,10)}},null);assert.equal(r.status,200);assert.ok(r.body.data.report);}
 assert.equal((await f.request('/api/v1/public/assessment/open',individuals[2],null)).body.data.submitted,false);
 const reports=await f.db.query<{report:unknown}>('SELECT report FROM assessment_invites WHERE public_entry_id=$1 AND submitted_at IS NOT NULL ORDER BY id',[e.id]);assert.equal(reports.rows.length,2);assert.notDeepEqual(reports.rows[0].report,reports.rows[1].report);
 assert.equal((await f.db.query<{n:number}>('SELECT count(*)::int n FROM candidates')).rows[0].n,before);
 const list=(await f.request('/api/v1/assessment/invites?group='+g)).body.data;assert.equal(list.total,10);assert.ok(list.items.every((x:{candidate_id:string|null})=>x.candidate_id===null));
 const admin=(await f.request('/api/v1/assessment/public-entries')).body.data.items;assert.equal(admin[0].participants,10);assert.equal(admin[0].completed,2);
 const raw=(await f.db.query<{profile_cipher:string;token_hash:string;pin_required:boolean}>('SELECT profile_cipher,token_hash,pin_required FROM assessment_invites WHERE public_entry_id=$1',[e.id])).rows;for(const row of raw){assert.ok(!row.profile_cipher.includes(profile.phone));assert.equal(row.pin_required,false);assert.notEqual(row.token_hash,individuals[0].token);}
 assert.equal((await f.request('/api/v1/public/assessment/open',{token:e.token},null)).status,400);
 assert.equal((await f.request('/api/v1/public/assessment/save',{token:e.token,revision:0,answers:{}},null)).status,400);
 assert.equal(f.modelCalls(),0);
});
test('旧43位共用链接继续登记和生成独立凭据，短入口不放宽个人答卷认证',async t=>{
 const f=await fixture(t),e=await entry(f),legacy=randomBytes(32).toString('base64url');
 await f.db.query('UPDATE assessment_public_entries SET token_hash=$2 WHERE id=$1',[e.id,digest(legacy)]);
 const open=await f.request('/api/v1/public/assessment/entry/open',{token:legacy},null);assert.equal(open.status,200);
 const enrolled=await f.request('/api/v1/public/assessment/entry/enroll',{...enrollment(e),token:legacy},null);assert.equal(enrolled.status,201);assert.match(enrolled.body.data.token,/^[A-Za-z0-9_-]{43}$/);
 assert.equal((await f.request('/api/v1/public/assessment/open',enrolled.body.data,null)).status,200);
 assert.equal((await f.request('/api/v1/public/assessment/open',{token:legacy},null)).status,404);
 assert.equal((await f.request('/api/v1/public/assessment/entry/open',{token:'a'.repeat(21)},null)).status,400);
 assert.equal((await f.request('/api/v1/public/assessment/entry/open',{token:'!'.repeat(22)},null)).status,400);
});
test('资料/同意/版本校验、同设备换人与跨入口隔离，停止登记仍可本人续答',async t=>{
 const f=await fixture(t),e=await entry(f),e2=await entry(f),body=enrollment(e);
 for(const invalid of [{accepted:false},{consent_version:'wrong'},{profile:{...profile,name:''}},{profile:{...profile,birth_date:'2099-01-01'}},{candidate_id:f.candidate}])assert.equal((await f.request('/api/v1/public/assessment/entry/enroll',{...body,...invalid},null)).status,400);
 const race=await Promise.all([f.request('/api/v1/public/assessment/entry/enroll',body,null),f.request('/api/v1/public/assessment/entry/enroll',body,null)]);assert.ok(race.every(r=>r.status===201));assert.deepEqual(race[0].body.data,race[1].body.data);
 const enrolled=race[0];
 assert.equal((await f.request('/api/v1/public/assessment/entry/enroll',{...body,profile:{...profile,name:'另一人'}},null)).status,409);
 assert.equal((await f.request('/api/v1/public/assessment/entry/enroll',{...body,token:e2.token},null)).status,404);
 assert.equal((await f.request('/api/v1/public/assessment/entry/enroll',{...body,participant_key:e.token},null)).status,400);
 const second=(await f.request('/api/v1/public/assessment/entry/enroll',enrollment(e,'【虚构】另一人'),null)).body.data;assert.notEqual(second.token,enrolled.body.data.token);
 assert.equal((await f.request('/api/v1/assessment/public-entries',undefined,'ops')).status,403);assert.equal((await f.request('/api/v1/assessment/public-entries',undefined,null)).status,401);
 assert.equal((await f.request(`/api/v1/assessment/public-entries/${e.id}/revoke`,{})).status,200);
 assert.equal((await f.request('/api/v1/public/assessment/entry/open',{token:e.token},null)).status,404);
 assert.equal((await f.request('/api/v1/public/assessment/entry/enroll',body,null)).status,404);
 assert.equal((await f.request('/api/v1/public/assessment/open',enrolled.body.data,null)).status,200);
});
test('招聘和档案创建的链接同样多人共用；关联后以本人姓名显示且报告不变',async t=>{
 const f=await fixture(t),created=await f.request('/api/v1/assessment/invites',{candidate_id:f.candidate,application_id:f.application,participant_kind:'internal',purpose:'本岗位申请的自我了解与发展沟通',days:7});assert.equal(created.status,201);assert.equal(created.body.data.pin,undefined);
 const token=created.body.data.url.split('#')[1],open=(await f.request('/api/v1/public/assessment/entry/open',{token},null)).body.data;
 const e={token,id:created.body.data.id,consent_version:open.consent_version};
 const participants=[];for(const name of ['【虚构】本人填写姓名','【虚构】另一个人'])participants.push((await f.request('/api/v1/public/assessment/entry/enroll',enrollment(e,name),null)).body.data);
 const own=(await f.request('/api/v1/public/assessment/open',participants[0],null)).body.data,pkg=own.package,selected=pkg.value_groups.map((g:string[])=>g.slice(0,5));
 assert.equal((await f.request('/api/v1/public/assessment/submit',{...participants[0],revision:0,answers:Object.fromEntries(pkg.questions.map((q:{id:string})=>[q.id,3])),value_draft:{selected,ranked:selected.flat().slice(0,10)}},null)).status,200);
 const snapshot=()=>f.db.query('SELECT answers,report,profile_cipher,answer_hash FROM assessment_invites WHERE id=$1',[own.id]),before=(await snapshot()).rows;
 assert.equal((await f.request(`/api/v1/assessment/invites/${own.id}/bind`,{candidate_id:f.candidate,confirm:'bind_assessment'})).status,200);assert.deepEqual((await snapshot()).rows,before);
 const report=(await f.request(`/api/v1/assessment/invites/${own.id}/report`)).body.data;assert.equal(report.name,'【虚构】本人填写姓名');assert.equal(report.metadata.participant_name,report.name);
 const rows=(await f.db.query<{candidate_id:string|null;application_id:string|null}>('SELECT candidate_id,application_id FROM assessment_invites WHERE public_entry_id=$1',[e.id])).rows;assert.ok(rows.every(r=>r.candidate_id===null&&r.application_id===null));
 assert.equal((await f.request('/api/v1/assessment/invites')).body.data.items.filter((r:{candidate_id:string|null})=>r.candidate_id===f.candidate).length,1);
 assert.equal((await f.request(`/api/v1/interviews/assessments/${f.application}`)).body.data.items[0].id,own.id);
});
test('链接与个人凭据保持租户、到期、撤销和频率边界',async t=>{
 const f=await fixture(t);assert.equal((await f.request('/api/v1/assessment/public-entries',{title:'【虚构】',purpose:'仅用于虚构隔离',days:7,project_group_id:randomUUID()})).status,404);
 const e=await entry(f);assert.equal((await f.request('/api/v1/public/assessment/entry/open',{token:randomBytes(32).toString('base64url')},null)).status,404);
 const auth=(await f.request('/api/v1/public/assessment/entry/enroll',enrollment(e),null)).body.data,id=(await f.request('/api/v1/public/assessment/open',auth,null)).body.data.id;
 await f.db.query('UPDATE assessment_invites SET revoked_at=now() WHERE id=$1',[id]);assert.equal((await f.request('/api/v1/public/assessment/open',auth,null)).status,404);
 const foreign=randomUUID(),user=randomUUID();await f.db.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[foreign,'虚构另租户']);await f.db.query("INSERT INTO staff_users(id,tenant_id,username,password_hash,role) VALUES($1,$2,'foreign','unusable','hr')",[user,foreign]);
 const e2=await entry(f);await f.db.query('UPDATE assessment_public_entries SET tenant_id=$2,created_by=$3 WHERE id=$1',[e2.id,foreign,user]);
 assert.equal((await f.request(`/api/v1/assessment/public-entries/${e2.id}/revoke`,{})).status,404);assert.equal((await f.request('/api/v1/assessment/public-entries')).body.data.items.length,1);
 await f.db.query("UPDATE assessment_public_entries SET expires_at=now()-interval '1 second' WHERE id=$1",[e.id]);assert.equal((await f.request('/api/v1/public/assessment/entry/open',{token:e.token},null)).status,404);
 let limited=false;for(let i=0;i<65;i++){if((await f.request('/api/v1/public/assessment/entry/open',{token:e2.token},null)).status===429){limited=true;break;}}assert.ok(limited);
});
test('旧公共入口的个人链接安全转登记；缓存的旧凭据可续答，URL单独不能读取旧答案',async t=>{
 const f=await fixture(t),e=await entry(f),token=randomBytes(32).toString('base64url'),hash=digest(token),pin=String(100000+parseInt(createHmac('sha256',f.key).update(`entry:${e.id}:${token}`).digest('hex').slice(0,10),16)%900000),id=randomUUID();
 const parent=(await f.db.query<{package:unknown;package_hash:string;expires_at:string}>('SELECT package,package_hash,expires_at FROM assessment_public_entries WHERE id=$1',[e.id])).rows[0];
 await f.db.query("INSERT INTO assessment_invites(id,tenant_id,candidate_id,token_hash,pin_hash,package,package_hash,purpose,expires_at,created_by,participant_kind,profile_required,independent_retention_until,public_entry_id,profile_cipher,consent_at,answers) VALUES($1,$2,NULL,$3,$4,$5,$6,'【虚构】旧公共参与者',$7,$8,'external',true,now()+interval '365 days',$9,$10,now(),$11)",[id,f.tenant,hash,digest(`${hash}:${pin}`),JSON.stringify(parent.package),parent.package_hash,parent.expires_at,f.sessions.talent_lead.user,e.id,encryptContact(JSON.stringify(profile),f.key,f.tenant),JSON.stringify({old_answer:4})]);
 const opened=await f.request('/api/v1/public/assessment/entry/open',{token},null);assert.equal(opened.status,200);assert.doesNotMatch(JSON.stringify(opened.body),/old_answer|participant_name/);
 assert.equal((await f.request('/api/v1/public/assessment/open',{token},null)).status,404);
 assert.deepEqual((await f.request('/api/v1/public/assessment/open',{token,pin},null)).body.data.answers,{old_answer:4});
 const retry=await f.request('/api/v1/public/assessment/entry/enroll',{token:e.token,participant_key:token,accepted:true,consent_version:e.consent_version,profile},null);assert.equal(retry.status,201);assert.deepEqual(retry.body.data,{token,pin});
 const another=await f.request('/api/v1/public/assessment/entry/enroll',{...enrollment(e,'【虚构】新的参与者'),token},null);assert.equal(another.status,201);assert.equal(another.body.data.pin,undefined);assert.deepEqual((await f.request('/api/v1/public/assessment/open',another.body.data,null)).body.data.answers,{});
});
test('015升级旧单人链接为共用登记入口，保留历史混合答卷与原始绑定，不向新参与者泄漏',async t=>{
 const restore=agentEnvironment(),db=new PGlite();await db.waitReady;t.after(async()=>{await db.close();restore();});
 const files=['001_foundation.sql','002_assessments.sql','003_ai.sql','004_recruiting.sql','005_interviews.sql','006_reference_h5.sql','007_iam_identities.sql','008_assessment_ui_progress.sql','009_assessment_profile_timing.sql','010_agent_tasks.sql','011_project_groups_independent_assessments.sql','012_public_assessment_entries.sql','013_resume_library.sql','014_resume_screen_rounds.sql'];
 for(const file of files)await db.exec(await readFile(new URL('../infra/migrations/'+file,import.meta.url),'utf8'));
 const tenant=randomUUID(),user=randomUUID(),candidate=randomUUID(),id=randomUUID(),token=randomBytes(32).toString('base64url'),key=randomBytes(32),pkg=JSON.stringify(qilunStandardInvitePackage(loadAssessmentRuntime().standard!));
 await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[tenant,'【虚构】升级']);await db.query("INSERT INTO staff_users(id,tenant_id,username,password_hash,role) VALUES($1,$2,'upgrade','unusable','talent_lead')",[user,tenant]);
 await db.query("INSERT INTO candidates(id,tenant_id,name,purpose,processing_basis,retention_until,created_by) VALUES($1,$2,'【虚构】原档案','talent_pool','仅升级隔离测试',now()+interval '365 days',$3)",[candidate,tenant,user]);
 await db.query("INSERT INTO assessment_invites(id,tenant_id,candidate_id,token_hash,pin_hash,package,package_hash,purpose,expires_at,created_by,answers,submitted_at,report,profile_cipher) VALUES($1,$2,$3,$4,$5,$6,$7,'旧链接混用样例',now()+interval '7 days',$8,$9,now(),$10,$11)",[id,tenant,candidate,digest(token),digest('old-pin'),pkg,digest(pkg),user,JSON.stringify({mixed:4}),JSON.stringify({historical:true}),encryptContact(JSON.stringify(profile),key,tenant)]);
 const before=(await db.query('SELECT * FROM assessment_invites WHERE id=$1',[id])).rows[0];
 await db.exec(await readFile(new URL('../infra/migrations/015_shared_assessment_links.sql',import.meta.url),'utf8'));
 const {pin_required,...after}=(await db.query<Record<string,unknown>>('SELECT * FROM assessment_invites WHERE id=$1',[id])).rows[0];assert.deepEqual(after,before);assert.equal(pin_required,true);
 const app=createApp(db,{origin:'http://127.0.0.1:3100',contactKey:key}),server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));t.after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await app.locals.agentRuntime.wake.close();});
 const addr=server.address();assert.ok(addr&&typeof addr!=='string');const call=async(action:string,body:object)=>{const r=await fetch(`http://127.0.0.1:${addr.port}/api/v1/public/assessment/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://127.0.0.1:3100'},body:JSON.stringify(body)});return {status:r.status,body:await r.json() as any};};
 const entry=await call('entry/open',{token});assert.equal(entry.status,200);assert.doesNotMatch(JSON.stringify(entry.body),/mixed|原档案|participant_name|historical/);
 assert.equal((await call('open',{token,pin:'123456'})).status,404);
 const enrolled=await call('entry/enroll',{token,participant_key:randomBytes(32).toString('base64url'),accepted:true,consent_version:entry.body.data.consent_version,profile:{...profile,name:'【虚构】新参与者'}});assert.equal(enrolled.status,201);
 const opened=(await call('open',enrolled.body.data)).body.data;assert.deepEqual(opened.answers,{});assert.equal(opened.report,null);assert.equal(opened.name,'【虚构】新参与者');assert.notEqual(opened.id,id);
 const {pin_required:unused,...untouched}=(await db.query<Record<string,unknown>>('SELECT * FROM assessment_invites WHERE id=$1',[id])).rows[0];assert.deepEqual(untouched,before);
});
