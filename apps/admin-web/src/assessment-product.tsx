import {useEffect,useState} from 'react';
import {api} from './api.ts';
import {Notice} from './ui.tsx';
import type {InverseSummary} from '../../../packages/assessment-engine/gh-inference.ts';
type ProductRules={available:boolean;rules_fingerprint:string|null;problem:string|null;rulebook:{version:string;title:string;steps:{title:string;detail:string}[];limitations:string[];model_sha256:string;feature_count:number;ability_count:number;runtime_training:boolean;runtime_ai_generation:boolean;artifacts:Record<string,string>;aggregates:Record<string,unknown>};validation_summary:InverseSummary|null};
export function AssessmentProductRules(){
 const [data,setData]=useState<ProductRules>(),[error,setError]=useState('');
 useEffect(()=>{api<ProductRules>('/assessment/product-rules').then(setData).catch(e=>setError(e.message));},[]);
 if(error)return <Notice kind="error">{error}</Notice>;
 if(!data)return <p role="status">正在读取固定测评规则…</p>;
 const r=data.rulebook,metrics=data.validation_summary;
 return <section className="panel"><h2>{r.title} · 成品规则</h2><p>版本：{r.version}　状态：{data.available?'固定规则已校验，可发起完整测评':'校验未通过，禁止创建不完整的新邀请'}</p>
  <Notice>新邀请只有一种计算口径，七模块与28项能力必出。参数是一次研究后冻结的公式，不是每次请AI生成；修改须新版本，旧邀请和已提交报告不重算。定型不等于证明原版全同。</Notice>
  {data.problem&&<p role="alert">内部校验原因：{data.problem}</p>}
  {r.steps.map(step=><div key={step.title}><h3>{step.title}</h3><p>{step.detail}</p></div>)}
  <details><summary>查看分层、五力、管理分组的固定映射与公式</summary><pre>{JSON.stringify(r.aggregates,null,2)}</pre></details>
  <h3>现有独立检查（不是个人置信区间）</h3>{metrics&&<><p>508组中间层检查：平均绝对差{metrics.holdout.mean_absolute_error.toFixed(2)}分，显示整数完全相同{(metrics.holdout.exact_display_rate*100).toFixed(2)}%。</p><p>6份完整答案链：平均绝对差{metrics.answer_chain.mean_absolute_error.toFixed(2)}分。没有重新训练，也未将测试样本纳入拟合。</p></>}
  {r.limitations.map(text=><p key={text}>{text}</p>)}
  <details><summary>查看版本锁与文件校验清单</summary><p>整套规则指纹：{data.rules_fingerprint??'校验未通过'}</p><p>模型SHA256：{r.model_sha256}</p><div className="table-scroll"><table><thead><tr><th>只读规则文件</th><th>SHA256</th></tr></thead><tbody>{Object.entries(r.artifacts).map(([file,hash])=><tr key={file}><td>{file}</td><td>{hash}</td></tr>)}</tbody></table></div></details>
 </section>;
}
