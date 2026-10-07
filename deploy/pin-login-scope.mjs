// Run only with the API stopped, after a private production.env backup.
// Reads existing accounts; never creates/resets users, passwords or keys.
import {readFile,writeFile,rename,chmod} from 'node:fs/promises';
const directory='/app/.local',envFile=directory+'/production.env';
const current=await readFile(envFile,'utf8'),access=await readFile(directory+'/production-access.txt','utf8');
const tenant=access.split('\n').find(l=>l.startsWith('组织ID: '))?.slice('组织ID: '.length).trim();
if(!tenant||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenant))throw new Error('Existing production login scope is unavailable');
const prior=current.match(/^DEFAULT_TENANT_ID=(.*)$/m)?.[1].trim();
if(prior&&prior!==tenant)throw new Error('Existing login scope conflicts; no change applied');
if(!prior){
 const temporary=envFile+'.scope-update';
 await writeFile(temporary,current.replace(/\s*$/,'')+'\nDEFAULT_TENANT_ID='+tenant+'\n',{flag:'wx',mode:0o600});
 await chmod(temporary,0o600);await rename(temporary,envFile);
 console.log('Existing production login scope pinned privately; credentials and key preserved.');
}else console.log('Existing login scope preserved.');
