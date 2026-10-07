// Public read-only checks. No credentials or business writes.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='https://rc.iqilun.cn',checks=[];
async function request(path,expected,options){const r=await fetch(base+path,{signal:AbortSignal.timeout(15000),...options});assert.equal(r.status,expected,path);checks.push({path,status:r.status});return r;}
const hash=x=>createHash('sha256').update(x).digest('hex');
const html=await (await request('/',200)).text();assert.equal(html,await readFile('dist/admin-web/index.html','utf8'));
for(const path of ['/h5/','/h5/report','/brand/qilun-logo-light.png','/favicon.ico','/report-layout/manifest.json'])await request(path,200);
for(const file of (await readdir('dist/admin-web/assets')).filter(name=>/\.(js|css)$/.test(name))){const path='/assets/'+file,r=await request(path,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),hash(await readFile('dist/admin-web'+path)),path);}
assert.equal(hash(Buffer.from(await (await request('/brand/qilun-logo-light.png',200)).arrayBuffer())),hash(await readFile('apps/admin-web/public/brand/qilun-logo-light.png')));
const health=(await (await request('/api/v1/health',200)).json()).data;
assert.equal(health.status,'ok');assert.deepEqual(health.assessment,{version:'qilun-internal-assessment/1.0.0',ready:true});
const options=(await (await request('/api/v1/auth/options',200)).json()).data;assert.equal(options.unified_login,true);assert.equal(options.local_password_login,false);
for(const path of ['product-rules','rules','replication','gh-evidence','gh-replay','gh-inference','layout/source/data.svg'])await request('/api/v1/assessment/'+path,401);
await request('/api/v1/assessment/gh-replay/score',401,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'});
await request('/api/v1/public/assessment/open',400,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'});
await request('/.local/gh-inference-v1/model.json',404);
// Unrecognized non-API paths use the SPA shell, not the source filesystem.
const source=await request('/packages/assessment-engine/data/qilun-standard-v1.json',200);
assert.match(source.headers.get('content-type')??'',/text\/html/);assert.equal(await source.text(),html);
const login=await request('/api/iam/login',302,{redirect:'manual'}),target=new URL(login.headers.get('location'));
assert.equal(target.origin,'https://zh.iqilun.cn');assert.equal(target.searchParams.get('prompt'),'consent');assert.equal(target.searchParams.get('code_challenge_method'),'S256');
// Do not emit cookies, OAuth state/nonces or authorization codes.
console.log(JSON.stringify({result:'passed',checks,assessment:health.assessment,unified_login:true,consent_prompt:true,resource_hashes_match:true},null,2));
