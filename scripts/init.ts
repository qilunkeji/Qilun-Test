import { randomBytes,randomUUID } from 'node:crypto';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { openDatabase } from '../apps/api/db.ts';
import { hashPassword } from '../packages/security/index.ts';
if(process.env.NODE_ENV==='production')throw new Error('Only local initialization is supported');
await mkdir('.local',{recursive:true});
try {await readFile('.env');} catch(err){
  if((err as NodeJS.ErrnoException).code!=='ENOENT')throw err;
  await writeFile('.env',`PORT=3100\nPUBLIC_ORIGIN=http://127.0.0.1:3100\nDATA_DIR=.local/database\nCONTACT_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\n`,{flag:'wx',mode:0o600});
}
const db=await openDatabase(process.env.DATA_DIR??'.local/database');
const count=(await db.query<{count:number}>('SELECT count(*)::int AS count FROM staff_users')).rows[0].count;
if(count){console.log('已有账号，初始化未修改任何账号。');await db.close();process.exit(0);}
const tenant=randomUUID(),user=randomUUID(),password=randomBytes(18).toString('base64url');
const hash=await hashPassword(password);
await db.transaction(async tx=>{
  await tx.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[tenant,'齐论AI · 本地开发组织']);
  await tx.query('INSERT INTO staff_users(id,tenant_id,username,password_hash,role) VALUES($1,$2,$3,$4,$5)',[user,tenant,'local-admin',hash,'talent_lead']);
});
await writeFile('.local/initial-access.txt',`仅供本地开发，请勿提交或分享。\n组织ID：${tenant}\n账号：local-admin\n密码：${password}\n访问：http://127.0.0.1:3100\n`,{flag:'wx',mode:0o600});
await db.close();console.log('本地组织已初始化。随机登录凭据已写入 .local/initial-access.txt；业务库未植入候选人。');
