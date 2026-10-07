// Supply the existing IAM project, or an isolated installation of these pinned
// official registry dependencies. This builds only the server-side artifact.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const dependencyRoot=process.argv[2];if(!dependencyRoot)throw new Error('Supply the IAM dependency directory');
for(const [name,version] of [['openid-client','6.8.1'],['oauth4webapi','3.8.8']]){
 const metadata=JSON.parse(await readFile(resolve(dependencyRoot,'node_modules',name,'package.json'),'utf8'));
 if(metadata.version!==version)throw new Error('IAM dependency version mismatch');
}
const {build}=await import(pathToFileURL(resolve(dependencyRoot,'node_modules/esbuild/lib/main.js')).href);
await build({entryPoints:['packages/iam/client.mjs'],outfile:'packages/iam/vendor/iam-client.mjs',bundle:true,platform:'node',target:'node24',format:'esm',legalComments:'eof',alias:{'openid-client':resolve(dependencyRoot,'node_modules/openid-client/build/index.js')}});
