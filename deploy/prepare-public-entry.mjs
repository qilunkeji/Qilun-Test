// Local preparation only: no SSH, remote deployment, credentials, or production DB.
// Run after build/tests and the final local Git commit.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,copyFile,readFile,readdir,symlink,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
const root=process.cwd(),id=process.argv[2];assert.match(id??'',/^\d{8}-public-entry-v\d+$/);
assert.equal(execFileSync('git',['diff','--name-only','HEAD'],{encoding:'utf8'}).trim(),'','Commit tracked work before preparation');
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),destination=resolve('.local/deploy',id);
await mkdir(dirname(destination),{recursive:true});await mkdir(destination); // Exclusive release, never overwrite.
let files=execFileSync('git',['ls-files','-z','apps','packages','infra','deploy','tests/helpers','package.json','package-lock.json'],{encoding:'utf8'}).split('\0').filter(Boolean);
files.push('tests/project-assessments.test.ts','tests/public-entry.test.ts');
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())await walk(p);else if(e.isFile())files.push(p);else throw Error('Unexpected build symlink');}}
await walk('dist');files=files.sort();assert.ok(files.includes('deploy/activate-public-entry.sh'));
for(const file of files){assert.ok(!/(^|\/)\.env|\.token$|(^|\/)\.local\//.test(file));await mkdir(dirname(resolve(destination,file)),{recursive:true});await copyFile(file,resolve(destination,file));}
await mkdir(resolve(destination,'.local/gh-inference-v1'),{recursive:true});
await symlink(resolve(root,'node_modules'),resolve(destination,'node_modules'));
await symlink(resolve(root,'.local/gh-inference-v1/model.json'),resolve(destination,'.local/gh-inference-v1/model.json'));
// These two local-only links are never in the archive.
const archive=destination+'.tgz';execFileSync('tar',['-czf',archive,'-C',destination,'-T','-'],{input:files.join('\n')+'\n'});
const sha256=createHash('sha256').update(await readFile(archive)).digest('hex');
const manifest={release:id,commit,archive,sha256,files:files.length,candidate:destination,deployed:false,private_symlinks_excluded:true};
await writeFile(destination+'.manifest.json',JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
console.log(JSON.stringify(manifest,null,2));
