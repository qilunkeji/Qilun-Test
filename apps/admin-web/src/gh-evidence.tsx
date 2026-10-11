import {useEffect,useRef,useState} from 'react';
import {api} from './api.ts';
import {Notice} from './ui.tsx';
import type {GhEvidenceCatalog,GhFirstLayerTrial} from '@qilun/assessment-engine/gh-server-evidence.ts';

function download(name:string,data:unknown){
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const typeNames:Record<number,string>={2:'34项职业优势基础分',3:'8项风格／定位基础分',4:'8项动机基础分',5:'8项价值观基础分'};

export function GhEvidencePanel({questionIds}:{questionIds:string[]}){
 const [catalog,setCatalog]=useState<GhEvidenceCatalog>(),[error,setError]=useState('');
 const [text,setText]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState<GhFirstLayerTrial>();
 const upload=useRef<HTMLInputElement>(null);
 useEffect(()=>{api<GhEvidenceCatalog>('/assessment/gh-evidence').then(setCatalog).catch(e=>setError(e.message));},[]);
 if(!catalog)return <section className="panel">{error?<Notice kind="error">{error}</Notice>:'正在读取9月30日补充证据…'}</section>;
 const a=catalog.audit;
 const example=()=>({version:catalog.version,purpose:'evidence_verification_only',input_kind:'synthetic',answers:Object.fromEntries(questionIds.map(id=>[id,3])),values:catalog.values.slice(0,10).map((q,i)=>({id:q.id,rank:i+1}))});
 return <>
  <section className="panel"><span className="eyebrow">2026.09.30 / NEW EVIDENCE</span><h2>从“题目已齐”推进到“基础分可复算”</h2><p>已核验外层{a.hashes.v6}项、主包{a.hashes.base_v3}项文件哈希。277题 × 5档计分映射、64词配置、10项排序计分已接入独立核验引擎。</p>
   <div className="table-scroll"><table><thead><tr><th>核验层级</th><th>结果</th><th>准确边界</th></tr></thead><tbody>
    <tr><td>第一层项目分</td><td>{a.first_layer.passed}/{a.first_layer.compared}</td><td>{a.first_layer.scope}本项目独立实现，容差1e-9。</td></tr>
    <tr><td>性格子项与父项（type16）</td><td>42/42</td><td>已审阅的包内复算器重跑，两条输入路线均通过；只是一份样本。当前278–283无配置，不能补猜权重。</td></tr>
    <tr><td>8个职业角色</td><td>两条路线各56/56</td><td>仍依赖服务端已有C4Top，不是完全答案自足的端到端验证。</td></tr>
    <tr><td>星级</td><td>仅源码公式</td><td>缺少同次服务端grade返回，不标样本通过。</td></tr>
   </tbody></table></div>
   <Notice>当前开放的是基础分试算。性格、角色、星级和完整报告仍未接入正式出分，不会自动写入人才档案，也不会用于招聘筛选。</Notice>
  </section>
  <section className="panel"><h2>“45条闭环”不等于历史算法100%还原</h2><div className="table-scroll"><table><thead><tr><th>解释方式</th><th>条数</th><th>这次复核</th></tr></thead><tbody>
   <tr><td>全模型替代权重矩阵</td><td>22</td><td rowSpan={2}>合计32条，按逐项输入与替代权重独立重算吻合；不是找回原权重。</td></tr>
   <tr><td>按操作时间分段的替代矩阵</td><td>10</td></tr>
   <tr><td>替代成员组合</td><td>7</td><td>分类与表内预测一致；本次未从原始成员数据重新求解。</td></tr>
   <tr><td>候选人快照差异解释</td><td>6</td><td>旧28项快照未恢复，不能说已逐项算回原分。</td></tr>
  </tbody></table></div><p className="muted">包内未分类数为0，只表示45条都有归类。替代矩阵和成员组合不会被当作生产配置，也不据此解锁正式岗位匹配。</p></section>
  <section className="panel"><h2>277题＋10项价值排序 · 基础分试算</h2><p>导入按下方格式整理的完整答案，或先载入明确标记的合成样例。只有题号、答案码与价值观名次，不需要姓名、电话、账号或原始报告。</p>
   <p>普通题编码：A/B题1→5为A非常符合至B非常符合；单陈述题1＝完全符合，5＝完全不符。旧答案CSV中的相反文字不自动改写。</p><p className="muted">{catalog.value_flow}</p>
   <div className="toolbar"><button disabled={busy} onClick={()=>{setText(JSON.stringify(example(),null,2));setResult(undefined);setError('');}}>载入合成样例</button><button disabled={busy} onClick={()=>upload.current?.click()}>导入答案JSON</button><button onClick={()=>download('基础分试算-合成格式样例.json',example())}>下载格式样例</button></div>
   <input ref={upload} hidden type="file" accept=".json,application/json" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>64000)throw new Error('文件须小于64KB，仅保留题号与答案。');const raw=await file.text();JSON.parse(raw);setText(raw);setResult(undefined);setError('');}catch(e){setError((e as Error).message);}}}/>
   <label className="field"><span>版本化答案JSON（真实授权答案请将input_kind设为manual_answers）</span><textarea aria-label="基础分试算答案JSON" rows={10} maxLength={64000} value={text} disabled={busy} placeholder='点击“载入合成样例”查看格式；导入前请移除身份信息。' onChange={e=>{setText(e.target.value);setResult(undefined);}}/></label>
   {error&&<Notice kind="error">{error}</Notice>}<button className="primary" disabled={!text.trim()||busy} onClick={async()=>{setBusy(true);setError('');setResult(undefined);try{setResult(await api<GhFirstLayerTrial>('/assessment/gh-evidence/score',JSON.parse(text)));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'正在核验…':'运行基础分试算'}</button><p className="muted">答案只留在当前页面，刷新或切换栏目会清空；服务器只计算、不保存、不调用外部AI。不包含完整答题界面或10页报告自动生成。</p>
   <details><summary>查看64个可识别的价值观题号（配置库，不是固定展示分组）</summary><div className="replica-labels">{catalog.values.map(q=><span key={q.id}>{q.id} · {q.title}</span>)}</div></details>
  </section>
  {result&&<section className="panel" aria-live="polite"><span className="eyebrow">FIRST-LAYER / NOT A FORMAL REPORT</span><h2>{result.input_kind==='synthetic'?'合成样例':'手工导入答案'} · 基础分核验结果</h2><p>共277道普通题与10项价值排序已计算。下方为中间分，不是报告中的最终能力分或百分比。</p>
   {[2,3,4,5].map(t=><details key={t} open={t===2}><summary>{typeNames[t]}</summary><div className="table-scroll"><table><thead><tr><th>项目</th><th>基础分</th><th>来源题数</th></tr></thead><tbody>{result.rows.filter(r=>r.type===t).map(r=><tr key={r.item}><td>{r.name} <small>#{r.item}</small></td><td>{r.score}</td><td>{r.contributing_questions}</td></tr>)}</tbody></table></div></details>)}
   <ul>{result.limitations.map(s=><li key={s}>{s}</li>)}</ul><button onClick={()=>download('基础分核验-非正式报告.json',result)}>导出结果与逐题贡献</button>
  </section>}
  <section className="panel"><h2>接下来真正还缺什么</h2>{catalog.gaps.map(g=><details key={g.id}><summary>{g.title}</summary><p>{g.detail}</p><ul>{g.files.map(f=><li key={f}>{f}</li>)}</ul></details>)}<button onClick={()=>download('20260930-更新后的待补材料.json',{version:catalog.version,gaps:catalog.gaps})}>下载最新缺项</button></section>
 </>;
}
