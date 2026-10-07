/* Local-only acceptance harness. Every API is replaced; no real account,
   invitation, database, provider, DNS or production endpoint is accessed. */
import express from 'express';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {loadAssessmentRuntime} from '../apps/api/assessment-product.ts';
import {qilunStandardInvitePackage,scoreGhInvite,emptyGhValues} from '../packages/assessment-engine/gh-invite.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const out=resolve('.local/ui-unification'),runtime=loadAssessmentRuntime().standard;
assert.ok(runtime);await mkdir(out,{recursive:true});
const pkg=qilunStandardInvitePackage(runtime),selected=pkg.value_groups.map(g=>g.slice(0,5));
const report=scoreGhInvite(pkg,Object.fromEntries(pkg.questions.map(q=>[q.id,3])),{selected,ranked:selected.flat().slice(0,10)},runtime.model,runtime);
const id='00000000-0000-4000-8000-000000000001',second='00000000-0000-4000-8000-000000000002';
const metadata={phone:'138****0000',birth_date:'1990-06-15',active_seconds:1630,profile_completed:true,consistency:{status:'unavailable',label:'未评定'}};
let h5Consented=false,h5Answers={},h5Revision=0;
const person={id,name:'【虚构】测试参与者',purpose:'talent_pool',processing_basis:'仅限虚构隔离UI回归',retention_until:'2099-12-31',created_at:'2026-10-08',sources:[{id:second,channel:'manual',external_id:'fixture-only',authorization_ref:'虚构授权依据'}],resumes:[],applications:[]};
const job={id,revision:1,title:'【虚构】测试岗位',department:'模拟研发部',owner:'模拟负责人',location:'模拟工作地点',status:'draft',version_id:second};
const version={...job,id:second,job_id:id,version:1,tasks:'仅用于测试的工作任务',criteria:'核验作品与本人负责事项',public_jd:'虚构描述，不用于招聘',change_reason:'测试创建',created_at:'2026-10-08'};
const baseRow={id,name:person.name,title:pkg.title,version:pkg.version,purpose:'仅用于虚构验收',expires_at:'2099-12-31',revoked_at:null,submitted_at:'2026-10-08',revision:1};
const app=express();app.get('/before/',async(_q,r)=>r.type('html').send((await readFile(resolve('.local/ui-unification/before-dist/admin-web/index.html'),'utf8')).replaceAll('"/assets/','"/before/assets/')));app.use('/before',express.static(resolve('.local/ui-unification/before-dist/admin-web')));app.get('/before/{*path}',(_q,r)=>r.sendFile(resolve('.local/ui-unification/before-dist/admin-web/index.html')));
app.use(express.static(resolve('dist/admin-web')));app.get('/{*path}',(_q,r)=>r.sendFile(resolve('dist/admin-web/index.html')));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[],screenshots=[];let errors=[];
const state={role:'talent_lead',count:1,delay:0,fail:'',materials:[],applications:[],expired:false,unauthorized:false,missing:false,emptyJobs:false,publicStatus:'valid',configs:[],writes:[],calls:[]};
async function setup(viewport={width:1180,height:757}){
 const context=await browser.newContext({viewport});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(!req.url().startsWith(base)){await route.abort();return;}
  if(!url.pathname.startsWith('/api/')){await route.continue();return;}
  const path=url.pathname.replace('/api/v1',''),body=req.method()==='POST'?req.postDataJSON():null;state.calls.push(path);if(body)state.writes.push({path,body});
  if(state.delay)await new Promise(r=>setTimeout(r,state.delay));
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({data})});
  const fail=(message='模拟读取失败',code='FIXTURE_ERROR',status=503)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({error:{code,message}})});
  if(path==='/auth/options')return send({unified_login:true,local_password_login:false});
  if(path==='/auth/me')return send({role:state.role,username:'虚构验收成员',csrf_token:'fixture-not-a-real-secret'});
  if(path===state.fail)return fail();
  if(path==='/dashboard')return send({jobs:1,candidates:1,applications:0,expired:0});
  if(path==='/assessment/invites'&&!body)return send({items:Array.from({length:state.count},(_,i)=>({...baseRow,id:i===0?id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`})),h5_origin:base,standard_assessment_available:true});
  if(path===`/assessment/invites/${id}/report`)return state.unauthorized?fail('不可访问','NOT_FOUND',404):send({name:person.name,report,metadata,submitted_at:'2026-10-08'});
  if(path==='/talents')return send({items:[person],total:1});
  if(path===`/talents/${id}`)return state.unauthorized?fail('不可访问','NOT_FOUND',404):send({...person,retention_until:state.expired?'2020-01-01':person.retention_until,processing_basis:state.missing?'':person.processing_basis,sources:state.missing?[{...person.sources[0],authorization_ref:''}]:person.sources});
  if(path==='/jobs'&&!body)return send({items:state.emptyJobs||url.searchParams.get('q')==='无结果'?[]:[job],total:state.emptyJobs||url.searchParams.get('q')==='无结果'?0:1});
  if(path===`/jobs/${id}`)return send({id,revision:1,versions:[version]});
  if(path==='/jobs'&&body)return send({id},201);
  if(path===`/jobs/${id}/versions`)return send({id},201);
  if(path==='/applications')return send({items:state.applications,total:state.applications.length});
  if(path==='/interviews'&&!body)return send({items:[]});
  if(path==='/interviews'&&body)return send({id},201);
  if(path===`/interviews/${id}`)return send({id,name:person.name,title:job.title,application_id:second,assessment_id:null,rubric:[],question_count:10,job_version:1,resume_version:1,revision:0,transcript:'',tasks:version.tasks,criteria:version.criteria,runs:[]});
  if(path.startsWith('/interviews/assessments/'))return send({items:[]});
  if(path==='/recruiting/materials'&&!body)return send({items:state.materials});
  if(path==='/recruiting/materials'&&body)return send({id},201);
  if(path==='/ai/settings')return send({configs:state.configs});
  if(path==='/ai/runs')return send({items:[]});
  if(path==='/ai/run')return send({result:{findings:[{text:'虚构测试文案，仅供UI验收',citations:[]}],unknowns:[]}});
  if(path==='/readiness')return send({features:[{name:'本地业务',status:'available',detail:'本地持久化已实现'},{name:'外部模型',status:'requires_model',detail:'已实现，生成依赖配置与材料许可'},{name:'外部渠道',status:'waiting_for_authorization',detail:'未接入，待授权'},{name:'未开发能力',status:'planned',detail:'未实现'}]});
  if(path==='/audit-events')return send({items:[{id,action:'assessment.invited',object_id:second,actor_id:id,created_at:'2026-10-08'},{id:second,action:'unknown.fixture',object_id:'long-'.repeat(30),actor_id:id,created_at:'2026-10-08'},{id:'denied',action:'access.denied',object_id:null,actor_id:id,created_at:'2026-10-08'}]});
  if(path==='/public/assessment/open')return state.publicStatus!=='valid'?fail('邀请无效、已撤销或已到期','INVALID_INVITE',404):send({id,name:person.name,package:pkg,purpose:'仅限虚构测试',expires_at:'2099-12-31',metadata:h5Consented?{...metadata,active_seconds:0}:{...metadata,phone:null,birth_date:null,active_seconds:null,profile_completed:false},answers:h5Answers,value_draft:emptyGhValues(),revision:h5Revision,consented:h5Consented,submitted:false,report:null});
  if(path==='/public/assessment/consent'){h5Consented=true;return send({consented:true,metadata:{...metadata,active_seconds:0}});}
  if(path==='/public/assessment/save'){h5Answers=body.answers;h5Revision++;return send({revision:h5Revision});}
  return fail('隔离替身未定义此接口，不连接真实系统','MOCK_UNDEFINED',404);
 });return {context,page};
}
async function check(name,fn){await fn();results.push({name,status:'passed'});console.log('PASS '+name);}
async function goto(page,path){await page.goto(base+path);await page.locator('.top-header').waitFor();}
async function shot(page,name,element){const path=resolve(out,name+'.png');await (element??page).screenshot({path,fullPage:!element});screenshots.push(path);}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`page overflow ${page.url()}`);}
async function compareCanvasPixels(){
 const {stdout}=await promisify(execFile)(process.env.PYTHON_BIN??'python3',['-c',"from PIL import Image; import json; a=Image.open('.local/ui-unification/after-original-canvas.png').convert('RGB'); b=Image.open('.local/ui-unification/before-original-canvas.png').convert('RGB'); assert a.size==b.size; diffs=[max(abs(x[i]-y[i]) for i in range(3)) for x,y in zip(a.getdata(),b.getdata())]; print(json.dumps({'size':a.size,'different_pixels':sum(d>0 for d in diffs),'mean_channel_difference':sum(diffs)/len(diffs)}))"]);
 const result=JSON.parse(stdout);assert.ok(result.different_pixels<1000&&result.mean_channel_difference<.01,JSON.stringify(result));
 const manifest=JSON.parse(await readFile('dist/admin-web/report-layout/manifest.json','utf8'));
 for(const p of manifest.pages){assert.deepEqual(await readFile(resolve('dist/admin-web'+p.src)),await readFile(resolve('.local/ui-unification/before-dist/admin-web'+p.src)));}
 await writeFile(resolve(out,'canvas-comparison.json'),JSON.stringify({...result,unchanged_original_svg_files:manifest.pages.length,note:'Pixel comparison excludes overlaid site navigation. Small browser SVG antialiasing differences are measured, not claimed byte-identical.'},null,2));
}
try{
 const {context,page}=await setup();
 await check('HOME restrained palette / compact copy / desktop-mobile actions',async()=>{
  await goto(page,'/');await page.getByRole('heading',{name:'人才管理工作台'}).waitFor();
  const colors=await page.locator('.home-hero-refined').evaluate(e=>({bg:getComputedStyle(e).backgroundColor,title:getComputedStyle(e.querySelector('h1')).color,kicker:getComputedStyle(e.querySelector('.hero-kicker')).color}));
  assert.deepEqual(colors,{bg:'rgb(255, 255, 255)',title:'rgb(31, 27, 26)',kicker:'rgb(95, 91, 91)'});
  await shot(page,'after-home-refined',page.locator('.home-hero-refined'));
  const artwork=await page.locator('.home-hero-refined').evaluate(e=>{const s=getComputedStyle(e,'::after');return {right:s.right,top:s.top,radius:s.borderRadius,ratio:parseFloat(s.width)/e.getBoundingClientRect().width};});
  assert.equal(artwork.right,'0px');assert.equal(artwork.top,'0px');assert.equal(artwork.radius,'0px');assert.ok(artwork.ratio>.4);
  await page.getByRole('heading',{name:'最近岗位',exact:true}).waitFor();await shot(page,'after-home-workspace');
  state.emptyJobs=true;await goto(page,'/');await page.getByRole('button',{name:'创建第一个招聘岗位'}).waitFor();await shot(page,'after-home-empty-workspace');state.emptyJobs=false;
  await page.getByRole('button',{name:'进入测评中心'}).click();await page.waitForURL('**/assessments');
  await goto(page,'/');await page.getByRole('button',{name:'新建招聘岗位',exact:true}).click();await page.waitForURL('**/jobs/new');
  await page.setViewportSize({width:390,height:844});await goto(page,'/');await noOverflow(page);await shot(page,'mobile-home-refined',page.locator('.home-hero-refined'));await page.setViewportSize({width:1180,height:757});
 });
 await check('RC-01 statistics 0 / 1 / 1001, final and loading, failure recovery',async()=>{
  for(const count of [0,1,1001]){state.count=count;await goto(page,'/assessments');await page.locator('.overview-metrics').waitFor();assert.equal(await page.locator('.overview-metrics strong').first().textContent(),String(count));await noOverflow(page);}
  state.count=1;state.delay=250;await goto(page,'/assessments');await page.getByText('正在读取邀请统计…').waitFor();state.delay=0;
  state.fail='/assessment/invites';await goto(page,'/assessments');await page.locator('.error-state').waitFor();assert.equal(await page.locator('.overview-metrics').count(),0);state.fail='';await page.getByRole('button',{name:'重新读取'}).click();await page.locator('.overview-metrics').waitFor();await shot(page,'after-assessments');
 });
 await check('RC-02 dialog object/scope, focus/Escape, cancel zero writes; HR no delete',async()=>{
  await page.getByText('管理本次邀请',{exact:true}).click();await page.getByRole('button',{name:'永久删除本次测评',exact:true}).click();await page.locator('dialog[open]').waitFor();assert.match(await page.locator('dialog').textContent(),/虚构.*当前数据库.*不能恢复/s);
  const before=state.writes.length;assert.equal(await page.evaluate(()=>document.activeElement.textContent),'取消');await page.keyboard.press('Escape');assert.equal(state.writes.length,before);await page.getByRole('button',{name:'撤销本次邀请',exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal(state.writes.length,before);
  state.role='hr';await goto(page,'/assessments');await page.locator('.overview-metrics').waitFor();assert.equal(await page.getByRole('button',{name:'永久删除本次测评',exact:true}).count(),0);state.role='talent_lead';
 });
 await check('RC-03 deep links / refresh / back-forward / search state / guarded routes',async()=>{
  await goto(page,'/jobs');await page.getByRole('button',{name:'查看与编辑 →'}).waitFor();await page.getByLabel('搜索岗位').fill('测试');await page.getByRole('button',{name:'搜索',exact:true}).click();await page.getByRole('button',{name:'查看与编辑 →'}).click();await page.getByRole('button',{name:'修改并保存新版本'}).waitFor();assert.equal(new URL(page.url()).pathname,'/jobs/'+id);await page.reload();await page.getByRole('button',{name:'修改并保存新版本'}).waitFor();await page.getByRole('button',{name:'← 返回岗位列表'}).click();await page.getByRole('button',{name:'查看与编辑 →'}).waitFor();assert.equal(await page.getByLabel('搜索岗位').inputValue(),'测试');await page.goForward();await page.getByRole('button',{name:'修改并保存新版本'}).waitFor();
  state.role='ops';await goto(page,'/assessments/'+id);await page.getByText('页面暂不可访问',{exact:true}).waitFor();assert.equal(await page.locator('.h5-reference-report').count(),0);await goto(page,'/settings/assessment-admin');await page.getByText('当前栏目不可访问',{exact:false}).waitFor();state.role='talent_lead';state.unauthorized=true;await goto(page,'/assessments/'+id);await page.getByText('报告暂不可访问',{exact:false}).waitFor();assert.equal(await page.locator('.h5-reference-report').count(),0);state.unauthorized=false;
 });
 await check('RC-04 first-screen requirements / local file validation / cancel / explicit outbound scope',async()=>{
  await goto(page,'/optimize');await page.getByLabel('招聘岗位 *').waitFor();assert.ok((await page.getByLabel('招聘岗位 *').boundingBox()).y<757);assert.equal(await page.getByRole('button',{name:'生成招聘文案 →'}).isDisabled(),true);assert.equal(state.writes.filter(x=>x.path==='/ai/run').length,0);
  await page.getByText('公司资料库 · 0 份',{exact:true}).click();const input=page.locator('.upload-label input');await input.setInputFiles({name:'bad.pdf',mimeType:'application/pdf',buffer:Buffer.from('bad')});await page.getByText('目前支持 UTF-8 TXT',{exact:false}).waitFor();await input.setInputFiles({name:'fixture.md',mimeType:'text/markdown',buffer:Buffer.from('仅用于虚构UI验收的材料文本')});await page.getByText('已读取，尚未上传。',{exact:false}).waitFor();const before=state.writes.length;await page.locator('.material-editor').getByRole('button',{name:'取消',exact:true}).click();assert.equal(state.writes.length,before);await shot(page,'after-recruiting');
 });
 await check('RC-05 create cancel and dirty guard with zero writes / real prerequisite link',async()=>{
  state.applications=[];await goto(page,'/interviews/new');await page.getByText('还没有可关联的岗位申请。',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'新建面试',exact:true}).count(),0);const before=state.writes.length;await page.getByRole('button',{name:'取消并返回列表'}).click();await page.getByRole('button',{name:'新建面试',exact:true}).waitFor();assert.equal(state.writes.length,before);
  await page.getByRole('button',{name:'新建面试',exact:true}).click();await page.getByLabel('岗位要求').first().fill('虚构编辑中的岗位要求');page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'取消并返回列表'}).click();await page.waitForURL('**/interviews/new');assert.equal(new URL(page.url()).pathname,'/interviews/new');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'取消并返回列表'}).click();await page.getByRole('button',{name:'新建面试',exact:true}).waitFor();assert.equal(state.writes.length,before);
 });
 await check('RC-06 create/revise labels / hints / publish confirmation / version body',async()=>{
  await goto(page,'/jobs/new');await page.getByLabel('创建说明').waitFor();for(const [field,value] of Object.entries({title:'虚构岗位',department:'自定义部门',owner:'虚构负责人',location:'自定义方式',tasks:'虚构任务与交付物',criteria:'虚构证据与核验方式',public_jd:'虚构岗位描述'}))await page.locator(`[name="${field}"]`).fill(value);
  await page.locator('[name="status"]').selectOption('open');let before=state.writes.length;page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'创建岗位版本'}).click();assert.equal(state.writes.length,before);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'创建岗位版本'}).click();await page.getByRole('button',{name:'修改并保存新版本'}).waitFor();const saved=state.writes.findLast(x=>x.path==='/jobs');assert.equal(saved.body.department,'自定义部门');await page.getByRole('button',{name:'修改并保存新版本'}).click();await page.getByLabel('本次改版理由').fill('虚构改版原因');await page.getByRole('button',{name:'确认保存新版本'}).click();await page.getByRole('button',{name:'修改并保存新版本'}).waitFor();assert.equal(state.writes.findLast(x=>x.path.endsWith('/versions')).body.expected_revision,1);
 });
 await check('RC-07 mobile public valid / expired / revoked, no deployment footer',async()=>{
  await goto(page,'/assessments');await page.locator('.overview-metrics').waitFor();assert.doesNotMatch(await page.locator('main').textContent(),/本机地址|公网域名上线后/);
  await page.setViewportSize({width:390,height:844});for(const status of ['valid','expired','revoked']){state.publicStatus=status;await page.goto(base+'/h5/?fixture='+status+'#fixture-not-a-real-token');await page.getByLabel('访问码').fill('123456');await page.getByRole('button',{name:'进入测评'}).click();if(status==='valid')await page.getByText('预留约30分钟',{exact:false}).waitFor();else await page.getByText('邀请无效、已撤销或已到期',{exact:false}).waitFor();await noOverflow(page);}state.publicStatus='valid';await page.setViewportSize({width:1180,height:757});
 });
 await check('PROFILE phone/date required before start / autosave and reload / masked report header',async()=>{
  await page.goto(base+'/h5/?fixture=profile#fixture-not-a-real-token');await page.getByLabel('访问码').fill('123456');await page.getByRole('button',{name:'进入测评'}).click();await page.getByText('填写基本信息',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'开启自我探索'}).isDisabled(),true);await page.getByLabel('手机号码',{exact:true}).fill('13800000000');await page.getByLabel('出生日期',{exact:true}).fill('1990-06-15');await page.locator('.check-label input').check();await page.getByRole('button',{name:'开启自我探索'}).click();await page.locator('.h5-question-list').waitFor();await page.locator('.h5-dot-options input').first().check();await page.getByText('已自动保存 · 下次从这里继续',{exact:true}).waitFor();assert.ok(Object.keys(h5Answers).length>0);await page.reload();await page.getByLabel('访问码').fill('123456');await page.getByRole('button',{name:'进入测评'}).click();await page.locator('.h5-question-list').waitFor();assert.equal(await page.getByText('填写基本信息',{exact:true}).count(),0);
 });
 await check('RC-08 privacy unknown and expired / contact audit not called automatically',async()=>{
  await goto(page,'/talents/'+id);await page.locator('.privacy-details').waitFor();assert.match(await page.locator('main').textContent(),/人工授权导入/);assert.equal(state.calls.filter(x=>x.endsWith('/contact-access')).length,0);
  state.missing=true;await goto(page,'/talents/'+id);await page.locator('.privacy-details').waitFor();assert.match(await page.locator('.privacy-details').textContent(),/授权记录缺失/);assert.equal(await page.getByRole('button',{name:'查看联系方式（留审计）'}).isDisabled(),true);state.missing=false;state.expired=true;await goto(page,'/talents/'+id);await page.getByText('档案暂不可访问',{exact:false}).waitFor();assert.equal(await page.locator('.privacy-details').count(),0);state.expired=false;
 });
 await check('RC-09/10 branding / one H1 / loading-error-retry / first-screen settings',async()=>{
  await goto(page,'/');assert.equal(await page.locator('.hero-actions button.primary').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(155, 0, 0)');const logo=await page.locator('.top-brand img').boundingBox();assert.ok(logo.height>=20);
  for(const path of ['/settings/models','/settings/status','/settings/audit','/settings/assessment-admin']){await goto(page,path);await page.waitForTimeout(100);assert.equal(await page.locator('main h1').count(),1,path);}
  state.fail='/readiness';await goto(page,'/settings/status');await page.locator('.error-state').waitFor();state.fail='';await page.getByRole('button',{name:'重新读取'}).click();await page.locator('.readiness-row').first().waitFor();assert.ok((await page.locator('.readiness-row').first().boundingBox()).y<757);await shot(page,'after-settings');
 });
 await check('RC-11 independent report / seven keyboard anchors / print fixture',async()=>{
  await goto(page,'/assessments/'+id);await page.locator('.report-header-overlay').waitFor();
  const pendingImage=page.waitForEvent('download');await page.getByRole('button',{name:'保存图片',exact:true}).click();const exported=await pendingImage;
  assert.equal(exported.suggestedFilename(),'齐论AI-测评数据报告.png');assert.equal(await exported.failure(),null);await exported.saveAs(resolve(out,'report-export-fixture.png'));
  const {stdout:pngCheck}=await promisify(execFile)(process.env.PYTHON_BIN??'python3',['-c',"from PIL import Image; import json; im=Image.open('.local/ui-unification/report-export-fixture.png').convert('RGB'); assert im.width>1000 and im.height>1000; assert len(im.getcolors(im.width*im.height))>100; print(json.dumps({'width':im.width,'height':im.height}))"]);console.log('PNG export '+pngCheck.trim());
  await goto(page,'/assessments/'+id);await page.locator('.h5-reference-report').waitFor();assert.equal(await page.locator('.assessment-overview').count(),0);await page.locator('.original-sheet').waitFor();assert.ok((await page.locator('.report-header-overlay').textContent()).includes('138****0000'));assert.match(await page.locator('.report-header-overlay').textContent(),/27分10秒/);assert.equal(await page.locator('.report-detail-disclosure').getAttribute('open'),null);assert.equal(await page.locator('.h5-module-nav').isVisible(),false);await shot(page,'after-report-sheet-first');await page.locator('.report-detail-disclosure>summary').click();assert.match(await page.locator('.report-usage-note').textContent(),/不用于自动录用/);assert.equal(await page.locator('.h5-module-nav a').count(),7);
  for(const link of await page.locator('.h5-module-nav a').all()){await link.focus();await page.keyboard.press('Enter');const href=await link.getAttribute('href');const top=await page.locator(href).evaluate(e=>e.getBoundingClientRect().top);assert.ok(top>=70,href+' header offset');}
  await page.waitForFunction(()=>{const images=[...document.querySelectorAll('.report-sheet-container img')];return images.length>0&&images.every(i=>i.complete&&i.naturalWidth>0);});
  await page.emulateMedia({media:'print'});await page.pdf({path:resolve(out,'synthetic-report-print.pdf'),printBackground:true,preferCSSPageSize:true});await page.emulateMedia({media:'screen'});await shot(page,'after-report');
  const {stdout}=await promisify(execFile)(process.env.PYTHON_BIN??'python3',['-c',"from pypdf import PdfReader; r=PdfReader('.local/ui-unification/synthetic-report-print.pdf'); assert len(r.pages)==1, len(r.pages); text=r.pages[0].extract_text(); assert len(text)>300, len(text); print(len(text))"]);assert.ok(Number(stdout)>300);
 });
 await check('RC-12 audit mappings / unknown preserved / collapsible IDs / no private text',async()=>{
  await goto(page,'/settings/audit');await page.getByText('发起测评邀请',{exact:true}).waitFor();assert.match(await page.locator('table').textContent(),/已拒绝/);assert.match(await page.locator('table').textContent(),/unknown.fixture/);await page.locator('.audit-reference summary').first().focus();await page.keyboard.press('Enter');assert.ok(await page.locator('.audit-reference').first().getAttribute('open')!==null);await noOverflow(page);await shot(page,'after-audit');
 });
 await check('RC-13 original canvas source unchanged / measured pixel comparison / toolbar only',async()=>{
  await goto(page,'/settings/assessment-admin');await page.getByRole('button',{name:'原版报告 · 版式与留白',exact:true}).click();await page.locator('.original-sheet-vector').waitFor();await page.locator('.original-sheet-vector').evaluate(async e=>{if(!e.complete)await new Promise(r=>e.addEventListener('load',r,{once:true}));});await page.addStyleTag({content:'.top-header,.skip-link{visibility:hidden!important}'});const after=await page.locator('.original-sheet').screenshot();await shot(page,'after-original-canvas',page.locator('.original-sheet'));
  // The old build has no routes; enter its same authorized settings via navigation.
  await page.goto(base+'/before/');await page.locator('.top-header').waitFor();await page.locator('header nav').getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'测评后台',exact:true}).click();await page.getByRole('button',{name:'原版报告 · 版式与留白',exact:true}).click();await page.locator('.original-sheet-vector').waitFor();await page.locator('.original-sheet-vector').evaluate(async e=>{if(!e.complete)await new Promise(r=>e.addEventListener('load',r,{once:true}));});await page.addStyleTag({content:'.top-header,.skip-link{visibility:hidden!important}'});const before=await page.locator('.original-sheet').screenshot();await shot(page,'before-original-canvas',page.locator('.original-sheet'));await compareCanvasPixels();
 });
 await check('RC-14 unconfigured / configured not tested / authorized only / no automatic AI',async()=>{
  const before=state.writes.filter(x=>x.path==='/ai/run').length;state.configs=[];await goto(page,'/settings/models');await page.getByText('未配置',{exact:false}).first().waitFor();assert.match(await page.locator('main').textContent(),/连接：未检测/);state.configs=[{feature:'default',provider:'openai',model:'fixture-model',has_key:true,prompt:'虚构提示词',budget:1,input_price:1,output_price:1,updated_at:'2026-10-08'}];await goto(page,'/settings/models');await page.getByText('已配置 · openai / fixture-model',{exact:false}).first().waitFor();assert.match(await page.locator('main').textContent(),/无最近检测时间/);assert.equal(state.writes.filter(x=>x.path==='/ai/run').length,before);await page.getByRole('button',{name:'主动连接测试（有调用费用）'}).focus();
  page.once('dialog',d=>d.dismiss());await page.keyboard.press('Enter');assert.equal(state.writes.filter(x=>x.path==='/ai/run').length,before);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'主动连接测试（有调用费用）'}).click();await page.getByText('本页主动检查：调用成功',{exact:false}).waitFor();state.fail='/ai/run';page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'主动连接测试（有调用费用）'}).click();await page.getByText('本页主动检查：调用失败',{exact:false}).waitFor();state.fail='';state.role='hr';await goto(page,'/settings/models');await page.getByRole('button',{name:'保存配置',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'保存配置',exact:true}).isDisabled(),true);state.role='talent_lead';
 });
 await check('COMMON responsive 1180/1366/1024/768/390 and 200% equivalent layout',async()=>{
  for(const width of [1180,1366,1024,768,390,590]){await page.setViewportSize({width,height:width===1180?757:width===1366?768:844});for(const path of ['/','/jobs/new','/optimize','/assessments','/interviews/new','/talents/'+id,'/settings/models','/settings/status','/settings/audit','/assessments/'+id]){await goto(page,path);await page.waitForTimeout(80);await noOverflow(page);if(width===390&&['/optimize','/assessments','/jobs/new'].includes(path))await shot(page,'mobile-'+path.replaceAll('/','-'));}}
 });
 await context.close();assert.deepEqual(errors,[]);await writeFile(resolve(out,'browser-results.json'),JSON.stringify({tested_at:new Date().toISOString(),environment:'loopback only, mocked API, headless Chrome',results,screenshots,errors,production_mutated:false,actual_ai_calls:0},null,2));console.log(`DONE ${results.length} groups; no real backend writes`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
