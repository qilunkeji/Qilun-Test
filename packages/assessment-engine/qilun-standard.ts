import rulebook from './data/qilun-standard-v1.json' with {type:'json'};
import {scoreGhInferredReport,ghInferenceVersion} from './gh-inference.ts';
import type {GhInverseModel,GhInferredReport} from './gh-inference.ts';

export const qilunStandardVersion='qilun-internal-assessment/1.0.0';
export const qilunStandardRulebook=rulebook;
export type QilunStandardReport=Omit<GhInferredReport,'version'|'kind'|'inference'|'limitations'> & {
 version:typeof qilunStandardVersion;
 kind:'qilun_standard_development_result';
 product:{version:typeof qilunStandardVersion;rules_fingerprint:string;ability_count:28;abilities_basis:'fixed_model_reference';runtime_training:false;runtime_ai_generation:false};
 inference:{outside_observed_domain:boolean;exact_original_result:false};
 limitations:string[];
};
/** A frozen evaluator, not a per-person training or generative-AI workflow.
 * Artifact verification is done by the server's trusted read-only loader. */
export function scoreQilunStandard(input:Parameters<typeof scoreGhInferredReport>[0],model:GhInverseModel,verified:{model_hash:string;rules_fingerprint:string}):QilunStandardReport{
 if(verified.model_hash!==rulebook.model_sha256||!/^[a-f0-9]{64}$/.test(verified.rules_fingerprint)||model.version!==rulebook.inference_version||model.gamma!==rulebook.gamma||model.linear_weight!==rulebook.linear_weight||model.support.length!==rulebook.support_count)throw new Error('STANDARD_RULES_MISMATCH');
 const calculated=scoreGhInferredReport(input,model);
 const {inference,limitations:_legacyLimitations,...result}=calculated;
 return {...result,version:qilunStandardVersion,kind:'qilun_standard_development_result',
  product:{version:qilunStandardVersion,rules_fingerprint:verified.rules_fingerprint,ability_count:28,abilities_basis:'fixed_model_reference',runtime_training:false,runtime_ai_generation:false},
  // Calibration counts, errors, coefficients and training artifacts belong to
  // the lead-only rulebook, not the respondent's standard report payload.
  inference:{outside_observed_domain:inference.outside_observed_domain,exact_original_result:false},
  limitations:[rulebook.public_note,...(inference.outside_observed_domain?['本次能力画像参考性较低，请结合实际经历核对。']:[])],
 };
}
export function isQilunStandardReport(r:unknown):r is QilunStandardReport{return !!r&&typeof r==='object'&&'kind' in r&&r.kind==='qilun_standard_development_result';}
export function standardInferenceInput(input:Record<string,unknown>){return {...input,version:ghInferenceVersion,purpose:'development_reference_only'};}
