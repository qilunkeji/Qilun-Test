import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {agentEnvironment,agentFixture} from './helpers/agent-fixture.ts';
import {createParticipant} from './helpers/assessment-participant.ts';
const profile={name:'【虚构】外部本人',phone:'13800000000',birth_date:'1990-06-15'};
async function fixture(t:{after:(fn:()=>Promise<void>)=>void}){const restore=agentEnvironment();const f=await agentFixture();t.after(async()=>{await f.close();restore();});return f;}
test('项目组创建、名称去重、档案筛选与乐观锁；保留跨项目搜索',async t=>{
 const f=await fixture(t),create=await f.request('/api/v1/project-groups',{name:'【虚构】项目甲'});assert.equal(create.status,201);const group=create.body.data.id;
 assert.equal((await f.request('/api/v1/project-groups',{name:'【虚构】项目甲'})).status,409);
 assert.equal((await f.request('/api/v1/project-groups',undefined,'ops')).status,403);
 const assign={project_group_id:group,previous_group_id:null};assert.equal((await f.request(`/api/v1/talents/${f.candidate}/project`,assign)).status,200);
 assert.equal((await f.request(`/api/v1/talents/${f.candidate}/project`,assign)).status,409);
 const filtered=await f.request(`/api/v1/talents?group=${group}&q=${encodeURIComponent('参与者')}`);assert.equal(filtered.status,200);assert.equal(filtered.body.data.total,1);
 assert.equal((await f.request('/api/v1/talents?group=ungrouped')).body.data.total,0);assert.equal((await f.request('/api/v1/talents?q='+encodeURIComponent('参与者'))).body.data.total,1);
 assert.equal((await f.request(`/api/v1/talents/${f.candidate}/project`,{project_group_id:randomUUID(),previous_group_id:group})).status,404);
});
test('任何创建方式均生成免密码共用入口，登记才创建独立答卷，不预先绑定人员',async t=>{
 const f=await fixture(t),before=Number((await f.db.query<{n:number}>('SELECT count(*)::int n FROM candidates')).rows[0].n);
 for(const participant_kind of ['internal','external']){
  const c=await createParticipant(f,{participant_kind,...(participant_kind==='internal'?{candidate_id:f.candidate}:{}),purpose:'【虚构】本人发展测评',days:7});
  const opened=(await f.request('/api/v1/public/assessment/open',c.auth,null)).body.data;
  assert.equal(opened.name,profile.name);assert.equal(opened.metadata.participant_name,profile.name);
  const stored=(await f.db.query<{candidate_id:string|null;profile_cipher:string}>('SELECT candidate_id,profile_cipher FROM assessment_invites WHERE id=$1',[c.id])).rows[0];assert.equal(stored.candidate_id,null);assert.ok(!stored.profile_cipher.includes(profile.phone));
 }
 assert.equal(Number((await f.db.query<{n:number}>('SELECT count(*)::int n FROM candidates')).rows[0].n),before);
 assert.equal((await f.request('/api/v1/assessment/invites',{purpose:'【虚构】无需选择人员',days:1})).status,201);
 assert.equal((await f.request('/api/v1/assessment/invites',{participant_kind:'external',application_id:f.application,purpose:'【虚构】禁止错绑',days:1})).status,400);
});
test('独立测评完整提交、续答及后补绑定；报告、计分、资料不被改写',async t=>{
 const f=await fixture(t),g=(await f.request('/api/v1/project-groups',{name:'【虚构】外部项目'})).body.data.id;
 const created=await createParticipant(f,{participant_kind:'external',project_group_id:g,purpose:'【虚构】独立参与验收',days:7}),id=created.id,auth=created.auth;
 const pkg=(await f.request('/api/v1/public/assessment/open',auth,null)).body.data.package;assert.equal((await f.request('/api/v1/public/assessment/consent',{...auth,accepted:true,consent_version:pkg.consent_version,profile},null)).status,200);
 const partial={[pkg.questions[0].id]:3},ui_progress={phase:'questions',page:2,group:0};assert.equal((await f.request('/api/v1/public/assessment/save',{...auth,revision:0,answers:partial,ui_progress,active_seconds:1},null)).status,200);
 const resumed=(await f.request('/api/v1/public/assessment/open',auth,null)).body.data;assert.deepEqual(resumed.answers,partial);assert.deepEqual(resumed.ui_progress,ui_progress);assert.equal(resumed.metadata.participant_name,profile.name);
 const selected=pkg.value_groups.map((g:string[])=>g.slice(0,5)),answers=Object.fromEntries(pkg.questions.map((q:{id:string})=>[q.id,3]));assert.equal((await f.request('/api/v1/public/assessment/submit',{...auth,revision:1,answers,value_draft:{selected,ranked:selected.flat().slice(0,10)},active_seconds:2},null)).status,200);
 const snapshot=async()=>JSON.stringify((await f.db.query('SELECT answers,report,answer_hash,profile_cipher,active_seconds,submitted_at,package,package_hash FROM assessment_invites WHERE id=$1',[id])).rows[0]),before=await snapshot();
 const r=await f.request(`/api/v1/assessment/invites/${id}/bind`,{candidate_id:f.candidate,confirm:'bind_assessment'});assert.equal(r.status,200);assert.equal(await snapshot(),before);
 assert.equal((await f.request(`/api/v1/assessment/invites/${id}/bind`,{candidate_id:f.candidate,confirm:'bind_assessment'})).status,409);
 assert.equal((await f.request(`/api/v1/assessment/invites/${id}/report`)).body.data.metadata.participant_name,profile.name);
 const list=(await f.request('/api/v1/assessment/invites?kind=external&group='+g+'&q='+encodeURIComponent(profile.name))).body.data;assert.equal(list.items[0].candidate_id,f.candidate);assert.equal(list.items[0].name,profile.name);
 assert.equal((await f.request(`/api/v1/talents/${f.candidate}`)).body.data.assessments[0].id,id);
 assert.equal((await f.request(`/api/v1/interviews/assessments/${f.application}`)).body.data.items[0].id,id);
 assert.equal((await f.request('/api/v1/interviews',{application_id:f.application,assessment_id:id,rubric:[{name:'执行',requirement:'完整交付虚构目录清单',weight:100}],question_count:10})).status,200);
 assert.equal((await f.request(`/api/v1/assessment/invites/${id}/project`,{project_group_id:null,previous_group_id:g})).status,200);assert.equal(await snapshot(),before);
 assert.equal((await f.request('/api/v1/assessment/invites?group=ungrouped')).body.data.items.length,1);
 await assert.rejects(f.db.query('UPDATE assessment_invites SET candidate_id=$2 WHERE id=$1',[id,f.candidate]),/IMMUTABLE_ASSESSMENT_BINDING/);
 const audit=JSON.stringify((await f.db.query('SELECT * FROM audit_events')).rows);assert.ok(!audit.includes(profile.phone));assert.ok(!audit.includes(profile.name));
});
test('后补绑定拒绝跨租户、越权、错绑与并发重复绑定，允许未完成前绑定',async t=>{
 const f=await fixture(t);const created=await createParticipant(f,{participant_kind:'external',purpose:'【虚构】绑定权限验收',days:1}),id=created.id,body={candidate_id:f.candidate,confirm:'bind_assessment'};
 assert.equal((await f.request(`/api/v1/assessment/invites/${id}/bind`,body,'ops')).status,403);
 assert.equal((await f.request(`/api/v1/assessment/invites/${id}/bind`,{...body,candidate_id:randomUUID()})).status,404);
 assert.equal((await f.request(`/api/v1/assessment/invites/${id}/bind`,{...body,tenant_id:randomUUID()})).status,400);
 const race=await Promise.all([f.request(`/api/v1/assessment/invites/${id}/bind`,body),f.request(`/api/v1/assessment/invites/${id}/bind`,body)]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
 const auth=created.auth;assert.equal((await f.request('/api/v1/public/assessment/open',auth,null)).status,200);
 await f.db.query("UPDATE candidates SET retention_until=now()-interval '1 day' WHERE id=$1",[f.candidate]);assert.equal((await f.request('/api/v1/public/assessment/open',auth,null)).status,404);
});
test('外部记录不受100条总量限制；独立保留期到期失效',async t=>{
 const f=await fixture(t),created=await createParticipant(f,{participant_kind:'external',purpose:'【虚构】外部分页验收',days:7});
 const row=(await f.db.query<Record<string,unknown>>('SELECT * FROM assessment_invites WHERE id=$1',[created.id])).rows[0];
 for(let i=0;i<104;i++)await f.db.query('INSERT INTO assessment_invites(id,tenant_id,candidate_id,token_hash,pin_hash,package,package_hash,purpose,expires_at,created_by,participant_kind,independent_retention_until) VALUES($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[randomUUID(),f.tenant,'fixture-hash-'+i,row.pin_hash,JSON.stringify(row.package),row.package_hash,row.purpose,row.expires_at,row.created_by,'external',row.independent_retention_until]);
 const first=(await f.request('/api/v1/assessment/invites?kind=external')).body.data,second=(await f.request('/api/v1/assessment/invites?kind=external&page=2')).body.data;assert.equal(first.total,105);assert.equal(first.items.length,100);assert.equal(second.items.length,5);
 assert.equal((await f.request('/api/v1/assessment/invites?page=0')).status,400);
 await f.db.query("UPDATE assessment_invites SET independent_retention_until=now()-interval '1 day' WHERE id=$1",[created.id]);assert.equal((await f.request('/api/v1/public/assessment/open',created.auth,null)).status,404);
 assert.equal((await f.request(`/api/v1/assessment/invites/${created.id}/bind`,{candidate_id:f.candidate,confirm:'bind_assessment'})).status,404);
});
test('真实跨租户的项目、档案与邀请引用均不能绑定或归类',async t=>{
 const f=await fixture(t),tenant=randomUUID(),user=randomUUID(),candidate=randomUUID(),group=randomUUID();
 await f.db.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[tenant,'【虚构】另一隔离租户']);
 await f.db.query("INSERT INTO staff_users(id,tenant_id,username,password_hash,role) VALUES($1,$2,'other','unusable','talent_lead')",[user,tenant]);
 await f.db.query("INSERT INTO candidates(id,tenant_id,name,purpose,processing_basis,retention_until,created_by) VALUES($1,$2,'【虚构】他人','talent_pool','隔离测试授权',now()+interval '1 day',$3)",[candidate,tenant,user]);
 await f.db.query("INSERT INTO talent_project_groups(id,tenant_id,name,created_by) VALUES($1,$2,'【虚构】另一项目',$3)",[group,tenant,user]);
 assert.equal((await f.request(`/api/v1/talents/${f.candidate}/project`,{project_group_id:group,previous_group_id:null})).status,404);
 assert.equal((await f.request('/api/v1/assessment/invites',{participant_kind:'external',project_group_id:group,purpose:'【虚构】跨范围测试',days:1})).status,404);
 const id=(await createParticipant(f,{participant_kind:'external',purpose:'【虚构】跨范围绑定',days:1})).id;
 assert.equal((await f.request(`/api/v1/assessment/invites/${id}/bind`,{candidate_id:candidate,confirm:'bind_assessment'})).status,404);
 assert.equal((await f.request('/api/v1/project-groups')).body.data.items.length,0);
});
