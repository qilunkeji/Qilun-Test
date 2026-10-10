import type {GhInvitePackage,GhInviteReport,GhValueDraft} from '../../../packages/assessment-engine/gh-invite.ts';
import type {GhProgress} from '../../../packages/assessment-engine/gh-progress.ts';
import {OriginalReportStudio} from './original-report.tsx';
import {ghReportValues,ghReportRoles} from './gh-report-data.ts';
import './h5-reference.css';
import type {ReportMetadata} from './report-header.tsx';
export type GhOpen={id:string;name:string;metadata?:ReportMetadata;package:GhInvitePackage;purpose:string;expires_at:string;answers:Record<string,number>;value_draft:GhValueDraft;ui_progress?:GhProgress|null;revision:number;consented:boolean;submitted:boolean;report:GhInviteReport|null;submitted_at:string|null};
const colors=['#ed8a8a','#e2b4b3','#6ac36c','#b3d9ad','#73a0fb','#b0c6f9','#f7c739','#f6dd9a'];
function MetricBars({rows,max=100}:{rows:{name:string;value:number|null}[];max?:number}){return <div className="h5-metrics">{rows.map((r,i)=><div key={r.name}><span>{r.name}</span><div className="h5-metric-track"><i style={{width:`${Math.max(0,Math.min(100,(r.value??0)/max*100))}%`,background:colors[i%8]}}/></div><b>{r.value===null?'留白':Number(r.value.toFixed(2))}</b></div>)}</div>;}
export function ReferenceReportView({report,name,submittedAt,metadata}:{report:GhInviteReport;name?:string;submittedAt?:string|null;metadata?:ReportMetadata}){
 const r=report.result,standard='product' in r;
 const modules=['职业风格','元五人格','职业价值观','职业动机','职业能力','职业角色','职业优势'];
 return <article className="h5-reference-report report-sheet-first">
 <div className="report-sheet-container"><OriginalReportStudio replay={r} dataOnly personName={name} submittedAt={submittedAt} metadata={metadata}/></div>
 <details className="report-detail-disclosure no-print"><summary>展开详细数据<span>七模块分项与说明</span></summary><div className="report-detail-content"><nav className="h5-module-nav" aria-label="七模块结果">{modules.map((m,i)=><a key={m} href={`#module-${i}`}>{m}</a>)}</nav>
 <section className="h5-result-section" id="module-0"><h2>1.1 职业风格</h2><MetricBars max={25} rows={r.rows.filter(x=>x.type===3).map(x=>({name:x.name,value:x.score}))}/><p><b>风格类型：</b>{r.style.code}（{r.style.name}）</p><p><b>气质类型：</b>{r.report_text.temperament.text}</p></section>
 <section className="h5-result-section" id="module-1"><h2>1.2 元五人格</h2><MetricBars rows={r.traits.parents.filter(x=>[242,246,245,244,243].includes(x.item)).map(x=>({name:x.name,value:x.score}))}/><details><summary>查看性格子项</summary><MetricBars max={30} rows={r.traits.children.filter(x=>!standard||x.configured).map(x=>({name:x.name+(x.configured?'':'（无规则）'),value:x.configured?x.score:null}))}/></details></section>
 <section className="h5-result-section" id="module-2"><h2>2.1 职业价值观</h2><MetricBars rows={ghReportValues(r).map(x=>({name:x.label,value:x.report_value}))}/>{r.report_text.values.map(x=><p key={x.item}><b>{x.label}：</b>{x.text}</p>)}{!standard&&<small>使用归档32词版本；未产生分数的项目留白。</small>}</section>
 <section className="h5-result-section" id="module-3"><h2>3.1 职业动机</h2><MetricBars rows={r.motivation.map(x=>({name:x.name,value:x.report_value}))}/>{r.report_text.motivation.lines.map(x=><p key={x.type}>{x.text}</p>)}</section>
 <section className="h5-result-section" id="module-4"><h2>4.1 职业能力</h2>{'abilities' in r?<><p className="h5-reference-notice">{'product' in r?'能力分数是固定模型推算的参考评分，不等同于实际技能或绩效，请结合具体经历理解。':<>以下均为反推估计。历史独立样本每项平均误差 {r.inference.holdout.mean_absolute_error.toFixed(2)} 分，不代表本人的误差范围。</>}</p><MetricBars rows={r.abilities.map(x=>({name:x.name,value:x.value}))}/></>:<p>原始28项能力权重尚未恢复，本次邀请未启用估计；该模块留白。</p>}</section>
 <section className="h5-result-section" id="module-5"><h2>4.2 职业角色</h2><MetricBars rows={ghReportRoles(r).map(x=>({name:x.name,value:x.scoreTotalCalibrateSeniorNew}))}/>{r.report_text.roles.map(x=><p key={x.item}><b>{x.label}：</b>{x.text}</p>)}</section>
 <section className="h5-result-section" id="module-6"><h2>4.3 职业优势</h2><p>优势星级：{'★'.repeat(r.grade.value)}{'☆'.repeat(5-r.grade.value)}</p>{r.report_text.strengths.groups.map(g=><div key={g.item}><h3>{g.name}</h3>{g.rows.map(x=><p key={x.item}><b>{x.name} · 第{x.rank}位：</b>{x.text}</p>)}</div>)}<p>最后6项：{r.report_text.strengths.bottom_six.map(x=>x.name).join('、')}</p><details><summary>查看全部34项才干顺序</summary><ol>{r.strengths.map(x=><li key={x.item}>{x.name} · 基础分 {x.score}</li>)}</ol></details></section>

 <div className="report-usage-note"><p>答题用时为本次已记录的前台活跃时间，暂停、关闭及长时间无操作不计入；历史未记录时间不补算。手机号码以脱敏形式展示。逻辑一致性暂未评定，不默认标为低、吻合或高。</p>{standard?'结果用于自我理解与发展沟通，不是心理诊断，不用于自动录用或淘汰。':<>这是发展参考结果，不保证与原版完全一致，不用于自动录用或淘汰。{'abilities' in r?'28项能力为历史数据拟合估计；不是原版权重实算。':'尚未确认的28项能力保持留白，不用零分代替。'}</>}{'inference' in r&&r.inference.outside_observed_domain?' 本次能力画像参考性较低，请结合实际经历核对。':''}</div>
 </div></details>
 </article>;
}
export {GhH5App} from './gh-h5-quiz.tsx';
