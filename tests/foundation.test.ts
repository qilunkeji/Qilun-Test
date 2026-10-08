import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Server} from 'node:http';
import {request as httpRequest} from 'node:http';
import {openDatabase} from '../apps/api/db.ts';
import {createApp} from '../apps/api/app.ts';
import {hashPassword,digest} from '../packages/security/index.ts';
import type {Database} from '../apps/api/db.ts';
import {selfReviewPackage,scoreSelfReview} from '../packages/assessment-engine/self-review.ts';
import {replicaCatalog,replicaVersion} from '../packages/assessment-engine/strength-v3.ts';
import {ghSyntheticInput} from '../packages/assessment-engine/gh-server-evidence.ts';
import {ghReplayExample,ghReplayVersion,ghReplayCatalog} from '../packages/assessment-engine/gh-derived.ts';
import {ghInferenceVersion} from '../packages/assessment-engine/gh-inference.ts';
import {ghInvitePackage} from '../packages/assessment-engine/gh-invite.ts';
import type {GhInvitePackage} from '../packages/assessment-engine/gh-invite.ts';
import {qilunStandardVersion} from '../packages/assessment-engine/qilun-standard.ts';

let db:Database,server:Server,base:string,previewDirectory:string;
const origin='http://127.0.0.1:3100';
const tenants=[randomUUID(),randomUUID()], users=Array.from({length:6},()=>randomUUID());
const password='Fictional-test-only-9382!';
let mockAIInvalid=false,mockCalls=0;
let interviewFixture:unknown;
const mockAI:typeof fetch=async(_url,options)=>{
 mockCalls++;const body=JSON.parse(String(options?.body)),evidence=JSON.parse(body.messages[1].content);
 return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(interviewFixture??{findings:[{kind:'observation',text:'测试替身：材料包含任务说明',citations:[{id:'E1',quote:mockAIInvalid?'不存在的伪造材料':evidence[0].text.slice(0,6)}]}],unknowns:['测试替身不是供应商真实输出']})}}],usage:{prompt_tokens:100,completion_tokens:50}}),{status:200});
};
type Session={cookie:string;csrf:string};
let a:Session,b:Session,ops:Session,interviewer:Session,hr:Session,otherLead:Session;
type Result={status:number;data:any;error:any;cookie:string|null}; // HTTP boundary intentionally inspects hostile and partial JSON.
async function request(path:string,body?:unknown,s?:Session,headers:Record<string,string>={}):Promise<Result>{
 // New invitations require explicit participant details. Legacy positive-flow
 // fixtures use this fictional participant; missing-profile rejection is
 // tested without this helper in project-assessments.test.ts.
 if(path==='/public/assessment/consent'&&body&&typeof body==='object'&&!('profile' in body))body={...body,profile:{name:'【虚构】本人确认',phone:'13800000000',birth_date:'1990-06-15'}};
 const r=await fetch(`${base}/api/v1${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','Origin':origin,...(s?{Cookie:s.cookie,'X-CSRF-Token':s.csrf}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const json=await r.json() as {data:unknown;error:unknown};return {status:r.status,...json,cookie:r.headers.get('set-cookie')};
}
async function login(tenant:string,username:string){const r=await request('/auth/login',{tenant_id:tenant,username,password});assert.equal(r.status,200);assert.match(r.cookie!,/HttpOnly/i);assert.match(r.cookie!,/SameSite=Strict/i);return {cookie:r.cookie!.split(';')[0],csrf:r.data.csrf_token};}
// Historical fixture only: new production invitations must use the standard
// product. Seed old snapshots directly in this isolated test database.
async function seedHistorical24(candidateId:string,purpose:string,days:number,applicationId?:string){
 const id=randomUUID(),token=randomBytes(32).toString('hex'),pin='654321',hash=digest(token),pkg=JSON.stringify(selfReviewPackage);
 await db.query('INSERT INTO assessment_invites(id,tenant_id,candidate_id,application_id,token_hash,pin_hash,package,package_hash,purpose,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,tenants[0],candidateId,applicationId??null,hash,digest(`${hash}:${pin}`),pkg,digest(pkg),purpose,new Date(Date.now()+days*86400000).toISOString(),users[0]]);
 return {status:201,data:{id,url:`${origin}/h5/#${token}`,pin}};
}
before(async()=>{
 db=await openDatabase();
 const hash=await hashPassword(password);
 for(let i=0;i<2;i++)await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[tenants[i],`虚构测试租户${i}`]);
 for(const [n,tenant,role] of [[0,0,'talent_lead'],[1,1,'hr'],[2,0,'ops'],[3,0,'interviewer'],[4,0,'hr'],[5,1,'talent_lead']] as const)await db.query('INSERT INTO staff_users(id,tenant_id,username,password_hash,role) VALUES($1,$2,$3,$4,$5)',[users[n],tenants[tenant],`user${n}`,hash,role]);
 previewDirectory=await mkdtemp(join(tmpdir(),'qilun-report-preview-'));
 await writeFile(join(previewDirectory,'data.svg'),'<svg xmlns="http://www.w3.org/2000/svg"><text>Fictional fixture</text></svg>');
 const app=createApp(db,{origin,contactKey:randomBytes(32),aiTransport:mockAI,localReportPreview:{directory:previewDirectory,tenantId:tenants[0]}});
 server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const address=server.address();assert.ok(address&&typeof address!=='string');base=`http://127.0.0.1:${address.port}`;
 a=await login(tenants[0],'user0');b=await login(tenants[1],'user1');ops=await login(tenants[0],'user2');interviewer=await login(tenants[0],'user3');
 hr=await login(tenants[0],'user4');otherLead=await login(tenants[1],'user5');
});
after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await db.close();await rm(previewDirectory,{recursive:true,force:true});});
const jobBody={title:'虚构项目工程师',department:'测试研发部',owner:'虚构负责人',location:'测试地点',tasks:'实现可验证项目',criteria:'展示作品、测试记录和本人职责',public_jd:'虚构测试岗位，无对外发布',status:'open',change_reason:'测试创建'};
const importBody={name:'虚构候选人甲',contact:'fictional@example.invalid',purpose:'recruitment',processing_basis:'虚构测试数据，不涉及真人',retention_until:'2099-12-31T00:00:00.000Z',channel:'manual-test',external_id:'fictional-001',authorization_ref:'虚构验收授权记录',filename:'fictional.txt',text_content:'虚构简历第一行\n我制作了任务页面，需要核验作品。\nMBTI：自述不参与筛选。',completeness:'full'};
let jobA:any,jobB:any,talent:any,application:any;
test('277题H5邀请保存续答、价值观排序、版本同意、幂等提交及授权报告',async(t)=>{
 const person=await request('/assessment/people',{name:'【虚构验收】277题',processing_basis:'仅限独立测试库的虚构验收数据'},a);
 t.after(async()=>{await db.query('DELETE FROM assessment_invites WHERE candidate_id=$1',[person.data.id]);await db.query('DELETE FROM candidates WHERE id=$1',[person.data.id]);});
 const created=await request('/assessment/invites',{candidate_id:person.data.id,purpose:'虚构测评发展参考验收',days:7,package_kind:'gh_reference_277'},a);assert.equal(created.status,201);
 const auth={token:created.data.url.split('#')[1],pin:created.data.pin};
 const opened=await request('/public/assessment/open',auth),pkg=opened.data.package as GhInvitePackage;assert.equal(pkg.questions.length,277);assert.equal(pkg.estimate_abilities,true);assert.equal(pkg.version,qilunStandardVersion);
 assert.equal((await request('/public/assessment/consent',{...auth,accepted:true,consent_version:selfReviewPackage.consent_version})).status,400);
 assert.equal((await request('/public/assessment/consent',{...auth,accepted:true,consent_version:pkg.consent_version})).status,200);
 assert.equal((await request('/public/assessment/consent',{...auth,accepted:true,consent_version:pkg.consent_version,profile:{phone:'bad',birth_date:'2025-02-31'}})).status,400);
 const profile={name:'【虚构】参与者本人',phone:'13800000000',birth_date:'1990-06-15'};
 const consent=await request('/public/assessment/consent',{...auth,accepted:true,consent_version:pkg.consent_version,profile});assert.equal(consent.status,200);assert.equal(consent.data.metadata.phone,'138****0000');assert.equal(consent.data.metadata.birth_date,profile.birth_date);assert.equal(consent.data.metadata.consistency.label,'未评定');
 const stored=(await db.query<{profile_cipher:string}>('SELECT profile_cipher FROM assessment_invites WHERE id=$1',[created.data.id])).rows[0];assert.ok(stored.profile_cipher);assert.ok(!stored.profile_cipher.includes(profile.phone));
 await db.query("UPDATE assessment_invites SET timing_updated_at=now()-interval '30 seconds' WHERE id=$1",[created.data.id]);
 const selected=pkg.value_groups.map(g=>g.slice(0,5)),value_draft={selected,ranked:selected.flat().slice(0,10)},answers=Object.fromEntries(pkg.questions.map(q=>[q.id,3]));
 const partial={[pkg.questions[0].id]:1},ui_progress={phase:'groups',page:20,group:2};
 for(const progress of [{...ui_progress,page:93},{...ui_progress,phase:'rules'},{...ui_progress,group:4},{...ui_progress,role:'talent_lead'}])assert.equal((await request('/public/assessment/save',{...auth,revision:0,answers:partial,value_draft,ui_progress:progress})).status,400);
 const saved=await request('/public/assessment/save',{...auth,revision:0,answers:partial,value_draft,ui_progress,active_seconds:30});assert.equal(saved.data.revision,1);assert.equal(saved.data.metadata.active_seconds,30);
 const resumed=await request('/public/assessment/open',auth);assert.deepEqual(resumed.data.answers,partial);assert.deepEqual(resumed.data.value_draft,value_draft);assert.deepEqual(resumed.data.ui_progress,ui_progress);
 assert.equal((await request('/public/assessment/save',{...auth,revision:0,answers,value_draft})).status,409);
 const invalid={selected,ranked:Array(10).fill(selected[0][0])};assert.equal((await request('/public/assessment/submit',{...auth,revision:1,answers,value_draft:invalid})).status,400);
 const submission={...auth,revision:1,answers,value_draft},done=await request('/public/assessment/submit',submission);assert.equal(done.status,200);assert.equal(done.data.report.kind,'qilun_277_invite_reference');assert.equal(done.data.report.result.roles.length,8);assert.equal(done.data.report.result.report_text.motivation.lines.length,5);assert.equal(done.data.report.recruitment_decision_allowed,false);
 assert.ok('rule_profile' in pkg);assert.equal(done.data.report.result.abilities.length,28);assert.equal(done.data.report.version,qilunStandardVersion);assert.equal(done.data.report.result.product.runtime_training,false);assert.equal(done.data.report.result.product.rules_fingerprint,pkg.rule_profile.fingerprint);
 assert.doesNotMatch(JSON.stringify(done.data.report),/coefficients|"support"|per_item_holdout|mean_absolute_error|历史|AgType8Map|99%/);
 assert.deepEqual((await request('/public/assessment/submit',{...submission,ui_progress:{phase:'rank',page:92,group:3}})).data,done.data); // cursor never changes the scoring hash
 assert.equal((await request('/public/assessment/submit',{...submission,value_draft:{selected,ranked:[...value_draft.ranked].reverse()}})).status,409);
 const publicReport=(await request('/public/assessment/open',auth)).data.report;assert.deepEqual(publicReport,done.data.report);
 assert.equal((await request(`/assessment/invites/${created.data.id}/report`,undefined,b)).status,404);assert.equal((await request(`/assessment/invites/${created.data.id}/report`,undefined,ops)).status,403);assert.equal((await request(`/assessment/invites/${created.data.id}/report`,undefined,a)).data.report.kind,'qilun_277_invite_reference');
 await assert.rejects(db.query('UPDATE assessment_invites SET value_draft=$2 WHERE id=$1',[created.data.id,JSON.stringify(invalid)]),/IMMUTABLE_SUBMISSION/);
 assert.equal((await request('/public/assessment/consent',{...auth,accepted:true,consent_version:pkg.consent_version,profile})).status,409);
 await assert.rejects(db.query('UPDATE assessment_invites SET active_seconds=1 WHERE id=$1',[created.data.id]),/IMMUTABLE_SUBMISSION/);
 await assert.rejects(db.query('UPDATE assessment_invites SET ui_progress=$2 WHERE id=$1',[created.data.id,JSON.stringify({phase:'questions',page:0,group:0})]),/IMMUTABLE_SUBMISSION/);
 assert.equal((await request(`/assessment/invites/${created.data.id}/revoke`,{},a)).status,200);assert.equal((await request('/public/assessment/open',auth)).status,404);
});
test('HTTPS部署适配域名、Secure Cookie和可信单层回环网关',async()=>{
 const prod=createApp(db,{origin:'https://rc.iqilun.cn',h5Origin:'https://rc.iqilun.cn',production:true,contactKey:randomBytes(32)}),s=prod.listen(0,'127.0.0.1');await new Promise<void>(r=>s.once('listening',r));
 try{const addr=s.address();assert.ok(addr&&typeof addr!=='string');const url=`http://127.0.0.1:${addr.port}/api/v1`;
 const headers={Host:'rc.iqilun.cn','X-Forwarded-Proto':'https','X-Forwarded-For':'198.51.100.8',Origin:'https://rc.iqilun.cn','Content-Type':'application/json'};
 const wire=(path:string,h:Record<string,string>,body?:object)=>new Promise<{status:number;headers:import('node:http').IncomingHttpHeaders}>((resolve,reject)=>{const req=httpRequest(url+path,{method:body?'POST':'GET',headers:h},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode!,headers:res.headers}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});
 assert.equal((await wire('/health',headers)).status,200);assert.equal((await wire('/health',{...headers,Host:'evil.invalid'})).status,421);assert.equal((await wire('/health',{...headers,'X-Forwarded-Proto':'http'})).status,400);
 const login=await wire('/auth/login',headers,{tenant_id:tenants[0],username:'user0',password});assert.equal(login.status,200);assert.match(String(login.headers['set-cookie']),/Secure/);assert.match(String(login.headers['strict-transport-security']),/31536000/);
 }finally{await new Promise<void>(r=>s.close(()=>r()));}
});
test('未登录拒绝；CSRF 与来源校验在服务端执行',async()=>{
 assert.equal((await request('/jobs')).status,401);
 assert.equal((await request('/jobs',jobBody,a,{'X-CSRF-Token':'wrong'})).status,403);
 assert.equal((await request('/jobs',jobBody,a,{Origin:'https://evil.invalid'})).status,403);
});
test('测评后台19个接口只允许人才负责人，HR/运维/面试成员不能靠直连或注入角色绕过',async()=>{
 const gets=['rules','replication','gh-evidence','gh-replay','gh-inference','product-rules','layout/source/data.svg'];
 const posts=['gh-inference/score','gh-replay/score','gh-replay/final-match','gh-replay/position-model','gh-replay/potential-groups','gh-evidence/score','replication/score','rules/experiment','rules/validate','rules/derive','rules/publish','rules/match'];
 for(const endpoint of [...gets,...posts]){
  const body=posts.includes(endpoint)?{role:'talent_lead',tenant_id:tenants[0]}:undefined;
  assert.equal((await request('/assessment/'+endpoint,body)).status,401,endpoint);
  for(const member of [hr,b,ops,interviewer]){
   const r=await request('/assessment/'+endpoint,body,member);
   assert.equal(r.status,403,endpoint);assert.equal(r.error.code,'FORBIDDEN_SCOPE');
   assert.equal(r.data,undefined);assert.equal(r.error.missing,undefined);
  }
 }
 for(const endpoint of gets.slice(0,-1))assert.equal((await request('/assessment/'+endpoint,undefined,a)).status,200,endpoint);
 for(const member of [hr,b,ops,interviewer]){
  const r=await request('/readiness',undefined,member);assert.equal(r.status,200);
  assert.ok(!r.data.features.some((feature:any)=>feature.status==='blocked_missing_rules'));
  assert.ok(r.data.features.some((feature:any)=>feature.name==='齐论测评与手机 H5'));
 }
});
test('新邀请默认统一完整版，旧checkbox的true/false/省略都不能关闭28项能力，公开参数不可覆盖规则',async(t)=>{
 const person=await request('/assessment/people',{name:'【虚构验收】固定口径',processing_basis:'只限隔离内存测试库'},a),ids:string[]=[];
 t.after(async()=>{for(const id of ids)await db.query('DELETE FROM assessment_invites WHERE id=$1',[id]);await db.query('DELETE FROM candidates WHERE id=$1',[person.data.id]);});
 const reports=[];
 for(const estimate of [undefined,false,true]){
  const body={candidate_id:person.data.id,purpose:'固定完整版重复计算验收',days:1,...(estimate===undefined?{}:{estimate_abilities:estimate})};
  const created=await request('/assessment/invites',body,a);assert.equal(created.status,201);ids.push(created.data.id);
  const auth={token:created.data.url.split('#')[1],pin:created.data.pin},pkg=(await request('/public/assessment/open',auth)).data.package as GhInvitePackage;
  assert.equal(pkg.version,qilunStandardVersion);assert.equal(pkg.estimate_abilities,true);assert.equal((await request('/public/assessment/consent',{...auth,accepted:true,consent_version:pkg.consent_version})).status,200);
  const selected=pkg.value_groups.map(g=>g.slice(0,5));
  const submitted=await request('/public/assessment/submit',{...auth,revision:0,answers:Object.fromEntries(pkg.questions.map(q=>[q.id,3])),value_draft:{selected,ranked:selected.flat().slice(0,10)}});assert.equal(submitted.status,200);assert.equal(submitted.data.report.result.abilities.length,28);reports.push(submitted.data.report);
 }
 assert.deepEqual(reports[0],reports[1]);assert.deepEqual(reports[1],reports[2]);
 for(const extra of [{model_hash:'0'.repeat(64)},{rule_profile:{}},{version:'old'},{rules_fingerprint:'0'.repeat(64)}])assert.equal((await request('/assessment/invites',{candidate_id:person.data.id,purpose:'恶意参数校验测试',days:1,...extra},a)).status,400);
 assert.equal((await request('/assessment/invites',{candidate_id:person.data.id,purpose:'不能创建另一种口径',days:1,package_kind:'self_review_24'},a)).error.code,'STANDARD_ASSESSMENT_REQUIRED');
 const book=await request('/assessment/product-rules',undefined,a);assert.equal(book.status,200);assert.equal(book.data.available,true);assert.equal(book.data.rulebook.steps.length,6);assert.equal(book.data.validation_summary.holdout.samples,508);assert.doesNotMatch(JSON.stringify(book.data),/"support"|coefficients|private_id/);
});
test('已发旧277留白邀请保留原同意版本与计分，不自动升级或改写历史报告',async(t)=>{
 const person=await request('/assessment/people',{name:'【虚构验收】旧版兼容',processing_basis:'只限隔离内存测试库'},a),id=randomUUID(),token=randomBytes(32).toString('hex'),pin='567890',hash=digest(token),pkg=ghInvitePackage(),snapshot=JSON.stringify(pkg);
 t.after(async()=>{await db.query('DELETE FROM assessment_invites WHERE id=$1',[id]);await db.query('DELETE FROM candidates WHERE id=$1',[person.data.id]);});
 await db.query('INSERT INTO assessment_invites(id,tenant_id,candidate_id,token_hash,pin_hash,package,package_hash,purpose,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval \'1 day\',$9)',[id,tenants[0],person.data.id,hash,digest(`${hash}:${pin}`),snapshot,digest(snapshot),'历史兼容性测试',users[0]]);
 const auth={token,pin};assert.equal((await request('/public/assessment/open',auth)).data.package.version,pkg.version);
 assert.equal((await request('/public/assessment/consent',{...auth,accepted:true,consent_version:'qilun-internal-assessment-consent/1.0.0'})).status,400);
 assert.equal((await request('/public/assessment/consent',{...auth,accepted:true,consent_version:pkg.consent_version})).status,200);
 const selected=pkg.value_groups.map(g=>g.slice(0,5)),done=await request('/public/assessment/submit',{...auth,revision:0,answers:Object.fromEntries(pkg.questions.map(q=>[q.id,3])),value_draft:{selected,ranked:selected.flat().slice(0,10)}});
 assert.equal(done.status,200);assert.equal(done.data.report.version,pkg.version);assert.equal('abilities' in done.data.report.result,false);assert.equal('product' in done.data.report.result,false);
 assert.deepEqual((await request('/public/assessment/open',auth)).data.report,done.data.report);
 const persisted=(await db.query<any>('SELECT package_hash FROM assessment_invites WHERE id=$1',[id])).rows[0];assert.equal(persisted.package_hash,digest(snapshot));
});
test('HR日常277题邀请、H5与七模块结果继续可用，不能删除答卷或进入原理后台',async(t)=>{
 const person=await request('/assessment/people',{name:'【虚构验收】普通HR邀请',processing_basis:'仅独立测试库使用，不涉及真人资料'},hr);assert.equal(person.status,201);
 t.after(async()=>{await db.query('DELETE FROM assessment_invites WHERE candidate_id=$1',[person.data.id]);await db.query('DELETE FROM candidates WHERE id=$1',[person.data.id]);});
 const created=await request('/assessment/invites',{candidate_id:person.data.id,purpose:'虚构HR正常测评流程验收',days:7,package_kind:'gh_reference_277'},hr);assert.equal(created.status,201);
 const auth={token:created.data.url.split('#')[1],pin:created.data.pin},pkg=(await request('/public/assessment/open',auth)).data.package as GhInvitePackage;
 assert.equal((await request('/assessment/invites',undefined,hr)).status,200);
 assert.equal((await request('/public/assessment/open',auth)).data.package.questions.length,277);
 assert.equal((await request('/public/assessment/consent',{...auth,accepted:true,consent_version:pkg.consent_version})).status,200);
 const selected=pkg.value_groups.map(group=>group.slice(0,5)),value_draft={selected,ranked:selected.flat().slice(0,10)},answers=Object.fromEntries(pkg.questions.map(question=>[question.id,3]));
 const done=await request('/public/assessment/submit',{...auth,revision:0,answers,value_draft});assert.equal(done.status,200);
 const report=await request(`/assessment/invites/${created.data.id}/report`,undefined,hr);assert.equal(report.status,200);assert.deepEqual(report.data.report,done.data.report);assert.equal(report.data.report.result.report_text.motivation.lines.length,5);
 assert.equal((await request('/assessment/rules',undefined,hr)).status,403);
 assert.equal((await request(`/assessment/invites/${created.data.id}/delete`,{confirm:'delete_assessment'},hr)).status,403);
 assert.equal((await request(`/assessment/invites/${created.data.id}/revoke`,{},hr)).status,200);
 assert.equal((await request(`/assessment/invites/${created.data.id}/delete`,{confirm:'delete_assessment'},a)).status,200);
});
test('复刻核验需要业务权限和CSRF，题卷分离，原站计分缺失仍拒绝正式出分',async()=>{
 assert.equal((await request('/assessment/replication')).status,401);
 for(const s of [ops,interviewer])assert.equal((await request('/assessment/replication',undefined,s)).status,403);
 const catalog=await request('/assessment/replication',undefined,a);assert.equal(catalog.status,200);assert.equal(catalog.data.packages[0].questions.length,153);
 const target={version:replicaVersion,mode:'ghrczx_strength_153',answers:{}};
 assert.equal((await request('/assessment/replication/score',target,a,{'X-CSRF-Token':'bad'})).status,403);
 const blocked=await request('/assessment/replication/score',target,a);assert.equal(blocked.status,409);assert.equal(blocked.error.code,'TARGET_SCORING_UNVERIFIED');
 const external={version:replicaVersion,mode:'external_strength_180_v3',answers:Object.fromEntries(replicaCatalog().packages[1].questions.map(q=>[q.id,3]))};
 assert.equal((await request('/assessment/replication/score',{...external,person_id:talent?.candidate_id??'fake'},a)).status,400);
 assert.equal((await request('/assessment/replication/score',{...external,version:'unknown'},a)).status,400);
 assert.equal((await request('/assessment/replication/score',{...external,answers:{}},a)).status,400);
 const result=await request('/assessment/replication/score',external,a);assert.equal(result.status,200);assert.equal(result.data.kind,'external_evidence_trial');assert.equal(result.data.exact_replica_ready,false);assert.equal(result.data.contributions.length,574);
});
test('新版基础分试算需登录、人才负责人、CSRF；不接受身份绑定或解锁正式匹配',async()=>{
 const path='/assessment/gh-evidence',input=ghSyntheticInput();
 assert.equal((await request(path)).status,401);
 for(const s of [ops,interviewer]){assert.equal((await request(path,undefined,s)).status,403);assert.equal((await request(path+'/score',input,s)).status,403);}
 assert.equal((await request(path,undefined,a)).data.audit.first_layer.passed,158);
 assert.equal((await request(path+'/score',input,a,{'X-CSRF-Token':'wrong'})).status,403);
 assert.equal((await request(path+'/score',{...input,answers:{}},a)).status,400);
 assert.equal((await request(path+'/score',{...input,candidate_id:'x'},a)).status,400);
 for(const s of [a,otherLead]){const r=await request(path+'/score',input,s);assert.equal(r.status,200);assert.equal(r.data.rows.length,58);assert.equal(r.data.persisted_as_person_report,false);}
 assert.equal((await request('/assessment/rules/match',{},a)).status,409);
});
test('v22完整计算及补充公式权限、CSRF、严格版本、不缓存且不保存个人报告',async()=>{
 const path='/assessment/gh-replay',input=ghReplayExample();
 assert.equal((await request(path)).status,401);
 for(const s of [ops,interviewer])for(const endpoint of ['', '/score','/final-match','/position-model','/potential-groups'])assert.equal((await request(path+endpoint,endpoint?{}:undefined,s)).status,403);
 const catalog=await fetch(base+'/api/v1'+path,{headers:{Cookie:a.cookie}});assert.equal(catalog.status,200);assert.match(catalog.headers.get('cache-control')!,/no-store/);
 assert.equal((await request(path,undefined,a)).data.audit.gaps.length,5);
 assert.equal((await request(path+'/score',input,a,{'X-CSRF-Token':'bad'})).status,403);
 const beforeCounts=(await db.query("SELECT (SELECT count(*) FROM candidates) candidates,(SELECT count(*) FROM assessment_invites) invites")).rows;
 for(const s of [a,otherLead]){
  const response=await fetch(base+'/api/v1'+path+'/score',{method:'POST',headers:{Cookie:s.cookie,'X-CSRF-Token':s.csrf,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(input)});
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control')!,/no-store/);
  const r=(await response.json() as {data:any}).data;assert.equal(r.roles.length,8);assert.equal(r.style.code,'INFP');assert.equal(r.persisted_as_person_report,false);assert.equal(r.exact_replica_ready,false);
  assert.equal(r.report_text.version,'gh-original-report-copy-v1');assert.equal(r.report_text.temperament.text,'NF（理想主义者）');assert.equal(r.report_text.motivation.lines.length,5);assert.equal(r.report_text.strengths.top_six.length,6);assert.equal(r.report_text.roles.length,2);
 }
 assert.deepEqual((await db.query("SELECT (SELECT count(*) FROM candidates) candidates,(SELECT count(*) FROM assessment_invites) invites")).rows,beforeCounts);
 for(const bad of [{...input,answers:{}},{...input,candidate_id:users[0]},{...input,version:'old'}])assert.equal((await request(path+'/score',bad,a)).status,400);
 const match={version:ghReplayVersion,purpose:'evidence_verification_only',route:'addSomeMatchPeoRecord',component_precision:'rounded',scores:{c8Score:78,qualityScore:58,motiveScore:87,valueScore:48}};
 assert.equal((await request(path+'/final-match',match,a)).data.score,71);
 assert.equal((await request(path+'/final-match',{...match,route:'addMatchPeoRecord'},a)).status,400);
 const quality=ghReplayCatalog().quality_items.map(i=>({item:i.id,score:60}));
 assert.equal((await request(path+'/position-model',{version:ghReplayVersion,purpose:'evidence_verification_only',route:'per_member_scoreCalibrateNew',members:[quality]},a)).data.rows.length,13);
 assert.equal((await request(path+'/potential-groups',quality.map(r=>({item:r.item,value:r.score})),a)).status,200);
 for(const endpoint of ['/final-match','/position-model','/potential-groups'])assert.equal((await request(path+endpoint,{},a)).status,400);
 assert.equal((await request('/assessment/rules/match',{},a)).status,409);
});
test('反推独立入口需登录/人才负责人/CSRF，不泄漏模型，不绑定人才或解锁招聘',async()=>{
 const path='/assessment/gh-inference',input={...ghReplayExample(),version:ghInferenceVersion,purpose:'development_reference_only'};
 assert.equal((await request(path)).status,401);
 for(const s of [ops,interviewer]){assert.equal((await request(path,undefined,s)).status,403);assert.equal((await request(path+'/score',input,s)).status,403);}
 const catalog=await request(path,undefined,a);assert.equal(catalog.status,200);assert.equal(catalog.data.formal_report_available,false);
 if(!catalog.data.available){assert.equal((await request(path+'/score',input,a)).status,503);return;}
 assert.equal(catalog.data.summary.historical_replica_verified,false);assert.equal(catalog.data.summary.holdout.samples,508);
 assert.doesNotMatch(JSON.stringify(catalog.data),/private_id|"support"|coefficients|321373|564066/);
 assert.equal((await request(path+'/score',input,a,{'X-CSRF-Token':'bad'})).status,403);
 assert.equal((await request(path+'/score',input,a,{Origin:'https://evil.invalid'})).status,403);
 for(const bad of [{...input,person_id:'x'},{...input,version:'gh-report-replay-v22'},{...input,purpose:'hiring_rank'},{...input,answers:{}}])assert.equal((await request(path+'/score',bad,a)).status,400);
 const counts=(await db.query('SELECT (SELECT count(*) FROM candidates) candidates,(SELECT count(*) FROM assessment_invites) invites')).rows;
 for(const s of [a,otherLead]){
  const response=await fetch(base+'/api/v1'+path+'/score',{method:'POST',headers:{Cookie:s.cookie,'X-CSRF-Token':s.csrf,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(input)});
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control')!,/no-store/);
  const r=(await response.json() as {data:any}).data;assert.equal(r.abilities.length,28);assert.equal(r.recruitment_decision_allowed,false);assert.equal(r.inference.exact_original_result,false);
  assert.doesNotMatch(JSON.stringify(r),/private_id|"support"|coefficients|321373|564066/);
 }
 assert.deepEqual((await db.query('SELECT (SELECT count(*) FROM candidates) candidates,(SELECT count(*) FROM assessment_invites) invites')).rows,counts);
 assert.equal((await request('/assessment/rules/match',{},a)).status,409);
});
test('创建岗位并保存数据库，拒绝客户端租户注入',async()=>{
 assert.equal((await request('/jobs',{...jobBody,tenant_id:tenants[1]},a)).status,400);
 const r=await request('/jobs',jobBody,a);assert.equal(r.status,201);jobA=r.data;
 jobB=(await request('/jobs',{...jobBody,title:'虚构岗位乙'},a)).data;
 assert.equal((await request('/jobs',undefined,a)).data.total,2);
 assert.equal((await request('/jobs',undefined,b)).data.total,0);
 assert.equal((await request(`/jobs/${jobA.id}`,undefined,b)).status,404);
});
test('原稿样例只读、需人才负责人、限指定本机租户和文件白名单',async()=>{
 assert.equal((await request('/assessment/layout/source/data.svg')).status,401);
 for(const s of [ops,interviewer])assert.equal((await request('/assessment/layout/source/data.svg',undefined,s)).status,403);
 assert.equal((await request('/assessment/layout/source/data.svg',undefined,b)).status,403);
 assert.equal((await request('/assessment/layout/source/data.svg',undefined,otherLead)).status,404);
 for(const name of ['unknown.svg','talent-00.svg','talent-11.svg','layout-qa.json'])assert.equal((await request('/assessment/layout/source/'+name,undefined,a)).status,404);
 assert.equal((await request('/assessment/layout/source/talent-10.svg',undefined,a)).error.code,'LOCAL_SOURCE_UNAVAILABLE');
 const r=await fetch(base+'/api/v1/assessment/layout/source/data.svg',{headers:{Cookie:a.cookie}});
 assert.equal(r.status,200);assert.match(r.headers.get('content-type')!,/image\/svg\+xml/);assert.match(r.headers.get('cache-control')!,/no-store/);
 assert.match(await r.text(),/Fictional fixture/);
});
test('授权导入真实落库；列表无联系方式；原文有行号',async()=>{
 const r=await request('/talents/imports',importBody,a);assert.equal(r.status,201);talent=r.data;
 const list=await request('/talents',undefined,a);assert.equal(list.data.total,1);assert.ok(!JSON.stringify(list.data).includes(importBody.contact));
 const resume=await request(`/resumes/${talent.resume_version_id}`,undefined,a);assert.equal(resume.data.chunks.length,3);assert.equal(resume.data.chunks[1].line_number,2);assert.equal(resume.data.content_hash,digest(importBody.text_content));
 const raw=(await db.query<{contact_cipher:string}>('SELECT contact_cipher FROM candidates WHERE id=$1',[talent.candidate_id])).rows[0];assert.ok(!raw.contact_cipher.includes(importBody.contact));
 const contact=await request(`/talents/${talent.candidate_id}/contact-access`,{},a);assert.equal(contact.data.contact,importBody.contact);
});
test('TAL-03 同源同内容导入幂等、不重复建档',async()=>{
 const results=await Promise.all([request('/talents/imports',importBody,a),request('/talents/imports',importBody,a)]);
 for(const r of results){assert.equal(r.status,200);assert.equal(r.data.duplicate,true);assert.equal(r.data.resume_version_id,talent.resume_version_id);}
 assert.equal((await request('/talents',undefined,a)).data.total,1);
});
test('TAL-01 同人多岗位，两条申请独立关联；重复批次幂等',async()=>{
 const body={candidate_id:talent.candidate_id,job_id:jobA.id,job_version_id:jobA.version_id,resume_version_id:talent.resume_version_id,batch:'2026-test'};
 const first=await request('/applications',body,a);assert.equal(first.status,201);application=first.data;
 const duplicate=await request('/applications',body,a);assert.equal(duplicate.status,200);assert.equal(duplicate.data.id,application.id);
 const second=await request('/applications',{...body,job_id:jobB.id,job_version_id:jobB.version_id},a);assert.equal(second.status,201);
 assert.equal((await request('/applications',undefined,a)).data.total,2);
});
test('TAL-04 新简历版本不改变历史申请；同源姓名冲突阻止覆盖',async()=>{
 const second=await request('/talents/imports',{...importBody,text_content:'虚构简历的第二版本'},a);assert.equal(second.status,201);assert.equal(second.data.version,2);
 const list=await request('/applications',undefined,a);assert.ok(list.data.items.every((x:any)=>x.resume_version_id===talent.resume_version_id));
 assert.equal((await request('/talents/imports',{...importBody,name:'不同人员'},a)).status,409);
});
test('岗位乐观锁与不可变版本；旧申请不随编辑漂移',async()=>{
 const second=await request(`/jobs/${jobA.id}/versions`,{...jobBody,title:'更新的虚构岗位',expected_revision:1,change_reason:'测试新版本'},a);assert.equal(second.status,201);
 assert.equal((await request(`/jobs/${jobA.id}/versions`,{...jobBody,expected_revision:1},a)).status,409);
 const detail=await request(`/jobs/${jobA.id}`,undefined,a);assert.equal(detail.data.versions.length,2);assert.equal(detail.data.versions[1].title,jobBody.title);
 const list=await request('/applications',undefined,a);assert.equal(list.data.items.find((x:any)=>x.id===application.id).job_version_id,jobA.version_id);
 await assert.rejects(db.query('UPDATE job_versions SET title=$1 WHERE id=$2',['tampered',jobA.version_id]),/IMMUTABLE_VERSION/);
 await assert.rejects(db.query('UPDATE resume_versions SET text_content=$1 WHERE id=$2',['tampered',talent.resume_version_id]),/IMMUTABLE_VERSION/);
});
test('SEC-01 跨租户对象、材料、联系方式、关联写入全部拒绝',async()=>{
 for(const path of [`/talents/${talent.candidate_id}`,`/resumes/${talent.resume_version_id}`])assert.equal((await request(path,undefined,b)).status,404);
 assert.equal((await request(`/talents/${talent.candidate_id}/contact-access`,{},b)).status,404);
 assert.equal((await request('/applications',{candidate_id:talent.candidate_id,job_id:jobB.id,job_version_id:jobB.version_id,resume_version_id:talent.resume_version_id,batch:'attack'},b)).status,404);
 assert.equal((await request('/talents/imports',{...importBody,candidate_id:talent.candidate_id,external_id:'foreign'},b)).status,404);
 assert.equal((await request('/talents',undefined,b)).data.total,0);assert.equal((await request('/applications',undefined,b)).data.total,0);
});
test('SEC-02/09 运维和面试官默认无业务与联系方式读取权',async()=>{
 for(const s of [ops,interviewer])for(const path of ['/jobs','/talents','/applications',`/resumes/${talent.resume_version_id}`])assert.equal((await request(path,undefined,s)).status,403);
 assert.equal((await request(`/talents/${talent.candidate_id}/contact-access`,{},ops)).status,403);
 assert.equal((await request('/audit-events',undefined,ops)).status,200);
 assert.equal((await request('/audit-events',undefined,interviewer)).status,403);
});
test('错绑其他人员简历被拒绝；数据库组合外键阻止跨租户关联',async()=>{
 const other=(await request('/talents/imports',{...importBody,external_id:'different-person'},a)).data;
 assert.notEqual(other.candidate_id,talent.candidate_id);
 assert.equal((await request('/applications',{candidate_id:other.candidate_id,job_id:jobB.id,job_version_id:jobB.version_id,resume_version_id:talent.resume_version_id,batch:'wrong'},a)).status,404);
 await assert.rejects(db.query('INSERT INTO applications(id,tenant_id,candidate_id,job_id,job_version_id,resume_version_id,batch,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),tenants[1],talent.candidate_id,jobB.id,jobB.version_id,talent.resume_version_id,'sql-attack',users[1]]));
});
test('用途与到期校验；到期材料不再可读（不宣称物理删除）',async()=>{
 assert.equal((await request('/talents/imports',{...importBody,external_id:'no-basis',processing_basis:''},a)).status,400);
 assert.equal((await request('/talents/imports',{...importBody,retention_until:'2000-01-01T00:00:00.000Z'},a)).status,400);
 const pool=(await request('/talents/imports',{...importBody,external_id:'pool',purpose:'talent_pool'},a)).data;
 assert.equal((await request('/applications',{candidate_id:pool.candidate_id,job_id:jobB.id,job_version_id:jobB.version_id,resume_version_id:pool.resume_version_id,batch:'purpose'},a)).error.code,'PURPOSE_REVIEW_REQUIRED');
 await db.query("UPDATE candidates SET retention_until=now()-interval '1 day' WHERE id=$1",[pool.candidate_id]);
 assert.equal((await request(`/talents/${pool.candidate_id}`,undefined,a)).status,404);assert.equal((await request(`/resumes/${pool.resume_version_id}`,undefined,a)).status,404);
});
test('参数白名单、分页上限与任意租户查询被拒绝',async()=>{
 assert.equal((await request('/jobs?page_size=101',undefined,a)).status,400);
 assert.equal((await request('/talents?tenant_id='+tenants[1],undefined,a)).status,400);
 assert.equal((await request('/talents?mbti=ENFP',undefined,a)).status,400);
 assert.equal((await request('/talents/imports',{...importBody,filename:'payload.exe'},a)).status,400);
});
test('审计仅存动作与对象引用，外部依赖如实阻塞',async()=>{
 const log=await request('/audit-events',undefined,a);assert.ok(log.data.items.some((x:any)=>x.action==='contact.read'));assert.ok(!JSON.stringify(log.data).includes(importBody.contact));assert.ok(!JSON.stringify(log.data).includes(importBody.text_content));
 assert.ok(log.data.items.some((x:any)=>x.action==='access.denied'));
 const readiness=await request('/readiness',undefined,a);assert.ok(readiness.data.features.some((x:any)=>x.status==='blocked_missing_rules'));assert.ok(readiness.data.features.some((x:any)=>x.status==='waiting_for_authorization'));
});
test('并发首次导入无重复档案；异常行数先阻止再入库',async()=>{
 const results=await Promise.all([request('/talents/imports',{...importBody,external_id:'concurrent-new'},a),request('/talents/imports',{...importBody,external_id:'concurrent-new'},a)]);
 assert.deepEqual(results.map(x=>x.status).sort(),[200,201]);assert.equal(results[0].data.candidate_id,results[1].data.candidate_id);
 assert.equal((await request('/talents/imports',{...importBody,external_id:'too-many-lines',text_content:'x\n'.repeat(5001)},a)).status,400);
});
test('测评规则试算由服务端执行，鉴权、来源和输入摘要可验证',async()=>{
 const input={adapter:'gh_talent_web_v81',source_field:'pc_motivation_report_values',scale_ref:'synthetic-api-test',input_kind:'synthetic',purpose:'rule_verification_only',scores:{财富:60,健康:40,享受:45,工作:70,权力:55,创新:65,情感:50,荣誉:60}};
 assert.equal((await request('/assessment/rules')).status,401);
 assert.equal((await request('/assessment/rules',undefined,ops)).status,403);
 assert.equal((await request('/assessment/rules/derive',input,interviewer)).status,403);
 assert.equal((await request('/assessment/rules/derive',input,a,{'X-CSRF-Token':'wrong'})).status,403);
 const result=await request('/assessment/rules/derive',input,a);assert.equal(result.status,200);assert.equal(result.data.W,12.4);assert.equal(result.data.persisted_as_person_report,false);assert.equal(result.data.input_hash.length,64);assert.equal(result.data.occupation_band,null);
 assert.equal((await request('/assessment/rules/derive',{...input,tenant_id:tenants[1]},a)).status,400);
 assert.equal((await request('/assessment/rules/derive',{...input,source_field:'type4Result'},a)).status,400);
 const auditA=await request('/audit-events',undefined,a);assert.ok(auditA.data.items.some((x:any)=>x.action==='assessment.rule_verification'));
 assert.ok(!JSON.stringify(auditA.data).includes('synthetic-api-test'));
});
test('正式测评发布与整套匹配返回真实409缺项，不接受客户端解锁',async()=>{
 const gate=await request('/assessment/rules/validate',{},a);assert.equal(gate.data.publishable,false);assert.equal(gate.data.missing.length,10);
 for(const action of ['publish','match']){
  const result=await request(`/assessment/rules/${action}`,{},a);assert.equal(result.status,409);assert.equal(result.error.code,'MISSING_SCORING_RULES');assert.equal(result.data,undefined);
  assert.equal((await request(`/assessment/rules/${action}`,{approved:true,final_score:100},a)).status,400);
 }
});
test('实验链要求登录、CSRF及业务权限，不能夹带人员或解锁发布',async()=>{
 const input={purpose:'synthetic_method_comparison',answers:[4,2,3,3,2,4],benchmarks:[[5,1,4,2,3,3]],aggregation:'mean',weights:[1,1,1]};
 assert.equal((await request('/assessment/rules/experiment',input)).status,401);
 assert.equal((await request('/assessment/rules/experiment',input,ops)).status,403);
 assert.equal((await request('/assessment/rules/experiment',input,a,{'X-CSRF-Token':'wrong'})).status,403);
 const r=await request('/assessment/rules/experiment',input,a);assert.equal(r.status,200);assert.equal(r.data.formal_score,false);assert.equal(r.data.input_hash.length,64);
 assert.equal((await request('/assessment/rules/experiment',{...input,person_id:talent.candidate_id},a)).status,400);
 assert.equal((await request('/assessment/rules/validate',{},a)).data.publishable,false);
 const logs=(await request('/audit-events',undefined,a)).data.items;assert.ok(logs.some((x:any)=>x.action==='assessment.synthetic_experiment'));
});

test('H5 专属邀请绑定版本、无后台账号访问且PIN校验，GET不消费',async()=>{
 const created=await seedHistorical24(talent.candidate_id,'虚构测试的员工发展沟通',7,application.id);assert.equal(created.status,201);
 const invite=created.data,token=invite.url.split('#')[1],auth={token,pin:invite.pin};
 assert.equal((await request('/assessment/invites',{candidate_id:talent.candidate_id,purpose:'跨租户测试',days:7},b)).status,404);
 assert.equal((await request('/assessment/invites',undefined,ops)).status,403);
 assert.equal((await request('/public/assessment/open',{...auth,pin:'000000'})).status,404);
 assert.equal((await request('/public/assessment/open',{...auth,candidate_id:talent.candidate_id})).status,400);
 const opened=await request('/public/assessment/open',auth);assert.equal(opened.status,200);assert.equal(opened.data.revision,0);assert.equal(opened.data.consented,false);assert.equal(opened.data.report,null);
 assert.equal((await request('/public/assessment/open')).status,401);
 const persisted=(await db.query<any>('SELECT * FROM assessment_invites WHERE id=$1',[invite.id])).rows[0];assert.notEqual(persisted.token_hash,token);assert.notEqual(persisted.pin_hash,invite.pin);assert.equal(persisted.package.version,'1.0.0');
 await assert.rejects(db.query("UPDATE assessment_invites SET package='{}' WHERE id=$1",[invite.id]),/IMMUTABLE_ASSESSMENT_BINDING/);
 const partial={'财富-1':5};
 assert.equal((await request('/public/assessment/save',{...auth,revision:0,answers:partial})).status,409);
 assert.equal((await request('/public/assessment/consent',{...auth,accepted:true,consent_version:selfReviewPackage.consent_version})).status,200);
 const saved=await request('/public/assessment/save',{...auth,revision:0,answers:partial});assert.equal(saved.data.revision,1);
 assert.deepEqual((await request('/public/assessment/open',auth)).data.answers,partial);
 assert.equal((await request('/public/assessment/save',{...auth,revision:0,answers:{'财富-1':1}})).error.code,'DRAFT_CONFLICT');
 assert.equal((await request('/public/assessment/submit',{...auth,revision:1,answers:partial})).status,400);
 const answers=Object.fromEntries(selfReviewPackage.dimensions.flatMap(d=>d.questions.map(q=>[q.id,4])));
 const results=await Promise.all(Array.from({length:10},()=>request('/public/assessment/submit',{...auth,revision:1,answers})));
 assert.ok(results.every(r=>r.status===200));assert.ok(results.every(r=>r.data.revision===2));assert.deepEqual(results[0].data.report,scoreSelfReview(selfReviewPackage,answers));
 assert.equal((await request('/public/assessment/save',{...auth,revision:2,answers})).error.code,'ALREADY_SUBMITTED');
 assert.equal((await request(`/assessment/invites/${invite.id}/report`,undefined,b)).status,404);
 const report=await request(`/assessment/invites/${invite.id}/report`,undefined,a);assert.equal(report.data.report.dimensions.length,8);assert.equal(report.data.report.hiring_recommendation,null);
 await assert.rejects(db.query("UPDATE assessment_invites SET report='{}' WHERE id=$1",[invite.id]),/IMMUTABLE_SUBMISSION/);
 const list=await request('/assessment/invites',undefined,a);assert.ok(!JSON.stringify(list.data).includes(token));assert.ok(!JSON.stringify(list.data).includes(persisted.pin_hash));
 assert.equal((await request(`/assessment/invites/${invite.id}/revoke`,{},b)).status,404);
 assert.equal((await request(`/assessment/invites/${invite.id}/revoke`,{},a)).status,200);
 assert.equal((await request('/public/assessment/open',auth)).status,404);
});
test('H5 到期与新人员独立档案；不需要伪造简历',async()=>{
 const p=await request('/assessment/people',{name:'虚构员工自评测试',processing_basis:'虚构测试，无真实个人信息'},a);assert.equal(p.status,201);
 const c=await seedHistorical24(p.data.id,'虚构独立员工自评',1);assert.equal(c.status,201);
 await db.query("UPDATE assessment_invites SET expires_at=now()-interval '1 second' WHERE id=$1",[c.data.id]);
 assert.equal((await request('/public/assessment/open',{token:c.data.url.split('#')[1],pin:c.data.pin})).status,404);
 assert.equal((await db.query<any>('SELECT count(*)::int AS n FROM resume_versions WHERE candidate_id=$1',[p.data.id])).rows[0].n,0);
 assert.equal((await request(`/assessment/invites/${c.data.id}/delete`,{confirm:'delete_assessment'},b)).status,403);
 assert.equal((await request(`/assessment/invites/${c.data.id}/delete`,{},a)).status,400);
 assert.equal((await request(`/assessment/invites/${c.data.id}/delete`,{confirm:'delete_assessment'},a)).status,200);
 assert.equal((await db.query('SELECT id FROM assessment_invites WHERE id=$1',[c.data.id])).rows.length,0);
});
test('AI 未配置阻塞；权限、Key加密、默认继承、真实调用适配器契约（本地替身）',async()=>{
 const input={feature:'job_optimize',material:'虚构岗位需要整理文档，并交付目录清单。',authorized_to_send:true};
 assert.equal((await request('/ai/run',input,a)).error.code,'MODEL_NOT_CONFIGURED');
 const cfg={feature:'default',provider:'deepseek',model:'test-fixture-model',key:'fixture-key-not-real-123',prompt:'仅根据工作证据分析，不添加未知事实',budget:1,input_price:1,output_price:2};
 assert.equal((await request('/ai/settings',cfg,b)).status,403);
 assert.equal((await request('/ai/settings',cfg,a)).status,200);
 const settings=await request('/ai/settings',undefined,a);assert.ok(!JSON.stringify(settings.data).includes(cfg.key));assert.equal(settings.data.configs[0].has_key,true);
 const row=(await db.query<any>('SELECT key_cipher FROM ai_configs WHERE tenant_id=$1',[tenants[0]])).rows[0];assert.ok(!row.key_cipher.includes(cfg.key));
 assert.equal((await request('/ai/run',{...input,authorized_to_send:false},a)).status,400);
 const result=await request('/ai/run',input,a);assert.equal(result.status,200);assert.equal(result.data.status,'completed');assert.equal(result.data.result.findings[0].citations[0].quote,'虚构岗位需要');
 assert.equal((await request('/ai/runs',undefined,b)).data.items.length,0);
 assert.equal((await request('/ai/runs',undefined,ops)).status,403);
});
test('AI 伪造引用拒绝显示、用量仍记录；预算不足不发送；分功能独立配置可恢复继承',async()=>{
 const input={feature:'resume_review',material:'虚构材料声明自己做过目录整理，需要进一步核验。',authorized_to_send:true};
 mockAIInvalid=true;assert.equal((await request('/ai/run',input,a)).status,502);mockAIInvalid=false;
 const runs=await request('/ai/runs',undefined,a);assert.equal(runs.data.items[0].status,'failed');assert.equal(runs.data.items[0].result,null);assert.ok(Number(runs.data.items[0].cost)>0);
 const cfg={feature:'resume_review',provider:'deepseek',model:'test-model',key:'fixture-second-key-456',prompt:'只引用材料并保留未知',budget:0.0000001,input_price:1,output_price:1};
 assert.equal((await request('/ai/settings',cfg,a)).status,200);const before=mockCalls;assert.equal((await request('/ai/run',input,a)).error.code,'BUDGET_EXCEEDED');assert.equal(mockCalls,before);
 assert.equal((await request('/ai/settings/inherit',{feature:'resume_review'},a)).status,200);
 assert.equal((await request('/ai/run',input,a)).status,200);
});

test('登录限速与注销撤销真实会话',async()=>{
 for(let n=0;n<5;n++)assert.equal((await request('/auth/login',{tenant_id:tenants[0],username:'unknown',password:'wrong'})).status,401);
 assert.equal((await request('/auth/login',{tenant_id:tenants[0],username:'unknown',password:'wrong'})).status,429);
 const session=await login(tenants[0],'user0');assert.equal((await request('/auth/logout',{},session)).status,200);assert.equal((await request('/jobs',undefined,session)).status,401);
});
test('磁盘持久化、备份恢复和重复迁移实际演练（虚构独立测试库）',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'qilun-persistence-'));let local:Database|undefined;
 try{
  local=await openDatabase(join(directory,'db'));const tenant=randomUUID();await local.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[tenant,'虚构持久化测试']);
  await local.close();local=await openDatabase(join(directory,'db'));assert.equal((await local.query('SELECT id FROM tenants WHERE id=$1',[tenant])).rows.length,1);
  const dump=await local.dumpDataDir();await local.close();local=undefined;
  const {PGlite}=await import('@electric-sql/pglite');const restored=await PGlite.create({loadDataDir:dump});
  try{assert.equal((await restored.query('SELECT id FROM tenants WHERE id=$1',[tenant])).rows.length,1);}finally{await restored.close();}
 }finally{if(local)await local.close();await rm(directory,{recursive:true,force:true});}
});

