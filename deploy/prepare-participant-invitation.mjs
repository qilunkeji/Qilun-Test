// Private overlay only; activation clones the current production release first.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,copyFile,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
const id=process.argv[2];assert.match(id??'',/^\d{8}-participant-invitation-v\d+$/);
assert.equal(execFileSync('git',['diff','--name-only','HEAD'],{encoding:'utf8'}).trim(),'');
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),destination=resolve('.local/deploy',id);
await mkdir(destination); // Never overwrite a release or archive.
const files=execFileSync('git',['diff','--name-only','e64ad73','HEAD','--','apps/admin-web/src','apps/api/public-entry-routes.ts','tests/public-entry.test.ts','deploy/activate-participant-invitation.sh','deploy/verify-qilun-public.mjs'],{encoding:'utf8'}).trim().split('\n');
for(const file of files)assert.match(file,/^(apps\/admin-web\/src\/|apps\/api\/public-entry-routes\.ts$|tests\/public-entry\.test\.ts$|deploy\/(activate-participant-invitation\.sh|verify-qilun-public\.mjs)$)/);
assert.ok(files.includes('deploy/activate-participant-invitation.sh'));assert.ok(files.includes('apps/api/public-entry-routes.ts'));
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const file=dir+'/'+e.name;if(e.isDirectory())await walk(file);else{assert.ok(e.isFile());files.push(file);}}}
await walk('dist');files.sort();
for(const file of files){assert.ok(!/(^|\/)\.env|\.token$|(^|\/)\.local\//.test(file));await mkdir(dirname(resolve(destination,file)),{recursive:true});await copyFile(file,resolve(destination,file));}
const archive=destination+'.tgz';execFileSync('tar',['--no-xattrs','-czf',archive,'-C',destination,'-T','-'],{input:files.join('\n')+'\n',env:{...process.env,COPYFILE_DISABLE:'1'}});
const manifest={release:id,commit,archive,sha256:createHash('sha256').update(await readFile(archive)).digest('hex'),files:files.length,deployed:false};
await writeFile(destination+'.manifest.json',JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify(manifest,null,2));
