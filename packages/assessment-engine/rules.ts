import {z} from 'zod';

/** Legacy display derivations. Versioned item replay lives in gh-server-evidence.ts. */
export const ENGINE_VERSION='qilun-report-rules/0.1.0';
export const dimensionNames=['财富','健康','享受','工作','权力','创新','情感','荣誉'] as const;
const number=z.number().finite().min(-1e6).max(1e6); // Technical overflow bound, NOT a psychometric scale.
export const motivationScores=z.object({财富:number,健康:number,享受:number,工作:number,权力:number,创新:number,情感:number,荣誉:number}).strict();
export const deriveInput=z.discriminatedUnion('adapter',[
 z.object({adapter:z.literal('gh_talent_web_v81'),source_field:z.literal('pc_motivation_report_values'),scale_ref:z.string().trim().min(1).max(200),input_kind:z.enum(['synthetic','manual_report_values']),purpose:z.literal('rule_verification_only'),scores:motivationScores}).strict(),
 z.object({adapter:z.literal('gh_phone_senior_v81'),source_field:z.literal('type4Result'),scale_ref:z.string().trim().min(1).max(200),input_kind:z.enum(['synthetic','manual_report_values']),purpose:z.literal('rule_verification_only'),scores:motivationScores,
   template:z.object({reference:z.literal('E1-phone-template-20260916'),occupation:z.tuple([z.literal(21.6),z.literal(6.1),z.literal(3.6),z.literal(0)]),energy:z.tuple([z.literal(637.5),z.literal(472.5),z.literal(375),z.literal(257.5)])}).strict().optional()
 }).strict()
]);
export type DeriveInput=z.infer<typeof deriveInput>;

export function piecewiseWeight(difference:number){
 if(!Number.isFinite(difference))throw new Error('INVALID_NUMBER');
 const d=Math.abs(difference);
 return d<=1?0.2:d<=5?0.3:d<=10?0.4:0;
}
export function deriveMotivation(raw:unknown){
 const input=deriveInput.parse(raw),s=input.scores,phone=input.adapter==='gh_phone_senior_v81';
 const workSum=s.财富+s.工作+s.创新+s.荣誉+s.权力,lifeSum=s.健康+s.享受+s.情感;
 const workDivisor=phone?5:25,lifeDivisor=phone?3:15;
 // Preserve original JS rounding order: round W and L separately BEFORE subtraction.
 const W=Number((workSum/workDivisor).toFixed(2)),L=Number((lifeSum/lifeDivisor).toFixed(2)),D=W-L,k=piecewiseWeight(D),I=D*(1-k)+W*k;
 const groups={安乐:s.享受+s.健康,归属:s.情感+s.荣誉,权利:s.权力+s.财富,成就:s.工作+s.创新};
 const highest=Math.max(...Object.values(groups));
 const highestGroups=Object.entries(groups).filter(([,value])=>value===highest).map(([name])=>name);
 const sum=dimensionNames.reduce((total,name)=>total+s[name],0);
 const template=phone?input.template:undefined;
 const occupationBand=template?(I<0?0:I<3.6?1:I<6.1?2:3):null;
 const energyBand=template?(sum<257.5?0:sum<375?1:sum<472.5?2:3):null;
 return {
  engine_version:ENGINE_VERSION,adapter:input.adapter,source_field:input.source_field,scale_ref:input.scale_ref,input_kind:input.input_kind,
  status:'display_derivation_only',purpose:'rule_verification_only',formal_score:false,recruitment_decision_allowed:false,
  groups,highest_groups:highestGroups,tie:highestGroups.length>1,
  W,L,D,k,I,motivation_sum:sum,
  work_life_label:phone?(D>1?'工作倾向':D< -1?'生活倾向':'兼顾'):null,
  occupation_band:occupationBand,energy_band:energyBand,band_index_base:0,
  template_ref:template?.reference??null,
  limitations:[
   '输入是已有基础分，不是问卷答案；此计算不证明题项计分或正式人岗匹配已还原。',
   '不得据自陈人格、动机或类型进行招聘排序、淘汰或岗位安排。',
   ...(highestGroups.length>1?['并列组全部保留，不猜测原系统隐藏排序/平局规则。']:[]),
   ...(!template?['未提供适用模板阈值，分档保持 null；PC 不套用手机参数。']:['手机分档仅对应 E1 指定时点模板，不推广为全账号通用阈值。']),
   ...(input.input_kind==='manual_report_values'?['手工报告输入仅试算；PDF 数值不等于已确认接口来源和量尺。']:['合成样例，不是任何人的真实结果。'])
  ],
  trace:[
   {rule_id:'MOT-01',source:'E5 §四.A / E1 §四.2',operation:'四组分别加和；最大并列保留',result:groups},
   {rule_id:phone?'MOT-PHONE-01':'MOT-PC-01',source:phone?'E1 §四.1、3':'E5 §四.B',operation:`W=toFixed(工作五项和/${workDivisor},2); L=toFixed(生活三项和/${lifeDivisor},2)`,result:{workSum,lifeSum,W,L,D}},
   {rule_id:'MOT-WEIGHT-01',source:'E1 §四.4 / E5 §四.B',operation:'abs(D)≤1:0.2; ≤5:0.3; ≤10:0.4; >10:0; I=D*(1-k)+W*k',result:{k,I}},
   {rule_id:'MOT-BANDS-01',source:template?'E1 §四.4、5':'尚无适用分档配置',operation:template?'使用指定手机模板阈值':'不生成分档',result:{occupationBand,energyBand}}
  ]
 };
}

