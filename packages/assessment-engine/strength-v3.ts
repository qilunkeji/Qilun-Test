import {z} from 'zod';
import evidence from './data/strength-v3.json' with {type:'json'};
import replay from './data/strength-replay-summary.json' with {type:'json'};
import fullQuestionBank from './data/question-bank-277.json' with {type:'json'};
import {ghEvidenceGaps} from './gh-server-evidence.ts';

export const replicaVersion = 'evidence-v3-20260922';
export const replicaModes = ['ghrczx_strength_153','external_strength_180_v3'] as const;
export type ReplicaMode = typeof replicaModes[number];
export const replicaChoices = ['A非常符合','A比较符合','中立','B比较符合','B非常符合'];
export const replicaScoreInput = z.object({
 version:z.literal(replicaVersion), mode:z.enum(replicaModes),
 answers:z.record(z.string(),z.number().int().min(1).max(5)),
}).strict();

const abilityNames=['团队领导能力','辅导培养能力','影响说服能力','组织协调能力','沟通能力','人际关系维系','团队合作','战略规划能力','决策能力','创新能力','逻辑性','总结能力','领悟能力','上进心','抗压性','坚韧性','自控性','自信心','大局观','好胜性','结果导向','服务意识','落地执行力','细节处理能力','灵活应变能力','尽责性','原则性','开拓能力'];
export const replicaGaps = ghEvidenceGaps;

export function replicaCatalog(){
 return {
  version:replicaVersion, exact_replica_ready:false, choices:replicaChoices,
  packages:[
   {id:replicaModes[0],title:'职业优势 · 153题原文',questions:evidence.targetQuestions,scoring_available:false,source:'原题目对照表中的gh_A/gh_B及eqid；未用外部题干替换',description:'保留原153题模块答卷工具，不在此生成正式报告；完整277题计算请使用10月补充入口。'},
   {id:replicaModes[1],title:'外部同源优势 · 180题证据试算',questions:evidence.externalQuestions,scoring_available:true,source:'yuzeli取题响应与Book118/运行时v3表',description:'执行v3表并对照两种分母。历史回放存在反例，结果仅供核验。'},
  ],
  sections:[
   {number:'1.1',name:'职业风格',labels:['外向','内向','察觉','直觉','思考','情感','判断','感知'],outputs:['四对倾向','16种风格类型','4种气质类型'],missing:'八极分、C4Top及同分INFP已接入；2025模板与实际部署版本仍须核对。'},
   {number:'1.2',name:'元五人格',labels:['外倾性','宜人性','尽责性','情绪性','创新性'],outputs:['雷达图','参考均值','36项特质标签','情绪区间'],missing:'type16在一份样本42项重跑吻合；标签、区间与目标PDF尚未全部绑定，固定参考线不等于实时均值。'},
   {number:'2.1',name:'职业价值观',labels:['精彩','奋斗','自主','影响','仁慈','传统','安全','博爱'],outputs:['八项结果','前三核心锚点'],missing:'归档32词选择、排序、校准及报告值已接入；其他历史排列与解释分支待核验。'},
   {number:'3.1',name:'职业动机',labels:['财富','健康','享受','工作','权力','创新','情感','荣誉'],outputs:['动机倾向','动机类型','思维模式','管理偏向','动机组合','四类驱动'],missing:'完整277题入口已接入基础分、校准、图表及动机五句原文匹配；十页长文与历史运行全同仍待核验。'},
   {number:'4.1',name:'职业能力',labels:abilityNames,outputs:['28项能力','前6与后3','四类能力层','创新力/分析力/意志力/协作力/建联力'],missing:'已有28项报告值可复算五力与管理分组；答案→28项能力尚未接线，不能用性格分代替。'},
   {number:'4.2',name:'职业角色',labels:evidence.roles.map(r=>r.name),outputs:['8类角色分数','角色说明'],missing:'8角色可由完整答案独立计算，56个字段单样本回归一致；旧角色异常与解释仍待验。'},
   {number:'4.3',name:'职业优势',labels:evidence.themes.map(t=>t.name),outputs:['四类才干棋盘','完整34项名次','前6/后6','占比','能量星级'],missing:'34项基础分、名次与星级已接入；星级4份数据库候选值可复算，仍缺同次完整高级报告。外部180题不替代本题卷。'},
  ],
  themes:evidence.themes,traits:evidence.traits,roles:evidence.roles,gaps:replicaGaps,full_question_bank:fullQuestionBank,
  evidence:{accepted_edges:evidence.weights.length,excluded_edges:evidence.excludedRows.length,sources:evidence.sources,replay},
 };
}
export type ReplicaCatalog = ReturnType<typeof replicaCatalog>;

export function validateReplicaAnswers(mode:ReplicaMode,answers:Record<string,number>,complete=true){
 const questions=mode===replicaModes[0]?evidence.targetQuestions:evidence.externalQuestions;
 const ids=new Set(questions.map(q=>q.id));
 for(const [id,value] of Object.entries(answers)){
  if(!ids.has(id)||!Number.isInteger(value)||value<1||value>5)throw new Error('INVALID_REPLICA_ANSWERS');
 }
 if(complete&&questions.some(q=>!Object.hasOwn(answers,q.id)))throw new Error('INCOMPLETE_REPLICA_ANSWERS');
 return questions;
}

export function scoreExternalStrengthV3(answers:Record<string,number>){
 const questions=validateReplicaAnswers('external_strength_180_v3',answers);
 const denominators=evidence.bookDenominators as Record<string,number>;
 const themeOrder=Object.keys(denominators);
 const totals:Record<string,number>=Object.fromEntries(themeOrder.map(t=>[t,0]));
 const counts={...totals};
 const contributions=evidence.weights.map(edge=>{
  const question=questions[edge.q-1],answer=answers[question.id],points=edge.scores[answer-1];
  totals[edge.theme]+=points;counts[edge.theme]++;
  return {question_id:question.id,order:edge.q,theme:edge.theme,side:edge.side,answer,points,evidence:edge.evidence};
 });
 function profile(id:'book118'|'observed_links',divisors:Record<string,number>){
  const rows=themeOrder.map(name=>({name,raw:totals[name],denominator:divisors[name]}));
  // Integer cross-products preserve exact ties; presentation order is not a recovered tie-break.
  const compare=(a:typeof rows[number],b:typeof rows[number])=>b.raw*a.denominator-a.raw*b.denominator;
  rows.sort(compare);
  const ranking=rows.map(row=>({...row,score:row.raw/row.denominator,rank:1+rows.filter(other=>compare(other,row)<0).length}));
  const top5Candidates=ranking.filter(r=>r.rank<=5);
  return {id,ranking,top5_candidates:top5Candidates.map(t=>t.name),cutoff_tied:top5Candidates.length>5};
 }
 return {
  version:replicaVersion,kind:'external_evidence_trial' as const,exact_replica_ready:false,
  warning:'这是外部180题v3计分表的确定性试算。历史回放存在反例，不是高禾正式测评结果。',
  profiles:[profile('book118',denominators),profile('observed_links',counts)],
  contributions,excluded_edges:evidence.excludedRows.length,
  missing_outputs:['高禾153题计分','高禾完整七模块报告','原站平局顺序','才干占比与能量星级'],
 };
}
export type StrengthTrial = ReturnType<typeof scoreExternalStrengthV3>;
