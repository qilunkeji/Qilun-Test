import {useEffect,useState} from 'react';
import {api} from './api.ts';
import {Notice,Badge} from './ui.tsx';
import {RuleExperiment} from './rule-experiment.tsx';
// Only types are shared. Rules and calculations execute exclusively through the server API.
import type {ruleCatalog,deriveMotivation} from '../../../packages/assessment-engine/rules.ts';
type Catalog=ReturnType<typeof ruleCatalog>;
type Derived=ReturnType<typeof deriveMotivation>&{input_hash:string};
const dimensions=['财富','健康','享受','工作','权力','创新','情感','荣誉'];
export function AssessmentRules(){
 const [catalog,setCatalog]=useState<Catalog>(),[error,setError]=useState(''),[result,setResult]=useState<Derived>(),[busy,setBusy]=useState(false),[verified,setVerified]=useState(false);
 const [adapter,setAdapter]=useState('gh_talent_web_v81'),[kind,setKind]=useState('synthetic'),[scale,setScale]=useState(''),[template,setTemplate]=useState(false),[values,setValues]=useState<Record<string,string>>({});
 useEffect(()=>{api<Catalog>('/assessment/rules').then(setCatalog).catch(e=>setError(e.message));},[]);
 const invalidate=()=>{setResult(undefined);setError('');};
 async function calculate(){
  setBusy(true);setError('');setResult(undefined);
  try{
   if(dimensions.some(d=>values[d]===undefined||values[d].trim()===''))throw new Error('八项分数必须完整填写；缺项不能当作 0。');
   const scores=Object.fromEntries(dimensions.map(d=>[d,Number(values[d])]));
   const body={adapter,source_field:adapter==='gh_talent_web_v81'?'pc_motivation_report_values':'type4Result',scale_ref:scale,input_kind:kind,purpose:'rule_verification_only',scores,
    ...(adapter==='gh_phone_senior_v81'&&template?{template:{reference:'E1-phone-template-20260916',occupation:[21.6,6.1,3.6,0],energy:[637.5,472.5,375,257.5]}}:{})};
   setResult(await api<Derived>('/assessment/rules/derive',body));
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <><div className="page-heading"><div><h2>测评规则</h2><p>查看依据、验证已有公式，并核对完整计分与匹配所需材料。</p></div><Badge>规则核对 · 不产生招聘结论</Badge></div>
 {error&&<Notice kind="error">{error}</Notice>}
 <RuleExperiment/>
 <section className="panel"><div className="section-heading"><h2>现在能否完成整套匹配？</h2><button disabled={busy||!catalog} onClick={async()=>{setBusy(true);setError('');try{await api('/assessment/rules/validate',{});setVerified(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'处理中…':'重新检查发布条件'}</button></div>
 <Notice>10月补充已接入完整作答、分数校准、风格、性格、角色与部分报告预览，请到测评中心 → 复刻核验查看。完整报告和正式岗位匹配仍未解锁。{verified?'服务端已重新校验：正式发布仍阻塞。':''}</Notice>
 <p>6份答卷的337项原始分与337项校准分一致；性格及角色仅一份完整样本回归，不代表整套历史报告100%一致。</p>
 <div className="table-scroll"><table><thead><tr><th>缺项</th><th>需要补充的内容</th></tr></thead><tbody>{catalog?.publication.missing.map(g=><tr key={g.id}><td><strong>{g.title}</strong></td><td className="rule-description">{g.detail}</td></tr>)}</tbody></table></div></section>
 <section className="panel"><h2>已写入代码的规则</h2>{!catalog?<p>读取规则依据中…</p>:catalog.rules.map(r=><div className="rule-item" key={r.id}><h3>{r.title} <Badge>{r.id}</Badge></h3><p className="formula">{r.formula}</p><p className="muted">依据：{r.source} · {r.scope}</p></div>)}</section>
 <section className="panel"><div className="section-heading"><h2>报告衍生公式试算</h2><button onClick={()=>{invalidate();setKind('synthetic');setScale('synthetic-fixture-v1');setValues(Object.fromEntries(dimensions.map((d,i)=>[d,String([60,40,45,70,55,65,50,60][i])])));}}>填入合成样例</button></div>
 <Notice>只核对已有分数的数学计算，不是候选人测评或人岗匹配。结果不写入人才报告。PC 与手机使用不同来源和除数，不自动转换量尺。</Notice>
 <form className="form-grid" onSubmit={e=>{e.preventDefault();void calculate();}}>
 <label className="field"><span>报告适配器</span><select value={adapter} onChange={e=>{invalidate();setAdapter(e.target.value);setTemplate(false);setScale('');setValues({});}}><option value="gh_talent_web_v81">PC 人才报告 · 除数 25 / 15</option><option value="gh_phone_senior_v81">手机高级报告 · 除数 5 / 3</option></select></label>
 <label className="field"><span>输入性质</span><select value={kind} onChange={e=>{invalidate();setKind(e.target.value);}}><option value="synthetic">合成样例（不对应任何人员）</option><option value="manual_report_values">手工报告数值（量尺仍需核对）</option></select></label>
 <label className="field wide"><span>来源页码 / 量尺说明 *</span><input required maxLength={200} value={scale} onChange={e=>{invalidate();setScale(e.target.value);}} placeholder="例如：合成夹具版本；或报告编号、页码与量尺待核对说明"/></label>
 {dimensions.map(d=><label className="field" key={d}><span>{d} *</span><input aria-label={`${d}分数`} type="number" step="any" required min={-1000000} max={1000000} value={values[d]??''} onChange={e=>{invalidate();setValues({...values,[d]:e.target.value});}}/></label>)}
 {adapter==='gh_phone_senior_v81'&&<label className="wide check-label"><input type="checkbox" checked={template} onChange={e=>{invalidate();setTemplate(e.target.checked);}}/>明确使用 E1 在 2026-09-16 记录的手机模板阈值（仅供该模板核对）</label>}
 <div className="form-footer"><p>未知项不能填 0。PC 内部输入名不是已核实的原站 API 字段。</p><button className="primary" disabled={busy}>{busy?'试算中…':'服务端试算'}</button></div></form>
 {result&&<div className="rule-result"><h3>试算结果 <Badge>{result.input_kind==='synthetic'?'合成样例':'手工输入 · 非正式结果'}</Badge></h3><div className="table-scroll"><table><thead><tr><th>W</th><th>L</th><th>D</th><th>k</th><th>投入指标 I</th></tr></thead><tbody><tr>{[result.W,result.L,result.D,result.k,result.I].map((v,i)=><td key={i}>{Number(v.toFixed(8))}</td>)}</tr></tbody></table></div>
 <p>最高动机组：{result.highest_groups.join('、')}{result.tie?'（并列，未擅自决胜）':''}。该标签只用于规则核对。</p><p>投入指标分档：{result.occupation_band===null?'未取得适用阈值':`第 ${result.occupation_band+1} 档`}；动机总和分档：{result.energy_band===null?'未取得适用阈值':`第 ${result.energy_band+1} 档`}。</p>
 <details><summary>查看公式追踪与输入摘要</summary><pre className="rule-json">{JSON.stringify({engine_version:result.engine_version,input_hash:result.input_hash,trace:result.trace},null,2)}</pre></details><ul className="limitations">{result.limitations.map(x=><li key={x}>{x}</li>)}</ul></div>}
 </section><section className="panel"><h2>不会用来补齐算法的内容</h2><ul className="limitations">{catalog?.excluded.map(x=><li key={x}>{x}</li>)}</ul><p>完整规则提供后，再建立版本化计分包和真实答案—结果回归；不能用 PDF 输出反推唯一后台算法，也不会将人格偏好接入招聘排序。</p></section></>;
}