export function encodeAnswer(type:'ab_five_choice'|'single_five_choice',visibleIndex:number,version:'current_277'|'legacy_e2'='current_277'){
 z.enum(['ab_five_choice','single_five_choice']).parse(type);z.number().int().min(0).max(4).parse(visibleIndex);
 z.enum(['current_277','legacy_e2']).parse(version);
 return type==='single_five_choice'&&version==='legacy_e2'?5-visibleIndex:visibleIndex+1;
}
/** Captures visible ranking only. No unobserved rank-to-dimension weights are inferred. */
export function validateValueSelection(raw:unknown){
 const words=z.array(z.string().min(1)).length(16);
 const input=z.object({groups:z.array(words).length(4),selected_by_group:z.array(z.array(z.string()).length(5)).length(4),ranked:z.array(z.string()).length(10)}).strict().parse(raw);
 const all=input.groups.flat(),selected=input.selected_by_group.flat();
 if(new Set(all).size!==64)throw new Error('WORD_IDS_MUST_BE_UNIQUE');
 input.selected_by_group.forEach((group,i)=>{if(new Set(group).size!==5||group.some(x=>!input.groups[i].includes(x)))throw new Error('INVALID_GROUP_SELECTION');});
 if(new Set(input.ranked).size!==10||input.ranked.some(x=>!selected.includes(x)))throw new Error('INVALID_VISIBLE_RANKING');
 return input.ranked.map((question_id,index)=>({question_id,rank:index+1}));
}
/** Formats an EXTERNALLY supplied match score. This function never creates a score. */
export function externalMatchLabel(score:number,kind:'overall'|'component'){
 z.number().finite().min(0).max(100).parse(score);z.enum(['overall','component']).parse(kind);
 return {source:'external_original_label',score,kind,label:score>=(kind==='overall'?85:80)?'非常符合':score>=70?'比较符合':score>=50?'基本符合':'不符合',recruitment_decision_allowed:false};
}

export function deriveStylePairs(raw:unknown,version:'current_277'|'legacy_e5'='current_277'){
 const s=z.object({E:number,I:number,S:number,N:number,T:number,F:number,J:number,P:number}).strict().parse(raw);
 z.enum(['current_277','legacy_e5']).parse(version);
 const pairs=([['E','I'],['S','N'],['T','F'],['J','P']] as const).map(([a,b])=>({pair:[a,b],winner:version==='legacy_e5'&&s[a]===s[b]?null:s[a]>s[b]?a:b}));
 return {pairs,type:pairs.some(p=>p.winner===null)?null:pairs.map(p=>p.winner).join(''),source:version==='current_277'?'v22 C4Top源码与数据库复算':'E5 §四.D',recruitment_decision_allowed:false,
  limitation:version==='current_277'?'当前版本同分取右侧I/N/F/P；旧版展示协议须显式指定。':'旧版展示仅比较已有八极分，同分保持空值。'};
}
export function sumFirstSixteenTalents(raw:unknown){
 const rows=z.array(z.object({id:z.string().min(1),category_id:z.string().min(1),value:z.number().finite().min(0).max(1e6)}).strict()).min(16).max(1000).parse(raw);
 if(new Set(rows.map(x=>x.id)).size!==rows.length)throw new Error('DUPLICATE_TALENT');
 const sums=new Map<string,number>();
 for(const row of rows.slice(0,16))sums.set(row.category_id,(sums.get(row.category_id)??0)+row.value);
 return {categories:[...sums].filter(([,sum])=>sum!==0).map(([category_id,sum])=>({category_id,sum})),input_order_preserved:true,used_ids:rows.slice(0,16).map(r=>r.id),source:'E5 §四.C',
  limitation:'输入顺序前16项，不自行选最高16；PDF仅给排名时不能反推这些value。'};
}

