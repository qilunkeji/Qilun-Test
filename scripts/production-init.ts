import {mkdir,writeFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {openDatabase} from '../apps/api/db.ts';
import {hashPassword} from '@qilun/security/index.ts';
import {deploymentConfig} from '../apps/api/deployment.ts';
deploymentConfig(process.env);
if(process.env.NODE_ENV!=='production'||!/^[a-f0-9]{64}$/i.test(process.env.CONTACT_ENCRYPTION_KEY??''))throw new Error('Explicit production configuration required');
const db=await openDatabase(process.env.DATA_DIR);
try{
 const counts=(await db.query<{users:number;tenants:number}>('SELECT (SELECT count(*)::int FROM staff_users) users,(SELECT count(*)::int FROM tenants) tenants')).rows[0];
 if(counts.users){console.log('Existing production users preserved; no account changed.');}
 else {
  if(counts.tenants)throw new Error('Existing tenant without users requires manual recovery; initialization refused');
  await mkdir('.local',{recursive:true});
  const tenant=randomUUID(),user=randomUUID(),password=randomBytes(24).toString('base64url'),hash=await hashPassword(password);
  // Write with exclusive creation before committing; never overwrite credentials.
  await writeFile('.local/production-access.txt',`Private production access — do not publish.\nURL: ${process.env.PUBLIC_ORIGIN}\n组织ID: ${tenant}\n账号: talent-admin\n密码: ${password}\n`,{flag:'wx',mode:0o600});
  await db.transaction(async tx=>{await tx.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[tenant,'齐论AI · 人才管理']);await tx.query('INSERT INTO staff_users(id,tenant_id,username,password_hash,role) VALUES($1,$2,$3,$4,$5)',[user,tenant,'talent-admin',hash,'talent_lead']);});
  console.log('Created one production organization/admin; no candidates or test data. Credentials saved privately.');
 }
}finally{await db.close();}
