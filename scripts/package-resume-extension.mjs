// Only extension code/installation instructions; no env, DB, credentials or fixtures.
import {mkdir,readFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const files=['manifest.json','background.js','panel.html','panel.css','panel.js','README.txt'],out=resolve('output/resume-extension/qilun-resume-extension-0.1.0');await mkdir(out,{recursive:true});
for(const file of files)await copyFile(resolve('apps/resume-extension',file),resolve(out,file));
const zip=resolve('output/resume-extension/qilun-resume-extension-0.1.0.zip');
execFileSync('/usr/bin/zip',['-q','-j',zip,...files.map(f=>resolve(out,f))]);
console.log(JSON.stringify({zip,files,sha256:createHash('sha256').update(await readFile(zip)).digest('hex'),deployed:false}));
