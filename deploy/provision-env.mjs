import {existsSync,writeFileSync,chmodSync,chownSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const env='/shared/production.env';
if(!existsSync(env)){
 if(existsSync('/shared/database'))throw new Error('Existing database without encryption configuration: refusing to generate a replacement key');
 writeFileSync(env,`NODE_ENV=production\nSINGLE_INSTANCE_HTTPS=1\nPUBLIC_ORIGIN=https://rc.iqilun.cn\nH5_ORIGIN=https://rc.iqilun.cn\nPORT=43130\nLISTEN_HOST=127.0.0.1\nDATA_DIR=/app/.local/database\nCONTACT_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\n`,{flag:'wx',mode:0o600});
 chmodSync(env,0o600);chownSync(env,1000,1000);console.log('Created dedicated production configuration; key not displayed.');
}else console.log('Existing production configuration preserved.');