export const gaps=[
 {id:'authorization',title:'规则与内容使用授权',detail:'需要授权依据、使用范围、期限；提供报告用于本次分析不等于完整商业题库复用许可。'},
 {id:'questions',title:'已接入作答流程，历史动态排列待核验',detail:'277题及归档32词的4组各选5→20选10→排序已接入；不推定所有历史版本的排列相同。'},
 {id:'item_scoring',title:'基础分与分段校准已接入',detail:'v22补充后6份答卷337项原始分与337项校准分吻合；不等于全部报告字段或历史版本全部通过。'},
 {id:'transformation',title:'换算已接入，质量与版本仍待验',detail:'动机/价值校准、角色Junior/SeniorNew曲线和当前同分INFP已实现；逻辑一致性、异常质量判定及2025部署版本仍须同次原始证据。'},
 {id:'model_aggregation',title:'17个历史岗位模型真实输入',detail:'每成员当前New路线可独立复算；17个旧模型真实成员/分数仍缺，不把替代矩阵、拟合解当原始配置。'},
 {id:'component_match',title:'分项匹配全量回归',detail:'已取得源码与部分历史复算；各版本、快照及舍入差异尚未全部验证。'},
 {id:'overall_match',title:'总匹配公式已复算，历史原始小数待补',detail:'正确addSome路径93条复算中85条与历史整数相同，8条差1分；缺原始小数，不能唯一反推。正式端到端匹配仍未启用。'},
 {id:'interpretations',title:'原版短文案已接线，48个历史运行分支待核验',detail:'七模块的气质、动机五句、价值说明、优势短句与角色岗位说明已按原字典接入；这不等于补回全部历史运行分支。28项能力原权重和十页全文解释仍未完整恢复。'},
 {id:'golden_cases',title:'完整高级报告与旧角色异常记录',detail:'C4Top已能从答案计算；42项性格与56个角色数值单样本独立回归一致。仍缺同次完整senior返回、2025版本链和一次旧角色异常原因。'},
 {id:'approved_engine',title:'已审核引擎与回归审批',detail:'完整规则取得后实现受限引擎并回归；不能靠客户端勾选“已齐全”直接发布。'}
] as const;
export function validateFormalPublication(){
 return {status:'blocked_missing_rules',publishable:false,formal_match_available:false,missing:[...gaps],engine_version:ENGINE_VERSION,
  known_scope:'277题作答、归档32词排序、基础分与校准、四字母风格、36性格及6父项、8角色、星级、部分报告预览、四项总匹配与当前成员矩阵核对',
  required_chain:['完整答案','维度基础分','岗位模型','分项匹配','综合匹配'],
  notice:'当前版本可执行独立证据复算；完整高级报告、历史复刻及正式匹配仍待端到端验收，不由客户端自行解锁。'};
}
export function ruleCatalog(){return {
 engine_version:ENGINE_VERSION,publication:validateFormalPublication(),
 rules:[
  {id:'ANS-01',title:'A/B 与单陈述编码',formula:'当前277题均为1,2,3,4,5；单陈述1＝完全符合，5＝完全不符',source:'v22→v14/v10；20260930逐题计分表',scope:'旧E2反向编码仅显式legacy_e2协议保留，不自动翻转历史答案'},
  {id:'VALUE-01',title:'价值观选择与排序（新证据校正）',formula:'64词配置，页面实际32词 → 4组各选5 → 20选10 → rank 1–10',source:'20260930主包value-module-flow与value-rank-scoring-table',scope:'新版基础分引擎接受10项rank；旧64词选择校验器仅保留历史兼容，不代表当前页面流程'},
  {id:'MOT-01',title:'四组动机合计',formula:'安乐=享受+健康；归属=情感+荣誉；权利=权力+财富；成就=工作+创新',source:'E5 §四.A；E1 §四.2',scope:'并列全部保留，只验证报告展示'},
  {id:'MOT-PC-01',title:'PC 报告衍生',formula:'W=(财富+工作+创新+荣誉+权力)/25；L=(健康+享受+情感)/15；分别toFixed(2)',source:'E5 §四.B',scope:'PC 分档参数缺失，不能套手机阈值'},
  {id:'MOT-PHONE-01',title:'手机报告衍生',formula:'type4Result：W=工作五项和/5；L=生活三项和/3；分别toFixed(2)；D=W-L',source:'E1 §四.1、3',scope:'不能使用图表 motivationForAll 替换计算输入'},
  {id:'MOT-WEIGHT-01',title:'投入指标',formula:'I=D×(1-k)+W×k；|D|≤1:k=.2；≤5:.3；≤10:.4；>10:0',source:'E1 §四.4；E5 §四.B',scope:'已有分数的衍生值，不是题目计分'},
  {id:'DISPLAY-01',title:'外部匹配分显示',formula:'综合85/70/50；分项80/70/50',source:'E2 §五.2',scope:'仅展示外部返回分，不生成招聘决策'},
  {id:'STYLE-01',title:'风格极值对比',formula:'左侧严格大于右侧取左；否则取右。同分I/N/F/P',source:'v22 C4Top证据与服务端源码',scope:'当前配置版本；不推断岗位适合度'},
  {id:'TALENT-01',title:'才干类别汇总',formula:'按输入列表前16项的 category_id 加总，零和类别不展示',source:'E5 §四.C',scope:'不先排序；只有排名而无基础值时不能计算占比'},
 ],
 excluded:['getSingleMatch 的85分辅助公式','历史文稿的6-x与加权距离示例','把四项取平均当总匹配','把固定20参考线称为真实全站均值','依据MBTI或人格类型筛选候选人'],
 pdf_review:{files:11,pages:56,unique_texts:10,scope:'本地检查五份人才报告与六份数据报告；两份数据报告文本相同但文件哈希不同。',added:'补充输出侧样本、图表和标签；没有完整答卷或岗位模型—匹配结果链。',not_imported:'个人报告只用于本次本地规则核对，未上传模型或自动写入人才库。'}
};}
