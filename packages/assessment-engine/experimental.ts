import {z} from 'zod';

const score=z.number().int().min(1).max(5);
export const experimentInput=z.object({
 purpose:z.literal('synthetic_method_comparison'),
 answers:z.array(score).length(6),
 benchmarks:z.array(z.array(score).length(6)).min(1).max(5),
 aggregation:z.enum(['mean','median']),
 weights:z.array(z.number().finite().positive().max(100)).length(3)
}).strict();

// Authored mathematical fixture, not a recovered questionnaire or validated instrument.
// Fixed key: (q1, reverse q2), (q3, reverse q4), (q5, reverse q6).
export function experiment(raw:unknown){
 const input=experimentInput.parse(raw);
 const derive=(answers:number[])=>[0,2,4].map(i=>{
  const keyed=[answers[i],6-answers[i+1]],sum=keyed[0]+keyed[1];
  return {items:[i+1,i+2],keyed,sum,normalized:100*(sum-2)/8};
 });
 const candidate=derive(input.answers),benchmarks=input.benchmarks.map(derive);
 const target=candidate.map((_,i)=>{
  const xs=benchmarks.map(b=>b[i].normalized).sort((a,b)=>a-b),n=xs.length;
  return input.aggregation==='mean'?xs.reduce((a,b)=>a+b,0)/n:(xs[Math.floor((n-1)/2)]+xs[Math.floor(n/2)])/2;
 });
 const totalWeight=input.weights.reduce((a,b)=>a+b,0),weights=input.weights.map(w=>w/totalWeight);
 const differences=candidate.map((c,i)=>Math.abs(c.normalized-target[i])/100);
 const components=differences.map(d=>100*(1-d));
 const linear=components.reduce((s,x,i)=>s+x*weights[i],0);
 const quadratic=100*(1-Math.sqrt(differences.reduce((s,d,i)=>s+weights[i]*d*d,0)));
 const bottleneck=Math.min(...components);
 return {version:'qilun-synthetic-chain/0.1.0',status:'authored_experiment',original_algorithm_recovered:false,
  formal_score:false,recruitment_decision_allowed:false,persisted_as_person_report:false,
  key_origin:'项目自定义6项数学夹具；不是高禾题库，也不是IPIP量表',
  candidate,benchmarks,target,weights,differences,components,
  alternatives:{weighted_linear:linear,weighted_quadratic:quadratic,bottleneck},
  spread:Math.max(linear,quadratic,bottleneck)-Math.min(linear,quadratic,bottleneck),
  trace:['反向项=6-x；每两项加和','0–100=(原始和-2)/8×100，仅理论范围重标度，不是百分位',
   `标杆聚合=${input.aggregation}；未恢复高禾聚合`,
   '分项=100×(1-|个人-目标|/100)',
   '线性=Σw×分项；二次=100×(1-√Σw×差距²)；短板=min(分项)',
   '三种总分都是待验证方法，没有自动选择最接近报告的一种作为真值'],
  limitations:['只接收六项合成数值，不绑定候选人、岗位或人格标签。','无常模、效度、录用概率或高禾兼容声明。','缺少原始答案与岗位结果配对数据，不能评估哪种总分是真实原算法。']};
}
