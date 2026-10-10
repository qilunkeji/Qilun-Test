// Private overlay only; activation clones the current production release first.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,copyFile,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
const id=process.argv[2];assert.match(id??'',/^\d{8}-assessment-page-focus-v\d+$/);
assert.equal(execFileSync('git',['diff','--name-only','HEAD'],{encoding:'utf8'}).trim(),'');
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),destination=resolve('.local/deploy',id);
await mkdir(destination); // Never overwrite a release or archive.
const files=execFileSync('git',['diff','--name-only','4bc43e3','HEAD','--','apps/admin-web/src','apps/api/invite-routes.ts','tests/project-assessments.test.ts','tests/h5-render.test.ts','deploy/activate-assessment-page-focus.sh'],{encoding:'utf8'}).trim().split('\n');
for(const file of files)assert.match(file,/^(apps\/admin-web\/src\/|apps\/api\/invite-routes\.ts$|tests\/(project-assessments|h5-render)\.test\.ts$|deploy\/activate-assessment-page-focus\.sh$)/);
assert.ok(files.includes('deploy/activate-assessment-page-focus.sh'));assert.ok(files.includes('apps/api/invite-routes.ts'));
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const file=dir+'/'+e.name;if(e.isDirectory())await walk(file);else{assert.ok(e.isFile());files.push(file);}}}
await walk('dist');files.sort();
for(const file of files){assert.ok(!/(^|\/)\.env|\.token$|(^|\/)\.local\//.test(file));await mkdir(dirname(resolve(destination,file)),{recursive:true});await copyFile(file,resolve(destination,file));}
const archive=destination+'.tgz';execFileSync('tar',['-czf',archive,'-C',destination,'-T','-'],{input:files.join('\n')+'\n'});
const manifest={release:id,commit,archive,sha256:createHash('sha256').update(await readFile(archive)).digest('hex'),files:files.length,deployed:false};
await writeFile(destination+'.manifest.json',JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify(manifest,null,2));
