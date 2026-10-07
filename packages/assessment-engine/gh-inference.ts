import {z} from 'zod';
import {ghReplayInput,ghReplayVersion,scoreGhReportReplay,ghReplayCatalog,deriveGhPotentialGroups,halfUp} from './gh-derived.ts';
import type {GhReportReplay} from './gh-derived.ts';
import cfg from './data/gh-derived-rules-v22.json' with {type:'json'};
import type {QilunStandardReport} from './qilun-standard.ts';

export const ghInferenceVersion='qilun-gh-inverse-v1';
export const ghInferenceInput=ghReplayInput.extend({version:z.literal(ghInferenceVersion),purpose:z.literal('development_reference_only')}).strict();
// Exactly the archived configuration order, not chart rank or translated names.
const baseItems=cfg.items.filter(i=>i.type===4||i.type===5);
export const ghInferenceFeatureKeys=[...Array.from({length:8},(_,i)=>351+i).flatMap(id=>['scoreB','scoreC','scoreD','scoreNotion'].map(k=>`role.${id}.${k}`)),...baseItems.map(i=>`base.${i.type}.${i.id}`)];
export const ghInferenceQualityIds=ghReplayCatalog().quality_items.map(i=>i.id).sort((a,b)=>a-b);
export function ghInferenceFeatures(r:GhReportReplay){
 const out=[...Array.from({length:8},(_,i)=>351+i).flatMap(id=>{
  const role=r.roles.find(x=>x.item===id);if(!role)throw new Error('INFERENCE_ROLE_MISSING');
  return [role.scoreB,role.scoreC,role.scoreD,role.scoreNotion];
 }),...baseItems.map(i=>{const row=r.rows.find(r=>r.type===i.type&&r.item===i.id);if(!row)throw new Error('INFERENCE_BASE_MISSING');return row.score;})];
 if(out.length!==48||!out.every(Number.isFinite))throw new Error('INFERENCE_FEATURES_INVALID');
 return out;
}
export type InverseMetric={samples:number;cells:number;exact_display_rate:number;within_one_rate:number;mean_absolute_error:number;p95_absolute_error:number;max_absolute_error:number;all_28_exact_rate:number};
export type InverseSummary={version:string;audit:Record<string,unknown>;selected_method:string;validation:InverseMetric;holdout:InverseMetric;answer_chain:InverseMetric;per_item_holdout:{item:number;exact_display_rate:number;mean_absolute_error:number;p95_absolute_error:number}[];historical_replica_verified:false;recruitment_decision_allowed:false;limitations:string[]};
export type GhInverseModel={version:string;feature_keys:string[];quality_ids:number[];mean:number[];scale:number[];support:number[][];coefficients:number[][];target_mean:number[];gamma:number;linear_weight:number;max_training_nearest_distance:number;summary:InverseSummary};
const clip=(x:number)=>Math.max(0,Math.min(100,x));
const validMetric=(m:InverseMetric)=>m&&Number.isInteger(m.samples)&&m.samples>0&&m.cells===m.samples*28&&[m.exact_display_rate,m.within_one_rate,m.all_28_exact_rate].every(x=>Number.isFinite(x)&&x>=0&&x<=1)&&[m.mean_absolute_error,m.p95_absolute_error,m.max_absolute_error].every(x=>Number.isFinite(x)&&x>=0&&x<=100);
export function validateGhInverseModel(m:GhInverseModel){
 const f=48,t=28;
 const numbers=(a:unknown,n:number):a is number[]=>Array.isArray(a)&&a.length===n&&a.every(x=>typeof x==='number'&&Number.isFinite(x));
 if(m.version!==ghInferenceVersion||JSON.stringify(m.feature_keys)!==JSON.stringify(ghInferenceFeatureKeys)||JSON.stringify(m.quality_ids)!==JSON.stringify(ghInferenceQualityIds)||!numbers(m.mean,f)||!numbers(m.scale,f)||m.scale.some(x=>x<=0)||!numbers(m.target_mean,t)||!Number.isFinite(m.gamma)||m.gamma<=0||!Number.isFinite(m.linear_weight)||m.linear_weight<0||!Number.isFinite(m.max_training_nearest_distance)||m.max_training_nearest_distance<=0||!Array.isArray(m.support)||m.support.length<2||m.support.length>5000||!m.support.every(x=>numbers(x,f))||!Array.isArray(m.coefficients)||m.coefficients.length!==m.support.length||!m.coefficients.every(x=>numbers(x,t))||m.summary?.version!==ghInferenceVersion||m.summary.historical_replica_verified!==false||m.summary.recruitment_decision_allowed!==false)throw new Error('INFERENCE_MODEL_INVALID');
 if(!m.summary.audit||typeof m.summary.audit!=='object'||Array.isArray(m.summary.audit)||![m.summary.validation,m.summary.holdout,m.summary.answer_chain].every(validMetric)||!Array.isArray(m.summary.per_item_holdout)||m.summary.per_item_holdout.length!==28||m.summary.per_item_holdout.some((r,i)=>r.item!==m.quality_ids[i]||!Number.isFinite(r.mean_absolute_error)||r.mean_absolute_error<0||r.mean_absolute_error>100||!Number.isFinite(r.p95_absolute_error)||r.p95_absolute_error<0||r.p95_absolute_error>100||!Number.isFinite(r.exact_display_rate)||r.exact_display_rate<0||r.exact_display_rate>1))throw new Error('INFERENCE_SUMMARY_INVALID');
 return m;
}
/** Explicit public allowlist: a future private training artifact may contain
 * IDs or diagnostics. None can be spread into a browser response by accident. */