test('招聘资料持久化、加密、租户隔离、归档及结构化需求校验',async()=>{
 const body={title:'虚构公司简介',category:'公司介绍',source_name:'fixture.md',content:'虚构公司专注于企业文档服务，提供目录整理产品。'};
 assert.equal((await request('/recruiting/materials',body,ops)).status,403);
 const saved=await request('/recruiting/materials',body,a);assert.equal(saved.status,200);
 assert.equal((await request('/recruiting/materials',undefined,b)).data.items.length,0);
 assert.equal((await request(`/recruiting/materials/${saved.data.id}`,undefined,b)).status,404);
 assert.equal((await request(`/recruiting/materials/${saved.data.id}`,undefined,a)).data.content,body.content);
 const stored=(await db.query<any>('SELECT content_cipher FROM recruiting_materials WHERE id=$1',[saved.data.id])).rows[0];assert.ok(!stored.content_cipher.includes(body.content));
 const brief={title:'文档运营',location:'杭州',salary_min:8000,salary_max:12000,salary_months:13,experience:'1–3年',education:'不限',style:'有吸引力',requirements:'负责目录整理和客户交付',material_ids:[saved.data.id]};
 assert.equal((await request('/ai/run',{feature:'job_optimize',recruiting:{...brief,salary_max:7000},authorized_to_send:true},a)).status,400);
 assert.equal((await request('/ai/run',{feature:'job_optimize',recruiting:brief,authorized_to_send:true},b)).status,404);
 assert.equal((await request('/ai/run',{feature:'job_optimize',recruiting:brief,authorized_to_send:true},a)).status,200);
 assert.equal((await request(`/recruiting/materials/${saved.data.id}/archive`,{},a)).status,200);
 assert.equal((await request('/ai/run',{feature:'job_optimize',recruiting:brief,authorized_to_send:true},a)).status,404);
});

