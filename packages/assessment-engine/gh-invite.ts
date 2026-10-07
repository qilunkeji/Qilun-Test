import {z} from 'zod';
import bank from './data/question-bank-277.json' with {type:'json'};
import {ghReplayCatalog,validateGhValueFlow,scoreGhReportReplay,ghReplayVersion} from './gh-derived.ts';
import {ghEvidenceCatalog} from './gh-server-evidence.ts';
import {ghInferenceVersion,scoreGhInferredReport} from './gh-inference.ts';
import type {GhInverseModel,GhDisplayReport} from './gh-inference.ts';
import {qilunStandardVersion,qilunStandardRulebook,scoreQilunStandard,standardInferenceInput} from './qilun-standard.ts';

export const ghInviteVersion='qilun-277-reference/1.0.0';
export function ghInvitePackage(modelHash:string|null=null){
 const c=ghReplayCatalog(),b=ghEvidenceCatalog();
 return {kind:'gh_reference_277' as const,version:ghInviteVersion,title:'齐论AI · 277题发展参考测评',consent_version:'qilun-277-reference-consent/1',
  notice:'自愿参与的发展参考测评，不是原版全同认证或录用测试。已知规则计算风格、性格、动机、价值观、角色与优势；能力未启用时留白，启用后为历史数据拟合估计。不用于自动招聘排名、淘汰或岗位安排。答案、价值观选择与参考结果将按邀请用途保存。',
  estimate_abilities:!!modelHash,model_hash:modelHash,scoring_version:ghReplayVersion,
  questions:bank.questions.map(({id,order,module,answer_type,title,a,b})=>({id,order,module,answer_type,title,a,b})),
  choices:b.choices,value_groups:c.value_groups,words:b.values.filter(v=>c.value_groups.flat().includes(v.id)).map(({id,title,description})=>({id,title,description})),
  layout:c.value_layout,
 };
}
export function qilunStandardInvitePackage(rules:{model_hash:string;rules_fingerprint:string}){
 if(rules.model_hash!==qilunStandardRulebook.model_sha256||!/^[a-f0-9]{64}$/.test(rules.rules_fingerprint))throw new Error('STANDARD_RULES_MISMATCH');
 return {...ghInvitePackage(rules.model_hash),version:qilunStandardVersion,title:qilunStandardRulebook.title,consent_version:'qilun-internal-assessment-consent/1.0.0',notice:qilunStandardRulebook.public_note,
  rule_profile:{version:qilunStandardVersion,fingerprint:rules.rules_fingerprint,abilities:'required' as const},
 };
}
export type GhInvitePackage=ReturnType<typeof ghInvitePackage>|ReturnType<typeof qilunStandardInvitePackage>;
export const ghValueDraftSchema=z.object({selected:z.array(z.array(z.string()).max(5)).length(4),ranked:z.array(z.string()).max(10)}).strict();
export type GhValueDraft=z.infer<typeof ghValueDraftSchema>;
export const emptyGhValues=():GhValueDraft=>({selected:[[],[],[],[]],ranked:[]});
export function validateGhInviteDraft(pkg:GhInvitePackage,answers:Record<string,number>,raw:unknown,complete=false){
 if(![ghInviteVersion,qilunStandardVersion].includes(pkg.version)||pkg.scoring_version!==ghReplayVersion)throw new Error('测评版本不匹配，请联系邀请人重新邀请。');
 if(pkg.version===qilunStandardVersion&&(!('rule_profile' in pkg)||pkg.rule_profile.version!==qilunStandardVersion||pkg.rule_profile.abilities!=='required'||!/^[a-f0-9]{64}$/.test(pkg.rule_profile.fingerprint)||!pkg.estimate_abilities||pkg.model_hash!==qilunStandardRulebook.model_sha256))throw new Error('测评规则快照不匹配，请联系邀请人。');
 const ids=new Set(pkg.questions.map(q=>q.id));
 if(Object.entries(answers).some(([id,v])=>!ids.has(id)||!Number.isInteger(v)||v<1||v>5)||complete&&Object.keys(answers).length!==277)throw new Error('请答完本版本277题，每题选择一个选项。');
 const v=ghValueDraftSchema.parse(raw);
 if(v.selected.some((g,i)=>new Set(g).size!==g.length||g.some(id=>!pkg.value_groups[i].includes(id)))||new Set(v.ranked).size!==v.ranked.length||v.ranked.some(id=>!v.selected.flat().includes(id)))throw new Error('价值观选择与排序不一致。');
 if(complete)validateGhValueFlow({layout:pkg.layout,selected_by_group:v.selected,ranked:v.ranked});
 return v;
}
export type GhInviteReport={kind:'qilun_277_invite_reference';version:string;persisted_as_person_reference:true;formal_score:false;recruitment_decision_allowed:false;result:GhDisplayReport};
export function scoreGhInvite(pkg:GhInvitePackage,answers:Record<string,number>,v:GhValueDraft,model?:GhInverseModel,standard?:{model_hash:string;rules_fingerprint:string}):GhInviteReport{
 validateGhInviteDraft(pkg,answers,v,true);
 const common={input_kind:'manual_answers',answers,values:v.ranked.map((id,i)=>({id,rank:i+1})),value_flow:{layout:pkg.layout,selected_by_group:v.selected,ranked:v.ranked}};
 if(pkg.version===qilunStandardVersion){
  if(!model||!standard||!('rule_profile' in pkg)||pkg.rule_profile.fingerprint!==standard.rules_fingerprint)throw new Error('本次邀请对应的固定测评规则不可用，未生成结果。');
  return {kind:'qilun_277_invite_reference',version:pkg.version,persisted_as_person_reference:true,formal_score:false,recruitment_decision_allowed:false,result:scoreQilunStandard(standardInferenceInput(common),model,standard)};
 }
 const result=pkg.estimate_abilities
  ? (model?scoreGhInferredReport({...common,version:ghInferenceVersion,purpose:'development_reference_only'},model):(()=>{throw new Error('本次邀请对应的推算模型不可用。');})())
  :scoreGhReportReplay({...common,version:ghReplayVersion,purpose:'evidence_verification_only'});
 return {kind:'qilun_277_invite_reference',version:pkg.version,persisted_as_person_reference:true,formal_score:false,recruitment_decision_allowed:false,result};
}