export function ghPublicInverseSummary(m:GhInverseModel):InverseSummary{
 const s=m.summary,keys=['quality_people','quality_rows','role_people','eligible_intermediate_pairs','independent_input_groups','duplicate_input_rows','same_input_conflicting_outputs_groups','completion_pairing_window_seconds','max_base_writing_duration_seconds','all_base_and_derived_rows_within_120_seconds','feature_count','target_count','known_questionnaire_pairs'];
 const cleanMetric=(r:InverseMetric):InverseMetric=>({samples:r.samples,cells:r.cells,exact_display_rate:r.exact_display_rate,within_one_rate:r.within_one_rate,mean_absolute_error:r.mean_absolute_error,p95_absolute_error:r.p95_absolute_error,max_absolute_error:r.max_absolute_error,all_28_exact_rate:r.all_28_exact_rate});
 return {version:ghInferenceVersion,audit:Object.fromEntries(keys.filter(k=>typeof s.audit[k]==='number'&&Number.isFinite(s.audit[k])).map(k=>[k,s.audit[k]])),selected_method:`RBF+linear kernel ridge; gamma=${m.gamma}`,validation:cleanMetric(s.validation),holdout:cleanMetric(s.holdout),answer_chain:cleanMetric(s.answer_chain),per_item_holdout:s.per_item_holdout.map(r=>({item:r.item,exact_display_rate:r.exact_display_rate,mean_absolute_error:r.mean_absolute_error,p95_absolute_error:r.p95_absolute_error})),historical_replica_verified:false,recruitment_decision_allowed:false,limitations:['数据库中间分项配对不是完整高级报告实返；历史部署版本未锁定。','原AgType8Map尚未恢复，28项是统计拟合估计。','完整答卷链只有6份且有重建/版本风险；不代表人群效度或招聘预测准确率。']};
}
export function predictGhAbility(m:GhInverseModel,x:number[]){
 if(x.length!==48||!x.every(Number.isFinite))throw new Error('INFERENCE_FEATURES_INVALID');
 const z=x.map((v,i)=>(v-m.mean[i])/m.scale[i]);
 const predicted=[...m.target_mean];let distance=Infinity;
 m.support.forEach((s,row)=>{
  let d=0,dot=0;for(let i=0;i<48;i++){d+=(s[i]-z[i])**2;dot+=s[i]*z[i];}
  distance=Math.min(distance,d/48);
  const k=Math.exp(-m.gamma*d/48)+m.linear_weight*dot/48;
  for(let j=0;j<28;j++)predicted[j]+=k*m.coefficients[row][j];
 });
 if(!predicted.every(Number.isFinite))throw new Error('INFERENCE_PREDICTION_INVALID');
 return {values:predicted.map(clip),nearest_distance:distance,outside_observed_domain:distance>m.max_training_nearest_distance};
}
export function scoreGhInferredReport(raw:unknown,model:GhInverseModel){
 const input=ghInferenceInput.parse(raw);
 const replay=scoreGhReportReplay({...input,version:ghReplayVersion,purpose:'evidence_verification_only'});
 const prediction=predictGhAbility(model,ghInferenceFeatures(replay));
 const abilities=model.quality_ids.map((item,i)=>{
  const definition=ghReplayCatalog().quality_items.find(x=>x.id===item)!;
  return {item,name:definition.name,parent:definition.parent,value:halfUp(prediction.values[i]),unrounded_prediction:prediction.values[i],origin:'empirical_inverse_estimate' as const};
 });
 const ordered=[...abilities].sort((a,b)=>b.value-a.value||a.parent-b.parent||a.item-b.item);
 return {...replay,version:ghInferenceVersion,kind:'qilun_inverse_development_reference' as const,abilities,
  ability_summary:{top_six:ordered.slice(0,6),bottom_three:ordered.slice(-3),groups:cfg.items.filter(i=>i.type===8&&i.parent===0).map(i=>{const rows=abilities.filter(a=>a.parent===i.id);return {item:i.id,name:i.name,value:halfUp(rows.reduce((s,r)=>s+r.value,0)/rows.length)};}),...deriveGhPotentialGroups(abilities.map(r=>({item:r.item,value:r.value}))),source:'estimated_type8_values' as const,evidence_grade:'ESTIMATED_INPUTS_WITH_KNOWN_GROUP_FORMULA' as const},
  inference:{...ghPublicInverseSummary(model),nearest_distance:prediction.nearest_distance,outside_observed_domain:prediction.outside_observed_domain,exact_original_result:false,output_basis:'已知原公式＋同窗中间分项与28项原版数据库分数的拟合' as const},
  formal_score:false,persisted_as_person_report:false,recruitment_decision_allowed:false,
  limitations:['28项能力是依据历史结果反推的估计，未恢复AgType8Map原权重。独立验证结果见本页，不声明99%或完全一致。',prediction.outside_observed_domain?'当前答卷超出已观察的中间分项邻域，估计不可靠，仅供核验。':'本次处于已观察的中间分项邻域；相似输入仍不能保证原版结果相同。',...replay.limitations.filter(x=>!x.includes('答案→28项'))],
 };
}
export type GhInferredReport=ReturnType<typeof scoreGhInferredReport>;
export type GhDisplayReport=GhReportReplay|GhInferredReport|QilunStandardReport;
