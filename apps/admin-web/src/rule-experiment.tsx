import {useState} from 'react';
import {api} from './api.ts';
import {Notice} from './ui.tsx';
import type {experiment} from '@qilun/assessment-engine/experimental.ts';
export function RuleExperiment(){
 const [answers,setAnswers]=useState([4,2,3,3,2,4]),[aggregation,setAggregation]=useState('mean');
 const [result,setResult]=useState<ReturnType<typeof experiment>>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <section className="panel"><h2>规则推演实验：从答案到总分</h2>
 <p>已核对高禾官网公开介绍与 IPIP 公开计分说明。原始样本上，加和法为 4 份唯一一致、1 份并列兼容；取最大项法为 5 份一致；乘积法有 1 份矛盾。因此不能仅凭这 5 份输出选定唯一算法。</p>
 <p><a href="https://www.ghrczx.com/" target="_blank" rel="noreferrer">高禾公开介绍</a> · <a href="https://ipip.ori.org/newScoringInstructions.htm" target="_blank" rel="noreferrer">IPIP 计分来源</a></p>
 <Notice>以下是齐论自定义数学实验，不是高禾原版。六个输入没有真实题干或人格含义；不进入候选人报告。</Notice>
 <p>正反向编码参考公开 IPIP 方法；每两项组成一个实验维度。标杆、重标度、差距和总分公式由本项目提出，尚未验证适用性。</p>
 <p>固定标杆答卷：[5,1,4,2,3,3]、[4,2,4,2,4,2]、[5,1,5,1,2,4]。三个维度等权。均值和中位数可切换。</p>
 <form className="form-grid" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');setResult(undefined);try{setResult(await api('/assessment/rules/experiment',{purpose:'synthetic_method_comparison',answers,benchmarks:[[5,1,4,2,3,3],[4,2,4,2,4,2],[5,1,5,1,2,4]],aggregation,weights:[1,1,1]}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
 {answers.map((x,i)=><label className="field" key={i}><span>实验项 {i+1}{i%2?'（反向）':'（正向）'}</span><input required aria-label={`实验项${i+1}`} type="number" min={1} max={5} step={1} value={x} onChange={e=>{setResult(undefined);setAnswers(answers.map((v,j)=>j===i?Number(e.target.value):v));}}/></label>)}
 <label className="field"><span>标杆聚合假设</span><select value={aggregation} onChange={e=>{setResult(undefined);setAggregation(e.target.value);}}><option value="mean">均值假设</option><option value="median">中位数假设</option></select></label>
 <div className="form-footer"><button className="primary" disabled={busy}>{busy?'计算中…':'比较实验公式'}</button></div></form>
 {error&&<Notice kind="error">{error}</Notice>}
 {result&&<div><h3>实验结果 · 不是正式匹配分</h3><div className="table-scroll"><table><thead><tr><th>维度</th><th>个人值</th><th>标杆值</th><th>分项</th></tr></thead><tbody>{result.candidate.map((x,i)=><tr key={i}><td>{i+1}</td><td>{x.normalized.toFixed(2)}</td><td>{result.target[i].toFixed(2)}</td><td>{result.components[i].toFixed(2)}</td></tr>)}</tbody></table></div>
 <p>线性总分 {result.alternatives.weighted_linear.toFixed(2)}；二次差距总分 {result.alternatives.weighted_quadratic.toFixed(2)}；短板总分 {result.alternatives.bottleneck.toFixed(2)}。</p><p>同一组输入的公式差异为 {result.spread.toFixed(2)} 分。不同公式可能得出不同结果，也可能在特定输入上重合；一次重合不能证明算法相同。</p><ol>{result.trace.map(x=><li key={x}>{x}</li>)}</ol></div>}
 </section>;
}
