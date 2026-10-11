import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {digest} from '@qilun/security/index.ts';
import {validateGhInverseModel} from '@qilun/assessment-engine/gh-inference.ts';
import type {GhInverseModel} from '@qilun/assessment-engine/gh-inference.ts';
import {qilunStandardRulebook,qilunStandardVersion} from '@qilun/assessment-engine/qilun-standard.ts';

export type AssessmentRuntime={legacy?:{model:GhInverseModel;hash:string};standard?:{model:GhInverseModel;model_hash:string;rules_fingerprint:string};problem?:string};
function freeze<T>(value:T):T{
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;
}
/** Fail closed for new standard invitations. Preserve the historical evaluator
 * for old snapshots; never retrain or silently swap parameters on submission. */
export function loadAssessmentRuntime(root=process.cwd()):AssessmentRuntime{
 let legacy:AssessmentRuntime['legacy'];
 try{const raw=readFileSync(resolve(root,'.local/gh-inference-v1/model.json'),'utf8');legacy={model:freeze(validateGhInverseModel(JSON.parse(raw))),hash:digest(raw)};}catch{return {problem:'STANDARD_MODEL_UNAVAILABLE'};}
 try{
  const r=qilunStandardRulebook;
  if(r.version!==qilunStandardVersion||legacy.hash!==r.model_sha256||legacy.model.gamma!==r.gamma||legacy.model.linear_weight!==r.linear_weight||legacy.model.support.length!==r.support_count)throw new Error('STANDARD_MODEL_MISMATCH');
  const artifacts=Object.entries(r.artifacts);
  if(artifacts.length<10)throw new Error('STANDARD_RULEBOOK_INCOMPLETE');
  for(const [file,hash] of artifacts)if(digest(readFileSync(resolve(root,file),'utf8'))!==hash)throw new Error('STANDARD_ENGINE_MISMATCH');
  return {legacy,standard:{model:legacy.model,model_hash:legacy.hash,rules_fingerprint:digest(JSON.stringify(r))}};
 }catch(error){return {legacy,problem:(error as Error).message};}
}