test('面试关联、权限、文稿版本及模型提问结果的可追溯保存',async()=>{
 const rubric=[{name:'任务执行',requirement:'能够独立完成目录整理并说明验收过程',weight:100}];
 const body={application_id:application.id,assessment_id:null,rubric,question_count:10};
 assert.equal((await request('/interviews',body,b)).status,404);
 assert.equal((await request('/interviews',body,ops)).status,403);
 const saved=await request('/interviews',body,a);assert.equal(saved.status,200);const id=saved.data.id;
 assert.equal((await request(`/interviews/${id}`,undefined,b)).status,404);
 const detail=await request(`/interviews/${id}`,undefined,a);assert.equal(detail.data.job_version_id,application.job_version_id??jobA.version_id);assert.equal(detail.data.resume_version_id,talent.resume_version_id);
 const input={feature:'comprehensive_review',interview:{id,mode:'evaluate',revision:0},authorized_to_send:true};
 assert.equal((await request('/ai/run',input,a)).error.code,'TRANSCRIPT_REQUIRED');
 const draft={text:'候选人：我独立整理了文档目录，并逐一核对链接完成验收。',expected_revision:0,processing_confirmed:true};
 assert.equal((await request(`/interviews/${id}/transcript`,draft,a)).status,200);
 assert.equal((await request(`/interviews/${id}/transcript`,draft,a)).status,409);
 assert.equal((await request('/ai/run',input,a)).error.code,'VERSION_CONFLICT');
 interviewFixture={questions:Array.from({length:10},(_,i)=>({question:`第${i+1}题：请说明你在该岗位中如何完成任务？`,purpose:'核验任务执行',follow_up:'请说明实际交付物',citations:[{id:'E1',quote:'岗位：'}]}))};
 try{const result=await request('/ai/run',{feature:'interview_outline',interview:{id,mode:'questions',revision:1},authorized_to_send:true},a);assert.equal(result.status,200);assert.equal(result.data.result.questions.length,10);const d=await request(`/interviews/${id}`,undefined,a);assert.equal(d.data.runs[0].interview_revision,1);assert.equal(d.data.runs[0].result.type,'interview_questions');assert.ok(!(await request('/ai/runs',undefined,a)).data.items.some((x:any)=>x.id===result.data.id));
 // Check encrypted persistence without exposing the source material.
 const stored=(await db.query<any>('SELECT input_cipher FROM ai_runs WHERE id=$1',[result.data.id])).rows[0];assert.ok(!stored.input_cipher.includes(draft.text));
 interviewFixture={items:[{criterion:'任务执行',score:null,reason:'测试替身保留未知项，不代表真实模型评估',citations:[]}],unknowns:['需进一步核验']};
 const evaluated=await request('/ai/run',{...input,interview:{id,mode:'evaluate',revision:1}},a);assert.equal(evaluated.status,200);assert.equal(evaluated.data.result.score,null);assert.equal(evaluated.data.result.coverage,0);
 interviewFixture={items:[{criterion:'任务执行',score:4,reason:'测试伪造引用不得通过',citations:[{id:'E1',quote:'岗位：'}]}],unknowns:[]};
 assert.equal((await request('/ai/run',{...input,interview:{id,mode:'evaluate',revision:1}},a)).status,502);
 await db.query("UPDATE candidates SET retention_until=now()-interval '1 day' WHERE id=$1",[talent.candidate_id]);
 assert.equal((await request(`/interviews/${id}`,undefined,a)).status,404);const calls=mockCalls;assert.equal((await request('/ai/run',{...input,interview:{id,mode:'evaluate',revision:1}},a)).status,404);assert.equal(mockCalls,calls);
 }finally{interviewFixture=undefined;await db.query("UPDATE candidates SET retention_until=now()+interval '30 days' WHERE id=$1",[talent.candidate_id]);}
});
