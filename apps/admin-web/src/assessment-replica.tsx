import {useEffect,useRef,useState} from 'react';
import {api} from './api.ts';
import {Notice} from './ui.tsx';
import type {ReplicaCatalog,ReplicaMode,StrengthTrial} from '@qilun/assessment-engine/strength-v3.ts';
import './assessment-replica.css';
import {GhEvidencePanel} from './gh-evidence.tsx';
import {GhReplayPanel} from './gh-replay.tsx';

type Answers=Record<string,number>;
type Pane='latest'|'legacy'|'bank'|'questions'|'report'|'evidence'|'missing';
function download(name:string,value:unknown){
 const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function AssessmentReplica(){
 const [catalog,setCatalog]=useState<ReplicaCatalog>();
 const [mode,setMode]=useState<ReplicaMode>('ghrczx_strength_153');
 const [pane,setPane]=useState<Pane>('latest'),[page,setPage]=useState(0),[query,setQuery]=useState('');
 const [drafts,setDrafts]=useState<Record<ReplicaMode,Answers>>({ghrczx_strength_153:{},external_strength_180_v3:{}});
 const [trial,setTrial]=useState<StrengthTrial>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const upload=useRef<HTMLInputElement>(null);
 useEffect(()=>{api<ReplicaCatalog>('/assessment/replication').then(setCatalog).catch(e=>setError(e.message));},[]);
 if(!catalog)return <section className="panel">{error?<Notice kind="error">{error}</Notice>:<p>正在读取题目和核验记录…</p>}</section>;
 const pkg=catalog.packages.find(p=>p.id===mode)!,answers=drafts[mode];
 const matches=pkg.questions.filter(q=>`${q.order} ${q.id} ${q.a} ${q.b}`.includes(query));
 const pageCount=Math.max(1,Math.ceil(matches.length/3)),currentPage=Math.min(page,pageCount-1);
 const shown=matches.slice(currentPage*3,currentPage*3+3),answered=Object.keys(answers).length;
 const total=pkg.questions.length,complete=answered===total;
 const changeAnswer=(id:string,value:number)=>{setDrafts(d=>({...d,[mode]:{...d[mode],[id]:value}}));setTrial(undefined);};
 const exportDraft=()=>download(`${mode}-answers.json`,{version:catalog.version,mode,answers});
 async function importDraft(file:File){
  try{
   if(file.size>256000)throw new Error('答卷文件超过256KB。');
   const parsed=JSON.parse(await file.text());
   if(!parsed||Array.isArray(parsed)||Object.keys(parsed).sort().join(',')!=='answers,mode,version'||parsed.version!==catalog!.version||!catalog!.packages.some(p=>p.id===parsed.mode))throw new Error('答卷版本或格式不匹配。');
   const target=catalog!.packages.find(p=>p.id===parsed.mode)!;
   const ids=new Set(target.questions.map(q=>q.id));
   if(!parsed.answers||Array.isArray(parsed.answers)||typeof parsed.answers!=='object'||Object.entries(parsed.answers).some(([id,v])=>!ids.has(id)||typeof v!=='number'||!Number.isInteger(v)||v<1||v>5))throw new Error('含有不属于此题卷的题号或非法选项。');
   setDrafts(d=>({...d,[parsed.mode]:parsed.answers}));setMode(parsed.mode);setPage(0);setQuery('');setTrial(undefined);setError('');
  }catch(e){setError((e as Error).message);}
 }
 return <div className="replica-workspace">
  <div className="page-heading"><div><span className="eyebrow">ASSESSMENT / SOURCE VERIFICATION</span><h2>齐论测评 · 原站规则核验</h2><p>逐题看原文，逐项查依据，核对完整报告需要的每一环。</p></div><span className="replica-status">完整答案可计算 · 完整报告待验</span></div>
  <section className="replica-overview" aria-label="还原进度">
   <div><strong>277<span>题</span></strong><p>高禾完整题干已恢复</p><small>213道双陈述 · 64道单陈述</small></div>
   <div><strong>7<span>模块</span></strong><p>报告输出结构</p><small>完整列出维度与已取得的定义</small></div>
   <div><strong>180<span>题</span></strong><p>外部同源证据试算</p><small>574条计分关系 · 独立版本</small></div>
   <div><strong>{catalog.evidence.replay.unique_answer_vectors.toLocaleString()}<span>份</span></strong><p>外部180题历史回放</p><small>外部规则有反例，不代表新增高禾基础分</small></div>
  </section>
  <div className="tabbar replica-tabs" aria-label="复刻核验栏目">
   {([['latest','10月补充 · 完整答案计算'],['legacy','9月基础分核对'],['bank','完整277题库'],['questions','优势题作答与外部试算'],['report','七模块报告结构'],['evidence','旧外部180题证据'],['missing','待补材料']] as const).map(([id,label])=><button key={id} aria-pressed={pane===id} className={pane===id?'active':''} onClick={()=>{setPane(id);setError('');}}>{label}</button>)}
  </div>
  {error&&<Notice kind="error">{error}</Notice>}
  {pane==='latest'&&<GhReplayPanel bank={catalog.full_question_bank}/>}
  {pane==='legacy'&&<GhEvidencePanel questionIds={catalog.full_question_bank.questions.map(q=>q.id)}/>}
  {pane==='bank'&&<FullQuestionBank bank={catalog.full_question_bank}/>}
  {pane==='questions'&&<>
   <section className="panel replica-package"><label className="field"><span>题卷版本</span><select aria-label="题卷版本" disabled={busy} value={mode} onChange={e=>{setMode(e.target.value as ReplicaMode);setPage(0);setQuery('');setTrial(undefined);setError('');}}>{catalog.packages.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label><div><h2>{pkg.title}</h2><p>{pkg.description}</p><small className="muted">原文来源：{pkg.source}</small></div></section>
   <div className="replica-answer-tools"><p aria-live="polite">已作答 <strong>{answered}</strong> / {total} 题</p><div><button onClick={()=>upload.current?.click()}>导入答案</button><button disabled={!answered} onClick={exportDraft}>导出答案</button></div></div>
   <input ref={upload} type="file" accept=".json,application/json" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void importDraft(f);e.target.value='';}}/>
   <progress aria-label="作答进度" value={answered} max={total}/>
   <p className="muted replica-draft-note">答案保留在当前页面，刷新或离开前请导出。153题是职业优势模块；完整277题作答、校准及报告预览请使用「10月补充 · 完整答案计算」。</p>
   <div className="toolbar"><input aria-label="搜索题目" placeholder="搜索题号或题目原文" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/><button onClick={()=>{const i=pkg.questions.findIndex(q=>!answers[q.id]);if(i>=0){setQuery('');setPage(Math.floor(i/3));}}} disabled={complete}>跳至未答题</button></div>
   <div className="replica-questions">{shown.map(q=><fieldset className="replica-question" key={`${mode}-${q.id}`} disabled={busy}><legend>第 {q.order} 题 <span>原题号 {q.id}</span></legend><div className="replica-statements"><p><b>A</b>{q.a}</p><p><b>B</b>{q.b}</p></div><div className="replica-options">{catalog.choices.map((label,index)=><label key={label} className={answers[q.id]===index+1?'chosen':''}><input type="radio" name={`${mode}-${q.id}`} checked={answers[q.id]===index+1} onChange={()=>changeAnswer(q.id,index+1)}/><span>{label}</span></label>)}</div></fieldset>)}</div>
   {!shown.length&&<div className="empty">没有找到符合条件的题目。</div>}
   <div className="replica-pagination"><button disabled={currentPage===0||busy} onClick={()=>setPage(currentPage-1)}>上一组</button><label>第 <select aria-label="题目页码" value={currentPage} onChange={e=>setPage(Number(e.target.value))}>{Array.from({length:pageCount},(_,i)=><option key={i} value={i}>{i+1}</option>)}</select> / {pageCount} 组</label><button disabled={currentPage===pageCount-1||busy} onClick={()=>setPage(currentPage+1)}>下一组</button></div>
   <section className="replica-submit"><div><h3>{pkg.scoring_available?'查看证据表的计算结果':'本页保留153题模块答卷'}</h3><p>{pkg.scoring_available?'完成180题后，服务端会逐条执行v3表，保留并列并展示两种分母的差异。':'可以保存这一模块的全部答案；新版基础分试算需完整277题及10项价值排序，本页不混入外部规则。'}</p></div>{pkg.scoring_available?<button className="primary" disabled={!complete||busy} onClick={async()=>{setBusy(true);setError('');try{setTrial(await api<StrengthTrial>('/assessment/replication/score',{version:catalog.version,mode,answers}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'计算中…':'运行证据试算'}</button>:<button className="primary" disabled={!answered} onClick={exportDraft}>保存已答选项</button>}</section>
   {trial&&<TrialResult trial={trial}/>}
  </>}
  {pane==='report'&&<>
   <div className="replica-section-intro"><h2>与你提供的报告逐项对应</h2><p>以下展示已恢复的字段和选项。尚未取得的个人分数显示为空，不由样本报告或其他量表代填。</p></div>
   <div className="replica-report-grid">{catalog.sections.map(section=><section key={section.number} className={'panel replica-report-section '+(section.number==='4.1'?'wide':'')}><div className="replica-section-heading"><h2>{section.number} {section.name}</h2><span>计分待核验</span></div><div className="replica-labels">{section.labels.map(label=><span key={label}>{label}<b>—</b></span>)}</div><p className="replica-output-list">报告包含：{section.outputs.join(' · ')}</p><p className="muted">{section.missing}</p></section>)}</div>
   <section className="panel"><h2>才干棋盘 · 34项完整定义</h2><p>分类与说明来自原站输出定义。10月入口已接入基础分、完整排序和星级；才干占比及同次完整高级报告仍待核验。</p><div className="replica-board">{['执行才干','思维才干','关系才干','影响才干'].map(category=><div key={category}><h3>{category}</h3>{catalog.themes.filter(t=>t.category===category).map(theme=><details key={theme.name}><summary>{theme.name}</summary><p>{theme.description}</p></details>)}</div>)}</div></section>
   <section className="panel"><h2>突出标签 · 36项定义</h2><div className="replica-definitions">{catalog.traits.map(t=><details key={t.name}><summary>{t.name}</summary><p>{t.description}</p></details>)}</div></section>
   <section className="panel"><h2>职业角色 · 8项定义</h2><div className="replica-definitions">{catalog.roles.map(r=><details key={r.name}><summary>{r.name}</summary><p>{r.definition}</p><p>{r.feature}</p></details>)}</div></section>
  </>}
  {pane==='evidence'&&<>
   <section className="panel"><h2>完整性已通过，结果一致性仍有反例</h2><p>346个包内文件通过SHA-256核验；7个v3文件从原证据重建后逐字节一致。下表进一步把已有作答重新计算，与归档中的真实Top5返回值比较。</p><div className="table-scroll"><table><thead><tr><th>比较口径</th><th>Book118分母</th><th>已定位关系数分母</th></tr></thead><tbody><tr><td>不同答案数</td><td colSpan={2}>{catalog.evidence.replay.unique_answer_vectors.toLocaleString()}</td></tr><tr><td>Top5名单一致（允许并列）</td>{(['book118','observed_links'] as const).map(k=><td key={k}>{catalog.evidence.replay.profiles[k].compatible_top5_set.toLocaleString()} / {catalog.evidence.replay.unique_answer_vectors.toLocaleString()}</td>)}</tr><tr><td>Top5顺序也相容</td>{(['book118','observed_links'] as const).map(k=><td key={k}>{catalog.evidence.replay.profiles[k].compatible_top5_order.toLocaleString()} / {catalog.evidence.replay.unique_answer_vectors.toLocaleString()}</td>)}</tr></tbody></table></div><p className="muted">这是历史取证答卷的离线回放，包含用于推导计分表的样本，不能视作独立验证准确率，更不是高禾整套测评的还原率。</p></section>
   <section className="panel"><h2>一个可定位的反例</h2>{catalog.evidence.replay.profiles.book118.counterexamples.slice(0,1).map(c=><div key={c.run_id}><p>归档返回：<strong>{c.observed.join(' → ')}</strong></p><p>v3表计算：<strong>{c.calculated.join(' → ')}</strong></p><p>“关联”和“搜集”的顺序存在实质分差，不能用平局处理解释。</p><small className="replica-source">{c.file}<br/>{c.run_id}</small></div>)}</section>
   <section className="panel"><h2>版本差异与证据范围</h2><ul><li>完整277题已由20260928补给找回，其中高禾职业优势153题与外部180题仍互不套用答案。</li><li>v3采用574条关系，排除21条弱证据或跨行引用；“追求”“伯乐”两主题的分母分别有一项差异。</li><li>q29“统率”按v3机器表保留3/2/1/-1/-2；旧前68题映射文稿的-2/-3与此不一致，未擅自合并。</li><li>PDF的角色阈值为81/61；历史接口定义的阈值为80/36。两套阈值均不能跨版本覆盖。</li><li>9月30日已补齐高禾基础计分、单陈述编码和价值观流程；完整解释与跨版本回归仍待验。</li></ul><details><summary>查看导入来源与校验值</summary><div className="replica-source-list">{Object.entries(catalog.evidence.sources).map(([name,hash])=><p key={name}>{name}<code>{hash}</code></p>)}</div></details></section>
  </>}
  {pane==='missing'&&<><div className="replica-section-intro"><h2>补齐这些材料，才能继续验证“一模一样”</h2><p>10月总归纳包已接入，以下为包内仍明确未闭合的5项，不再重复索要已经收到的计分材料。答案端28项能力配置和完整解释接线的开发边界见10月计算结果说明。</p></div>{catalog.gaps.map((gap,i)=><section className="panel replica-gap" key={gap.id}><span>{String(i+1).padStart(2,'0')}</span><div><h2>{gap.title}</h2><p>{gap.detail}</p><ul>{gap.files.map(file=><li key={file}>{file}</li>)}</ul></div></section>)}<button onClick={()=>download('齐论测评-待补材料-v22.json',{version:catalog.version,gaps:catalog.gaps})}>下载待补材料清单</button></>}
 </div>;
}

function FullQuestionBank({bank}:{bank:ReplicaCatalog['full_question_bank']}){
 const [module,setModule]=useState('职业定位'),[query,setQuery]=useState(''),[page,setPage]=useState(0);
 const rows=bank.questions.filter(q=>q.module===module&&`${q.id} ${q.title} ${q.a} ${q.b}`.includes(query));
 const pages=Math.max(1,Math.ceil(rows.length/10)),current=Math.min(page,pages-1);
 return <><section className="panel"><h2>9月28日题库档案：277题完整题干</h2><p>15个包内文件校验通过。题号、模块、题干与两份答案表逐项一致；两份答卷的277个答案编码也完全相同，不能当成两次独立测评验证。</p><p className="muted">{bank.summary.readme_count_error}</p><details><summary>9月28日历史缺项（已被9月30日新证据补充）</summary><p>{bank.summary.statement_code_conflict}</p><p>历史题库708次请求的返回模块均为0；价值观8次请求也返回模块0，不能视为成功取得价值观排序记录。这份旧包当时没有对应完整报告或计分规则；9月30日新包已补充基础计分及部分配对。</p></details></section><div className="tabbar">{bank.modules.map(m=><button key={m.name} className={m.name===module?'active':''} onClick={()=>{setModule(m.name);setPage(0);setQuery('');}}>{m.name} · {m.count}</button>)}</div><div className="toolbar"><input aria-label="搜索完整题库" value={query} placeholder="搜索题号或原文" onChange={e=>{setQuery(e.target.value);setPage(0);}}/><span className="muted">仅核对原文，不据此生成分数</span></div><div className="replica-questions">{rows.slice(current*10,current*10+10).map(q=><section className="panel" key={q.id}><h3>原题号 {q.id} <small className="muted">{q.module} · 原第{q.page}页 · {q.answer_type===5?'双陈述':'单陈述'}</small></h3>{q.title&&<p>{q.title}</p>}{q.answer_type===5?<div className="replica-statements"><p><b>A</b>{q.a}</p><p><b>B</b>{q.b}</p></div>:<p className="muted">新证据已确认：1完全符合、2多数符合、3一般符合、4偶尔符合、5完全不符。此页仅核对原文，试算使用新版入口。</p>}</section>)}</div><div className="replica-pagination"><button disabled={!current} onClick={()=>setPage(current-1)}>前10题</button><span>{rows.length}题 · 第{current+1}/{pages}页</span><button disabled={current===pages-1} onClick={()=>setPage(current+1)}>后10题</button></div></>;
}

function TrialResult({trial}:{trial:StrengthTrial}){
 const [profile,setProfile]=useState(0),data=trial.profiles[profile];
 return <section className="panel replica-result" aria-live="polite"><span className="eyebrow">EVIDENCE TRIAL / 核验结果</span><h2>外部180题 · 34主题试算</h2><p>{trial.warning}</p><div className="tabbar">{trial.profiles.map((p,i)=><button key={p.id} className={profile===i?'active':''} onClick={()=>setProfile(i)}>{p.id==='book118'?'Book118分母':'已定位关系数分母'}</button>)}</div><p>前5名候选：{data.top5_candidates.join('、')}{data.cutoff_tied?'（边界有并列，保留全部候选）':''}</p><div className="table-scroll"><table><thead><tr><th>名次（保留并列）</th><th>主题</th><th>原始和</th><th>分母</th><th>比值</th></tr></thead><tbody>{data.ranking.map(r=><tr key={r.name}><td>{r.rank}</td><td>{r.name}</td><td>{r.raw}</td><td>{r.denominator}</td><td>{r.score.toFixed(4)}</td></tr>)}</tbody></table></div><p className="muted">比值不是百分位或能力分；列表中并列行的显示先后不代表原站的决胜顺序。</p><button onClick={()=>download('外部180题-v3试算及逐题依据.json',trial)}>导出结果与574条逐题依据</button></section>;
}
