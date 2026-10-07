import {z} from 'zod';
import rules from './data/gh-server-rules.json' with {type:'json'};
import audit from './data/gh-v6-audit.json' with {type:'json'};

/** Version-pinned evidence replay, not a hiring/matching or formal-report engine. */
export const ghEvidenceVersion='gh-server-evidence-20260930-v1';
export const ghEvidenceInput=z.object({
 version:z.literal(ghEvidenceVersion),
 purpose:z.literal('evidence_verification_only'),
 input_kind:z.enum(['synthetic','manual_answers']),
 answers:z.record(z.string().regex(/^\d+$/),z.number().int().min(1).max(5)),
 values:z.array(z.object({id:z.string().regex(/^\d+$/),rank:z.number().int().min(1).max(10)}).strict()).length(10),
}).strict();
export type GhEvidenceInput=z.infer<typeof ghEvidenceInput>;
/** Latest material gaps; the old v6 audit above remains an immutable stage record. */
export const ghEvidenceGaps=[
 {id:'GAP_SENIOR_COMPLETE_RESPONSE',title:'同一次测评的完整高级报告',detail:'需要真实非空body.datas和版本锚点，不能拿不同人的片段拼成完整报告。当前6份答卷的基础分与校准分已回归，性格和角色仅一个完整样本。',files:['同次完整答案、完整senior响应、对应数据报告及10页人才报告','题库、配置、模板与程序版本或时间']},
 {id:'GAP_HISTORICAL_MODEL_TRUE_INPUTS',title:'17个旧岗位模型当时真实输入',detail:'当前矩阵拟合或替代成员不能证明原来使用的成员和分数；历史真实状态仍未恢复。',files:['各模型创建/编辑请求、当时成员名单、当时分数快照','覆盖创建/编辑时间的备份或binlog']},
 {id:'GAP_REPORT_RUNTIME_BRANCHES',title:'48种报告情况的真实运行结果',detail:'55个条件分支中7个有运行证据，其余48个仍停留在源码层；需要逐类实际返回，不是再发一遍源码。',files:['未覆盖分支的同次输入、实际报告响应及版本标识']},
 {id:'GAP_2025_DEPLOYED_REVISION',title:'2025版PDF对应的软件版本',detail:'保留了2025版型与颜色，但不能假定当前New计算配置就是当时部署的版本。',files:['部署记录→源码revision→程序文件SHA256对应链','同版本计分配置和报告模板']},
 {id:'GAP_ROLEFORALL_ANOMALY_CAUSE',title:'一次旧角色分数异常的原因',detail:'一条旧roleForAll数值与当前公式不一致，缺当时真实行值和造成差异的过程。',files:['该次完整响应及角色表原始行','异常前后日志、版本、配置或binlog']},
];

export function ghEvidenceCatalog(){return {
 version:ghEvidenceVersion,audit,gaps:ghEvidenceGaps,
 choices:{paired:['A非常符合','A比较符合','中立','B比较符合','B非常符合'],single:['完全符合','多数符合','一般符合','偶尔符合','完全不符']},
 values:rules.values,
 value_flow:'64词配置；归档页面显示32词，4组各选5 → 20选10 → 10项排序。此试算只校验提交后的10个题号与rank，不假定每次分组相同。',
 trial_available:true,formal_report_available:false,formal_match_available:false,
};}
export type GhEvidenceCatalog=ReturnType<typeof ghEvidenceCatalog>;

export function ghSyntheticInput():GhEvidenceInput{return {
 version:ghEvidenceVersion,purpose:'evidence_verification_only',input_kind:'synthetic',
 answers:Object.fromEntries(rules.questions.map(q=>[q.id,3])),
 values:rules.values.slice(0,10).map((q,i)=>({id:q.id,rank:i+1})),
};}

export function scoreGhFirstLayer(raw:unknown){
 const input=ghEvidenceInput.parse(raw);
 const questionIds=new Set(rules.questions.map(q=>q.id));
 if(Object.keys(input.answers).length!==277||Object.keys(input.answers).some(id=>!questionIds.has(id)))throw new Error('必须提交本版本全部277题，不能混入外部180题或未知题号。');
 const valueIds=new Set(rules.values.map(q=>q.id));
 if(new Set(input.values.map(v=>v.id)).size!==10||new Set(input.values.map(v=>v.rank)).size!==10||input.values.some(v=>!valueIds.has(v.id)))throw new Error('价值观需10个不同的有效题号，名次1–10不得重复。');
 const totals=new Map<string,number>(),counts=new Map<string,number>();
 const key=(type:number,item:number)=>`${type}:${item}`;
 // Scale by 10,000: quarter-points × two-decimal coefficients are exact integers.
 // Rounding only occurs at presentation, not at each contribution.
 const add=(type:number,item:number,units:number)=>{
  if(!item)return;
  const k=key(type,item);totals.set(k,(totals.get(k)??0)+units);counts.set(k,(counts.get(k)??0)+1);
 };
 const coefficients=rules.type3_multipliers_hundredths as Record<string,number>;
 const contributions=rules.questions.map(q=>{
  const choice=input.answers[q.id],scores=q.scores[choice-1];
  const parts=[q.item,q.opposite].flatMap((item,i)=>{
   if(!item)return [];
   const multiplier=q.type===3?(coefficients[String(item)]??150):100;
   const units=Math.round(scores[i]*100)*multiplier;add(q.type,item,units);
   return [{item,base_add:scores[i],multiplier:multiplier/100,add:units/10000}];
  });
  return {question_id:q.id,type:q.type,choice,parts};
 });
 const valueContributions=input.values.map(v=>{
  const q=rules.values.find(q=>q.id===v.id)!,points=rules.rank_points[v.rank-1];add(5,q.item,points*10000);
  return {question_id:v.id,rank:v.rank,item:q.item,add:points};
 });
 const rows=rules.items.filter(i=>[2,3,4,5].includes(i.type)).map(i=>({
  type:i.type,item:i.id,name:i.name,ename:i.ename,
  score:(totals.get(key(i.type,i.id))??0)/10000,
  contributing_questions:counts.get(key(i.type,i.id))??0,
 })).sort((a,b)=>a.type-b.type||a.item-b.item);
 return {
  version:ghEvidenceVersion,kind:'gh_first_layer_evidence_trial' as const,input_kind:input.input_kind,
  formal_score:false,exact_replica_ready:false,recruitment_decision_allowed:false,persisted_as_person_report:false,
  rows,contributions,value_contributions:valueContributions,
  limitations:[
   '仅为指定20260930证据版本的第一层项目分，不是百分位、完整报告或岗位适合度。',
   '277题全部必答；服务端type2/3/4分别153/60/64题，与页面模块划分不同。',
   '只核验10项价值观提交排序；未重建每次实际展示的32词分组及选择过程。',
   '未生成type16、角色校准、星级、解释文本、个人PDF或岗位匹配；原报告留白不自动填入这些基础分。',
   '不用于自动招聘排序、录用、淘汰或岗位安排；只用于规则核验与本人发展沟通。',
  ],
 };
}
export type GhFirstLayerTrial=ReturnType<typeof scoreGhFirstLayer>;
