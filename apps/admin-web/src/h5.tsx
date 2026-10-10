import {useEffect,useRef} from 'react';
import type {scoreSelfReview} from '../../../packages/assessment-engine/self-review.ts';
export type Report=ReturnType<typeof scoreSelfReview>;
const motiveMeta:Record<string,{color:string;summary:string}>={
 财富:{color:'#ef8586',summary:'重视成果回报与资源保障，希望付出能够获得清晰、合理的回馈。'},
 健康:{color:'#dfb0b0',summary:'重视可持续的工作节奏，以及身心恢复与生活安排。'},
 享受:{color:'#66c268',summary:'重视工作过程中的积极体验、兴趣和愉悦感。'},
 工作:{color:'#afd4aa',summary:'重视完成、精进与交付质量，愿意持续改进工作方法。'},
 权力:{color:'#6893ee',summary:'重视自主空间、影响力以及推动资源与决定的机会。'},
 创新:{color:'#9bb7ef',summary:'重视探索、学习和创新，愿意尝试尚不熟悉的方法。'},
 情感:{color:'#ffc735',summary:'重视信任、合作与关系连接，关注伙伴的需要。'},
 荣誉:{color:'#f5dc96',summary:'重视认可与反馈，希望自己的贡献被清楚看见。'}
};
const reportSections=['元五人格','职业风格','职业角色','职业能力','职业动机','职业价值观','职业优势'];
export function ReportView({report,name}:{report:Report;name?:string}){
 const root=useRef<HTMLElement>(null); useEffect(()=>{let closed:HTMLDetailsElement[]=[];const before=()=>{closed=Array.from(root.current?.querySelectorAll<HTMLDetailsElement>("details:not([open])")??[]);closed.forEach(d=>d.open=true);};const after=()=>{closed.forEach(d=>d.open=false);closed=[];};window.addEventListener("beforeprint",before);window.addEventListener("afterprint",after);return()=>{window.removeEventListener("beforeprint",before);window.removeEventListener("afterprint",after);};},[]);
 const sorted=[...report.dimensions].sort((a,b)=>b.score-a.score),front=sorted.slice(0,3),rear=sorted.slice(-1);
 const score=(id:string)=>report.dimensions.find(d=>d.id===id)?.score??0;
 const groups=[{name:'安乐',value:score('享受')+score('健康')},{name:'归属',value:score('情感')+score('荣誉')},{name:'权利',value:score('权力')+score('财富')},{name:'成就',value:score('工作')+score('创新')}];
 const driver=[...groups].sort((a,b)=>b.value-a.value)[0];
 const work=(score('财富')+score('工作')+score('创新')+score('荣誉')+score('权力'))/5;
 const life=(score('健康')+score('享受')+score('情感'))/3,diff=work-life;
 const tendency=diff>10?'工作型':diff<-10?'生活型':'平衡型';
 const tendencyText=tendency==='工作型'?'比较注重工作付出及贡献，并从完成与进步中获得满足；也要主动安排恢复节奏。':tendency==='生活型'?'更重视生活体验、关系与恢复空间；清晰的工作边界更有助于持续投入。':'能够兼顾工作和生活，并在两者之间寻求相对稳定、可持续的安排。';
 const driverText:Record<string,string>={安乐:'重视舒适体验与身心节奏，以稳定、愉悦和可持续为主要驱动力。',归属:'重视关系连接与外界认可，以信任、归属和积极反馈为主要驱动力。',权利:'重视资源回报与自主影响，以现实成果、决定空间和掌控感为主要驱动力。',成就:'重视完成、精进与探索，以做成事情、持续学习和创造新解法为主要驱动力。'};
 return <article className="gh-report" ref={root}>
  <header className="gh-report-head"><img className="gh-logo" src="/brand/qilun-logo-light.png" alt="齐论 AI"/><div className="gh-version">工作偏好自评 · {report.version}</div></header>
  <nav className="gh-report-index no-print" aria-label="报告章节">{reportSections.map((x,i)=><a className={x==='职业动机'?'ready':''} href={x==='职业动机'?'#career-motivation':`#pending-${i}`} key={x}><b>{i+1}</b>{x}<small>{x==='职业动机'?'分析结果':'待完成'}</small></a>)}</nav>
  <section className="gh-summary"><span>WORK PREFERENCE / DEVELOPMENT</span><h1>工作偏好与发展沟通报告</h1>{name&&<div className="report-person">{name}</div>}<p>基于本次24题自我描述，呈现八项工作偏好及作答依据。采用齐论独立规则，并非高禾原版计分；组合与倾向属于探索性解读，不用于招聘筛选。</p></section>
  <details className="unused-modules no-print"><summary>其他报告模块 · 尚未采集</summary>{reportSections.filter(x=>x!=='职业动机').map(x=><section className="gh-pending" id={`pending-${reportSections.indexOf(x)}`} key={x}><div><b>{reportSections.indexOf(x)+1}</b><h2>{x}</h2></div><p>本次答卷未采集该模块所需数据，暂不生成分数与类型。</p><span>待补测 / 待导入</span></section>)}</details>
  <section className="gh-page" id="career-motivation">
   <div className="gh-section-title"><i></i><h2>职业动机</h2></div>
   <p className="gh-lead"><i></i>8种职业动机，反映测评者当前的内在驱动力与核心需求，不同动机需要采用不同的激励方式。</p>
   <div className="gh-column-chart" role="img" aria-label="八项职业动机柱状图">{report.dimensions.map(d=><div className="gh-column" key={d.id}><div className="gh-column-scale"><span style={{height:`${d.score}%`,background:motiveMeta[d.id]?.color}}><b>{d.score.toFixed(0)}</b></span></div><em>{d.id}</em></div>)}</div>
   <div className="gh-range">*动机分数参考范围：高（81～100分），较高（61～80分），中等（41～60分），低（0～40分）</div>
   <h3 className="gh-subtitle">4.1 动机组合</h3>
   <div className="gh-motive-table"><div className="gh-band front">前置动机</div><div className="gh-motive-rows">{front.map(d=><div key={d.id}><b style={{color:motiveMeta[d.id]?.color}}>{d.id}</b><p>{motiveMeta[d.id]?.summary}</p></div>)}</div><div className="gh-band rear">后置动机</div><div className="gh-motive-rows">{rear.map(d=><div key={d.id}><b style={{color:motiveMeta[d.id]?.color}}>{d.id}</b><p>{motiveMeta[d.id]?.summary}</p></div>)}</div></div>
   <div className="gh-summary-table">
    <div><b>动机排序</b><span>{sorted.map(x=>x.id).join('、')}</span></div>
    <div><b>思维模式</b><span>{score('创新')>=score('健康')?'探索思考型——愿意寻找新方法并理解变化':'稳健思考型——偏好明确、可持续的工作安排'}</span></div>
    <div><b>管理倾向</b><span>{score('权力')>=60?'自主推进——需要明确授权与责任边界':'协作推进——在清晰目标和伙伴支持下发挥'}</span></div>
    <div><b>动机类型</b><span>{driver.name}型——{driverText[driver.name]}</span></div>
    <div><b>动机组合</b><span>{front[0]?.id} × {front[1]?.id}——优先满足核心需要，再结合具体工作经历验证</span></div>
   </div>
   <div className="gh-two-cols">
    <section><h3>4.2 动机倾向</h3><div className="gh-tendency-tabs"><span className={tendency==='生活型'?'active':''}>生活型</span><span className={tendency==='平衡型'?'active':''}>平衡型</span><span className={tendency==='工作型'?'active':''}>工作型</span></div><p>{tendencyText}</p></section>
    <section><h3>4.3 驱动倾向</h3><div className="gh-driver"><b style={{left:`${Math.min(92,Math.max(8,['安乐','归属','权利','成就'].indexOf(driver.name)*28+8))}%`}}>{driver.name}</b></div><div className="gh-driver-labels"><span>安乐驱动</span><span>归属驱动</span><span>权利驱动</span><span>成就驱动</span></div><p>{driverText[driver.name]}</p></section>
   </div>
   <h3 className="gh-subtitle gh-detail-title">4.4 维度解读与作答依据</h3>
   <p className="gh-quality">{report.quality_note} 结果表示当前自我描述，不等于能力、绩效或录用概率。</p>
   <div className="gh-details">{report.dimensions.map(d=><details key={d.id}><summary><span>{d.id} · {d.label}</span><b>{d.score.toFixed(0)}</b></summary><p>{d.description}</p><p><strong>沟通问题：</strong>{d.conversation}</p>{d.evidence.map(e=><p className="gh-evidence" key={e.question_id}>{e.text}<strong>{e.answer}/5</strong></p>)}</details>)}</div>
   <footer className="gh-page-footer"><span>齐论人才 · 证据化人才管理</span><b>QILUN / REPORT</b><span>职业动机推演报告</span></footer>
  </section>
  <div className="gh-report-actions no-print"><button className="primary" onClick={()=>window.print()}>打印 / 保存 PDF</button><p>分析结果用于自我认识与发展沟通，请结合实际经历理解。</p></div>
 </article>;
}
// All public assessment URLs, including old /h5 and /h5/report paths,
// now enter shared registration. ReportView above remains for old reports.
export {PublicEntryH5 as H5App} from './public-entry.tsx';
