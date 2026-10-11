import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {digest} from '../packages/security/index.ts';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {agentEnvironment,agentFixture} from '../tests/helpers/agent-fixture.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const restore=agentEnvironment(),f=await agentFixture(undefined,resolve('dist/admin-web'));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),contexts=[],errors=[];
const out='.local/shared-assessment-preview';await mkdir(out,{recursive:true});
async function context(){
 const c=await browser.newContext({viewport:{width:390,height:844}});contexts.push(c);
 // Route to the REAL isolated API with its configured Origin and fixture
 // session. Public endpoints are anonymous; no business response is mocked.
 await c.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==f.origin){await route.abort();return;}
  if(url.pathname.startsWith('/api/')){const r=await f.request(url.pathname+url.search,req.method()==='POST'?req.postDataJSON():undefined,url.pathname.startsWith('/api/v1/public/')?null:'talent_lead',{},req.method());if(c.dropNextEnrollment&&url.pathname.endsWith('/entry/enroll')){c.dropNextEnrollment=false;await route.abort('failed');return;}await route.fulfill({status:r.status,contentType:'application/json',body:JSON.stringify(r.body)});return;}
  await route.continue();
 });return c;
}
async function page(c){const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));return p;}
async function register(p,name){await p.getByLabel('本人姓名',{exact:true}).fill(name);await p.getByLabel('手机号码',{exact:true}).fill('13800000000');await p.getByLabel('出生日期',{exact:true}).fill('1990-06-15');await p.getByRole('checkbox').check();await p.getByRole('button',{name:'开始我的测评',exact:true}).click();await p.getByRole('heading',{name:'Part A',exact:true}).waitFor();assert.ok(await p.getByText('当前参与者：').textContent());return p.evaluate(()=>JSON.parse(localStorage.getItem('qilun-participant:'+location.hash.slice(1))));}
async function noPassword(p){assert.equal(await p.locator('input[pattern="[0-9]{6}"],input[type="password"]').count(),0);}
async function fits(p){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
try{
 const created=(await f.request('/api/v1/assessment/invites',{purpose:'【虚构】共享链接浏览器验证',days:7})).body.data,shared=f.origin+new URL(created.url).pathname+'#'+created.url.split('#')[1];
 assert.equal(new URL(shared).pathname,'/h5');assert.match(new URL(shared).hash.slice(1),/^[A-Za-z0-9_-]{22}$/);
 // An already-sent long /h5/join URL remains usable with the new frontend/API.
 const oldEntry=(await f.request('/api/v1/assessment/public-entries',{title:'【虚构】旧链接',purpose:'仅用于旧链接兼容验收',days:7})).body.data,oldToken=randomBytes(32).toString('base64url');
 await f.db.query('UPDATE assessment_public_entries SET token_hash=$2 WHERE id=$1',[oldEntry.id,digest(oldToken)]);
 const oldPage=await page(await context());await oldPage.goto(f.origin+'/h5/join#'+oldToken);await oldPage.getByLabel('本人姓名',{exact:true}).waitFor();await noPassword(oldPage);await oldPage.close();
 const c=await context(),p=await page(c);await p.goto(shared);await p.getByLabel('本人姓名',{exact:true}).waitFor();await noPassword(p);assert.doesNotMatch(await p.locator('form > p').allTextContents().then(x=>x.join(' ')),/密码|访问码|独立保存/);assert.ok(await p.getByText('答案没有对错',{exact:false}).isVisible());await fits(p);await p.screenshot({path:out+'/registration-mobile.png',fullPage:true});
 // Lose an enrollment RESPONSE after the real API commits. Retry on the same
 // page must recover the same participant rather than create a duplicate.
 c.dropNextEnrollment=true;await p.getByLabel('本人姓名',{exact:true}).fill('【虚构】同名参与者');await p.getByLabel('手机号码',{exact:true}).fill('13800000000');await p.getByLabel('出生日期',{exact:true}).fill('1990-06-15');await p.getByRole('checkbox').check();await p.getByRole('button',{name:'开始我的测评',exact:true}).click();await p.getByRole('alert').waitFor();assert.equal((await f.request('/api/v1/assessment/invites')).body.data.total,1);
 const a=await register(p,'【虚构】同名参与者');assert.equal((await f.request('/api/v1/assessment/invites')).body.data.total,1);assert.equal(a.pin,undefined);assert.equal(p.url(),shared);
 await p.getByRole('radio').first().check();await p.getByRole('status').filter({hasText:'已自动保存'}).waitFor();await fits(p);
 const own=(await f.request('/api/v1/public/assessment/open',a,null)).body.data;assert.equal(Object.keys(own.answers).length,1);
 await p.reload();await p.getByRole('button',{name:'我是【虚构】同名参与者，继续测评',exact:true}).waitFor();assert.equal(await p.getByRole('heading',{name:'Part A',exact:true}).count(),0);await noPassword(p);await p.screenshot({path:out+'/resume-confirm-mobile.png',fullPage:true});
 // Same browser, without reload: creates a fresh key rather than reusing A.
 await p.getByRole('button',{name:'我是另一位参与者，另建答卷',exact:true}).click();await p.getByLabel('本人姓名',{exact:true}).waitFor();
 const b=await register(p,'【虚构】换人参与者');assert.notEqual(a.token,b.token);assert.equal(p.url(),shared);assert.equal(await p.getByRole('radio').filter({has: p.locator(':checked')}).count(),0);
 assert.deepEqual((await f.request('/api/v1/public/assessment/open',b,null)).body.data.answers,{});assert.deepEqual((await f.request('/api/v1/public/assessment/open',a,null)).body.data.answers,own.answers);
 await p.getByRole('radio').nth(4).check();await p.getByRole('status').filter({hasText:'已自动保存'}).waitFor();await p.screenshot({path:out+'/independent-quiz-mobile.png',fullPage:true});
 // Another tab of the same browser only resumes after identity confirmation.
 const secondTab=await page(c);await secondTab.goto(shared);await secondTab.getByRole('button',{name:'我是【虚构】换人参与者，继续测评',exact:true}).click();await secondTab.getByRole('heading',{name:'Part A',exact:true}).waitFor();assert.ok(await secondTab.getByRole('radio').nth(4).isChecked());await secondTab.close();
 // Eight more distinct browser contexts: ten people, including a repeated name.
 const individuals=[a,b];for(let i=0;i<8;i++){const other=await page(await context());await other.goto(shared);individuals.push(await register(other,i===0?'【虚构】同名参与者':`【虚构】参与者${i+3}`));await noPassword(other);await other.close();}
 assert.equal(new Set(individuals.map(x=>x.token)).size,10);assert.equal((await f.request('/api/v1/assessment/invites')).body.data.total,10);
 // Complete B through the real API, then verify automatic report rendering and
 // the participant's own name when reopening the unchanged shared URL.
 const bo=(await f.request('/api/v1/public/assessment/open',b,null)).body.data,pkg=bo.package,selected=pkg.value_groups.map(g=>g.slice(0,5));
 assert.equal((await f.request('/api/v1/public/assessment/submit',{...b,revision:bo.revision,answers:Object.fromEntries(pkg.questions.map(q=>[q.id,3])),value_draft:{selected,ranked:selected.flat().slice(0,10)}},null)).status,200);
 await p.reload();await p.getByRole('button',{name:'我是【虚构】换人参与者，继续测评',exact:true}).click();await p.getByText('报告已自动生成。', {exact:false}).waitFor();await fits(p);
 assert.ok(await p.evaluate(()=>{const boxes=[...document.querySelectorAll('.original-controls > *')].map(x=>x.getBoundingClientRect());return boxes.every((a,i)=>boxes.slice(i+1).every(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)<=1||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=1));}),'mobile report controls must not overlap');await p.screenshot({path:out+'/own-report-mobile.png',fullPage:true});
 const h5DownloadPromise=p.waitForEvent('download');await p.getByRole('button',{name:'保存图片',exact:true}).click();const h5Download=await h5DownloadPromise;assert.equal(h5Download.suggestedFilename(),'【虚构】换人参与者.png');await h5Download.saveAs(out+'/participant-b.png');assert.equal(await h5Download.failure(),null);
 const beforePrint=await p.title();await p.evaluate(()=>{window.print=()=>{window.__exportPrintTitle=document.title;window.dispatchEvent(new Event('beforeprint'));window.dispatchEvent(new Event('afterprint'));};});await p.getByRole('button',{name:'打印 / 保存 PDF',exact:true}).click();assert.equal(await p.evaluate(()=>window.__exportPrintTitle),'【虚构】换人参与者');assert.equal(await p.title(),beforePrint);
 const admin=await page(await context());await admin.setViewportSize({width:1440,height:1000});await admin.goto(f.origin+'/assessments');await admin.getByRole('button',{name:'发起测评',exact:true}).click();await admin.getByRole('button',{name:'创建测评链接',exact:true}).waitFor();assert.equal(await admin.getByLabel('邀请方式').count(),0);assert.equal(await admin.getByText('指定人员 · 专属邀请',{exact:true}).count(),0);await admin.getByRole('button',{name:'创建测评链接',exact:true}).click();await admin.getByRole('button',{name:'复制测评链接',exact:true}).waitFor();assert.doesNotMatch(await admin.locator('.invitation-share textarea').inputValue(),/密码|访问码|个人链接|后台|多人|同一浏览器/);const invitation=await admin.locator('.invitation-share textarea').inputValue();assert.match(invitation,/齐论 AI 测评/);assert.match(invitation,/真实想法认真作答/);await admin.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:f.origin});await admin.getByRole('button',{name:'复制测评链接',exact:true}).click();await admin.getByRole('status').filter({hasText:'已复制邀请信息'}).waitFor();assert.equal(await admin.evaluate(()=>navigator.clipboard.readText()),invitation);await admin.evaluate(()=>window.scrollTo(0,0));await admin.screenshot({path:out+'/admin-shared-links.png',fullPage:true});
 await admin.goto(f.origin+'/applications');await admin.getByRole('button',{name:'发起测评',exact:true}).first().click();await admin.getByRole('button',{name:'复制测评链接',exact:true}).waitFor();assert.doesNotMatch(await admin.locator('.invitation-share textarea').inputValue(),/密码|访问码|后台|多人/);
 // Distinct invitation/report pages; history belongs at the very bottom and
 // stays collapsed until deliberately opened, including with the keyboard.
 await admin.goto(f.origin+'/assessments');await admin.getByRole('heading',{name:'参与者进度',exact:true}).waitFor();
 const history=admin.locator('.assessment-link-history');assert.equal(await history.getAttribute('open'),null);assert.equal(await history.locator('table').isVisible(),false);
 assert.ok(await admin.evaluate(()=>{const h=document.querySelector('.assessment-link-history'),list=document.querySelector('.assessment-participants');return !!(list.compareDocumentPosition(h)&Node.DOCUMENT_POSITION_FOLLOWING)&&h===h.parentElement.lastElementChild;}));
 assert.equal(await admin.getByRole('columnheader',{name:'测评版本',exact:true}).count(),0);assert.equal(await admin.getByRole('columnheader',{name:'答题状态',exact:true}).count(),1);
 await history.locator('summary').focus();await admin.keyboard.press('Enter');assert.ok(await history.locator('table').isVisible());await admin.keyboard.press('Enter');assert.equal(await history.locator('table').isVisible(),false);
 await admin.screenshot({path:out+'/focused-invitations-desktop.png',fullPage:true});
 await admin.getByRole('tab',{name:'测评报告',exact:true}).click();await admin.getByRole('button',{name:'查看报告 →',exact:true}).waitFor();
 assert.equal(await admin.locator('.assessment-participants tbody tr').count(),1);assert.equal(await admin.getByRole('columnheader',{name:'完成时间',exact:true}).count(),1);assert.equal(await admin.getByRole('columnheader',{name:'访问截止',exact:true}).count(),0);assert.equal(await history.count(),0);assert.equal(await admin.getByRole('button',{name:'发起测评',exact:true}).count(),0);
 await admin.screenshot({path:out+'/focused-reports-desktop.png',fullPage:true});
 await admin.getByLabel('搜索测评人员').fill('【虚构】换人参与者');await admin.getByRole('button',{name:'搜索',exact:true}).click();await admin.getByRole('button',{name:'查看报告 →',exact:true}).click();await admin.getByRole('heading',{name:'【虚构】换人参与者 · 测评结果',exact:true}).waitFor();assert.equal(await admin.getByRole('button',{name:'保存图片',exact:true}).count(),1);await admin.locator('.report-detail-disclosure > summary').click();assert.doesNotMatch(await admin.locator('.h5-reference-report').textContent(),/齐论测评 V1\.0/);
 await admin.getByRole('button',{name:'← 返回测评列表',exact:true}).click();await admin.getByRole('button',{name:'查看报告 →',exact:true}).waitFor();assert.equal(await admin.getByRole('tab',{name:'测评报告',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await admin.getByLabel('搜索测评人员').inputValue(),'【虚构】换人参与者');
 await admin.setViewportSize({width:390,height:844});await fits(admin);await admin.screenshot({path:out+'/focused-reports-mobile.png',fullPage:true});await admin.getByRole('tab',{name:'测评报告',exact:true}).focus();await admin.keyboard.press('Home');await admin.getByRole('columnheader',{name:'答题状态',exact:true}).waitFor();await fits(admin);assert.equal(await admin.locator('.assessment-link-history').getAttribute('open'),null);await admin.keyboard.press('End');await admin.getByRole('columnheader',{name:'完成时间',exact:true}).waitFor();assert.equal(await admin.getByRole('tab',{name:'测评报告',exact:true}).getAttribute('aria-selected'),'true');
 // Export a second participant from the admin report view. Their entered
 // name, rather than the shared link label or a fixed report title, is the file name.
 const ao=(await f.request('/api/v1/public/assessment/open',a,null)).body.data,asel=ao.package.value_groups.map(g=>g.slice(0,5));assert.equal((await f.request('/api/v1/public/assessment/submit',{...a,revision:ao.revision,answers:Object.fromEntries(ao.package.questions.map(q=>[q.id,3])),value_draft:{selected:asel,ranked:asel.flat().slice(0,10)}},null)).status,200);
 await admin.getByLabel('搜索测评人员').fill('【虚构】同名参与者');await admin.getByRole('button',{name:'搜索',exact:true}).click();await admin.getByRole('button',{name:'查看报告 →',exact:true}).click();await admin.getByRole('heading',{name:'【虚构】同名参与者 · 测评结果',exact:true}).waitFor();const adminDownloadPromise=admin.waitForEvent('download');await admin.getByRole('button',{name:'保存图片',exact:true}).click();const adminDownload=await adminDownloadPromise;assert.equal(adminDownload.suggestedFilename(),'【虚构】同名参与者.png');await adminDownload.saveAs(out+'/participant-a.png');assert.equal(await adminDownload.failure(),null);
 assert.deepEqual(errors,[]);assert.equal(f.modelCalls(),0);console.log('PASS: real isolated API; ten participants, same-name isolation, same-device switch without reload, lost-response enrollment retry, explicit resume, saved answer and report, shared-only admin/recruitment UI; participant names in actual PNG downloads and PDF print title restoration; no model calls or external traffic.');
}finally{await browser.close();await f.close();restore();}
