// Actual main.ts startup/shutdown against a fresh disposable disk database.
// Inherits no production environment or credentials. No webhook/model network calls.
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {openDatabase} from '../apps/api/db.ts';
const temporary=await mkdtemp(join(tmpdir(),'qilun-agent-candidate-'));
const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
let child,exited;
try{
 const origin=`http://127.0.0.1:${port}`;
 child=spawn(process.execPath,['--experimental-strip-types','apps/api/main.ts'],{env:{PATH:process.env.PATH,NODE_ENV:'development',PROCESSING_MODE:'external_agent',PORT:String(port),PUBLIC_ORIGIN:origin,H5_ORIGIN:origin,LISTEN_HOST:'127.0.0.1',DATA_DIR:temporary,CONTACT_ENCRYPTION_KEY:randomBytes(32).toString('hex'),AGENT_WRITE_TOKEN_SHA256:createHash('sha256').update(randomBytes(32)).digest('hex')},stdio:'ignore'});exited=once(child,'exit');
 let ready=false;for(let attempt=0;attempt<40;attempt++){if(child.exitCode!==null)throw Error('Candidate process exited before readiness');try{const r=await fetch(origin+'/api/v1/health',{signal:AbortSignal.timeout(1000)});assert.equal(r.status,200);assert.equal((await r.json()).data.assessment.ready,true);ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}
 assert.ok(ready,'Candidate startup health timeout');assert.equal((await fetch(origin+'/')).status,200);
 assert.equal((await fetch(origin+'/mcp/agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'ping'})})).status,401);
 child.kill('SIGTERM');const [code]=await exited;assert.equal(code,0);
 // Only now reopen disk: never two PGlite processes for one directory.
 const db=await openDatabase(temporary);try{assert.equal((await db.query('SELECT max(version)::int n FROM schema_migrations')).rows[0].n,15);assert.equal((await db.query('SELECT count(*)::int n FROM candidates')).rows[0].n,0);}finally{await db.close();}
 console.log(JSON.stringify({result:'passed',main_startup:true,clean_shutdown:true,database:'empty_disposable_disk',migration:15,assessment_ready:true,production_touched:false}));
}finally{if(child&&child.exitCode===null){child.kill('SIGTERM');await exited;}assert.ok(temporary.startsWith(join(tmpdir(),'qilun-agent-candidate-')));await rm(temporary,{recursive:true});}
