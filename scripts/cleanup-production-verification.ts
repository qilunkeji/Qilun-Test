import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {openDatabase} from '../apps/api/db.ts';
import {deploymentConfig} from '../apps/api/deployment.ts';
deploymentConfig(process.env);
if(process.env.NODE_ENV!=='production'||!process.argv.includes('--confirm-delete-fictional-verification'))throw new Error('Explicit fictional-verification cleanup required');
const fixture=z.object({candidate_id:z.uuid(),invite_id:z.uuid()}).passthrough().parse(JSON.parse(await readFile('/app/.local/verification/fixture.json','utf8')));
const db=await openDatabase(process.env.DATA_DIR);
try{
 await db.transaction(async tx=>{
  const person=(await tx.query<{name:string;processing_basis:string}>('SELECT name,processing_basis FROM candidates WHERE id=$1 FOR UPDATE',[fixture.candidate_id])).rows[0];
  if(!person||person.name!=='【上线验收】临时虚构人员'||!person.processing_basis.includes('本次部署核心流程验收'))throw new Error('Not the exact fictional verification profile; refusing cleanup');
  for(const table of ['assessment_invites','resume_versions','applications'] as const){const r=await tx.query<{count:number}>(`SELECT count(*)::int AS count FROM ${table} WHERE candidate_id=$1`,[fixture.candidate_id]);if(r.rows[0].count)throw new Error('Profile has remaining dependent records; refusing cleanup');}
  await tx.query('DELETE FROM candidates WHERE id=$1',[fixture.candidate_id]);
 });
 console.log('Deleted only the exact fictional verification profile. Production organization, users and all other records preserved.');
 const counts=(await db.query('SELECT (SELECT count(*)::int FROM staff_users) users,(SELECT count(*)::int FROM candidates) candidates,(SELECT count(*)::int FROM assessment_invites) invites')).rows[0];console.log(JSON.stringify(counts));
}finally{await db.close();}
