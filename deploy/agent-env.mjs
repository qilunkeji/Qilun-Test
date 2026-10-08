// Production-only utility. Reads secrets from stdin; never logs them.
// Only updates this integration's allowlisted settings, preserving every other line.
import assert from 'node:assert/strict';
import {readFile,writeFile,stat,chmod,chown,rename} from 'node:fs/promises';
const target='/opt/qilun-talent/shared/production.env';
const allowed=new Set(['PROCESSING_MODE','AGENT_WRITE_TOKEN_SHA256','AGENT_WAKE_WEBHOOK_URL','AGENT_WAKE_WEBHOOK_SECRET','AGENT_WAKE_WEBHOOK_AUTH_HEADER','AGENT_REPLY_HINT_TEXT','AGENT_STALE_ALERT_MINUTES','AGENT_REWAKE_AFTER_SECONDS','AGENT_WAKE_COALESCE_SECONDS','AGENT_TASK_MAX_ATTEMPTS','AGENT_HOURLY_LIMIT_PER_USER','AGENT_MAX_PENDING_PER_USER','AGENT_REDACT_CONTACTS']);
let raw='';for await(const part of process.stdin){raw+=part;assert.ok(raw.length<16000,'Configuration input too large');}
let patch;try{patch=JSON.parse(raw);}catch{throw Error('Invalid configuration input');}
assert.ok(patch&&typeof patch==='object'&&!Array.isArray(patch));
for(const [k,v] of Object.entries(patch)){assert.ok(allowed.has(k),'Unapproved setting');assert.ok(typeof v==='string'&&!/[\r\n\0]/.test(v),'Invalid setting value');}
assert.equal(patch.PROCESSING_MODE,'external_agent');assert.match(patch.AGENT_WRITE_TOKEN_SHA256??'',/^[a-f0-9]{64}$/);
// The activation input must explicitly decide all three webhook settings, even if empty.
for(const k of ['AGENT_WAKE_WEBHOOK_URL','AGENT_WAKE_WEBHOOK_SECRET','AGENT_WAKE_WEBHOOK_AUTH_HEADER'])assert.ok(k in patch,'Missing wake decision');
if(patch.AGENT_WAKE_WEBHOOK_URL){const u=new URL(patch.AGENT_WAKE_WEBHOOK_URL);assert.equal(u.protocol,'https:');assert.ok(!u.username&&!u.password&&patch.AGENT_WAKE_WEBHOOK_SECRET);}
assert.match(patch.AGENT_WAKE_WEBHOOK_AUTH_HEADER,/^[A-Za-z0-9-]+$/);
const info=await stat(target),lines=(await readFile(target,'utf8')).split('\n'),seen=new Set();
const result=lines.map(line=>{const key=line.match(/^([A-Z0-9_]+)=/)?.[1];if(!key||!(key in patch))return line;assert.ok(!seen.has(key),'Duplicate managed setting');seen.add(key);return key+'='+patch[key];});
for(const [k,v] of Object.entries(patch))if(!seen.has(k))result.push(k+'='+v);
const temporary=target+'.external-agent-next';await writeFile(temporary,result.join('\n').replace(/\n*$/,'\n'),{flag:'wx',mode:info.mode&0o777});await chmod(temporary,info.mode&0o777);await chown(temporary,info.uid,info.gid);await rename(temporary,target);
