// Run ONLY while the production service/container is stopped: one PGlite process.
// Does not run migrations or print any rows/credentials.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const [mode,snapshot]=process.argv.slice(2);assert.ok(['before','after'].includes(mode));assert.match(snapshot??'',/^\/app\/\.local\/agent-counts-[A-Za-z0-9-]+\.json$/);
const db=new PGlite('/app/.local/database');await db.waitReady;
try{
 const counts={};for(const table of ['tenants','staff_users','candidates','candidate_sources','resume_versions','jobs','job_versions','applications','assessment_invites','interviews','ai_runs']){
  // Fixed identifier allowlist, no dynamic user-controlled SQL.
  counts[table]=(await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n;
 }
 if(mode==='before')await writeFile(snapshot,JSON.stringify(counts),{flag:'wx',mode:0o600});else {assert.deepEqual(counts,JSON.parse(await readFile(snapshot,'utf8')));for(const version of [10,11])assert.equal((await db.query('SELECT version FROM schema_migrations WHERE version=$1',[version])).rows.length,1);}
 console.log(JSON.stringify({result:'passed',phase:mode,counts_preserved:mode==='after',tables:Object.keys(counts).length,counts,...(mode==='after'?{migrations:[10,11]}:{})}));
}finally{await db.close();}
