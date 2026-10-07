import {z} from 'zod';
const definitions=[
 ['财富','报酬与资源','我会关注付出与报酬是否相称。','选择工作时，收入增长对我很重要。','我愿意为明确的经济回报安排额外投入。'],
 ['健康','节奏与恢复','我希望工作安排给休息留出稳定空间。','持续忙碌后，我会优先安排恢复。','选择工作方式时，我重视可持续的节奏。'],
 ['享受','体验与乐趣','工作过程是否有趣会影响我的投入。','我喜欢在任务中寻找让我愉快的部分。','选择任务时，我重视过程中的积极体验。'],
 ['工作','完成与精进','把一项工作做完整会让我满足。','我愿意持续练习，改进自己的工作方法。','即使没有额外奖励，我也在意交付质量。'],
 ['权力','自主与影响','我希望能参与影响工作方向的决定。','我愿意承担协调资源和推进事情的责任。','我重视对自己的工作安排有决定空间。'],
 ['创新','尝试与探索','我愿意尝试尚不熟悉的工作方法。','面对重复任务，我会寻找新的解决方式。','有机会探索不同方案时，我通常感到有动力。'],
 ['情感','关系与连接','与同事建立信任关系对我很重要。','我愿意花时间理解合作伙伴的需要。','融洽的合作关系会增强我的工作投入。'],
 ['荣誉','认可与反馈','工作成果得到明确认可会激励我。','我希望他人能够看见自己的贡献。','积极的反馈会增强我继续投入的意愿。']
] as const;
export const selfReviewPackage={id:'qilun-work-preferences',version:'1.0.0',title:'齐论工作偏好自评',
 notice:'齐论独立编制的24项自评，用于自我了解和发展沟通；不是高禾原版，不是经常模验证的心理量表，不用于招聘淘汰。可不参与，并与邀请人选择访谈方式沟通。',
 consent_version:'2026-09-v1',scale:['很不符合','较不符合','一般','较符合','很符合'],
 dimensions:definitions.map(([id,label,...texts])=>({id,label,questions:texts.map((text,i)=>({id:`${id}-${i+1}`,text}))})),
 scoring:{type:'mean-linear-v1',minimum:1,maximum:5,missing:'reject',rounding:2,interpretation:'self-description-only'}
};
export type SelfPackage=typeof selfReviewPackage;
export function validateAnswers(pkg:SelfPackage,raw:unknown,complete=false){
 const values=z.record(z.string(),z.number().int().min(1).max(5)).parse(raw);
 const ids=pkg.dimensions.flatMap(d=>d.questions.map(q=>q.id));
 if(Object.keys(values).some(id=>!ids.includes(id))||(complete&&ids.some(id=>values[id]===undefined)))throw new Error('INVALID_ANSWERS');
 return values;
}
export function scoreSelfReview(pkg:SelfPackage,raw:unknown){
 const answers=validateAnswers(pkg,raw,true);
 const dimensions=pkg.dimensions.map(d=>{
  const evidence=d.questions.map(q=>({question_id:q.id,text:q.text,answer:answers[q.id]}));
  const sum=evidence.reduce((s,e)=>s+e.answer,0),mean=sum/evidence.length;
  return {id:d.id,label:d.label,sum,mean:Number(mean.toFixed(2)),score:Number(((mean-1)/4*100).toFixed(2)),evidence,
   description:`本维度${evidence.length}项平均选择为${mean.toFixed(2)}/5。表示你当前对「${d.label}」描述的认同程度，不表示能力优劣。`,
   conversation:`最近哪一件工作经历最能说明你对「${d.label}」的需要？哪些条件会让你的选择改变？`};
 });
 return {title:pkg.title,version:pkg.version,source:'本人自评',notice:pkg.notice,dimensions,
  formula:'每维度3项均值；展示值=(均值-1)/4×100，保留两位小数；不是百分位。',
  missing_count:0,flat_response:new Set(Object.values(answers)).size===1,
  quality_note:new Set(Object.values(answers)).size===1?'所有选项相同，可结合实际经历复核；不据此判定无效或说谎。':'自评结果依赖当下理解与状态，可结合具体经历沟通。',
  hiring_recommendation:null};
}
