// Run from the Mac ONLY after authorized activation. Reads the one local token file.
// Never prints tokens, response bodies, contexts, cookies, or webhook values.
import assert from 'node:assert/strict';
import {readFile,lstat} from 'node:fs/promises';
const file='/Users/huangfeihong/.codex/secrets/rc-agent-write.token',s=await lstat(file);assert.ok(s.isFile()&&!s.isSymbolicLink()&&(s.mode&0o777)===0o600);
const token=(await readFile(file,'utf8')).trim();assert.ok(/^[A-Za-z0-9_-]{43}$/.test(token));
const address='https://rc.iqilun.cn/mcp/agent',checks=[];
async function call(method,params){const start=Date.now(),r=await fetch(address,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method,params}),signal:AbortSignal.timeout(15000)});assert.equal(r.status,200,'Machine HTTP check failed');const body=await r.json();assert.ok(!body.error&&!body.result?.isError,'Machine protocol check failed');checks.push({method:params?.name??method,status:r.status,seconds:(Date.now()-start)/1000});return body.result;}
const list=await call('tools/list');assert.deepEqual(list.tools.map(t=>t.name),['get_queue_status','list_task_types','list_tasks','wait_for_tasks','claim_task','get_task_context','renew_lease','submit_task_result','fail_task','get_task']);
const types=JSON.parse((await call('tools/call',{name:'list_task_types',arguments:{}})).content[0].text);assert.equal(types.types.length,7);
const queue=JSON.parse((await call('tools/call',{name:'get_queue_status',arguments:{}})).content[0].text);assert.equal(queue.mode,'external_agent');assert.equal(queue.agent_configured,true);
await call('tools/call',{name:'wait_for_tasks',arguments:{timeout_seconds:2}});
console.log(JSON.stringify({result:'passed',address,checks,types:types.types.map(t=>t.type),wake_configured:queue.wake.configured},null,2));
