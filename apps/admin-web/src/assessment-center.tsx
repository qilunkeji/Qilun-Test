import {AssessmentBinding} from './assessment-binding.tsx';
import {PublicEntryManager} from './public-entry.tsx';
import {useProjectGroups,ProjectPicker,CreateProject,AssignProject} from './project-groups.tsx';
import {useEffect,useRef,useState} from 'react';
import {api} from './api.ts';
import type {Talent,Page} from './api.ts';
import {Notice,date,Loading,RetryError,ConfirmDialog} from './ui.tsx';
import {navigate,returnToList,useListState,useRestoreListScroll} from './navigation.ts';
import {invitationStats} from './ui-presentation.ts';
import {ReportView} from './h5.tsx';
import type {Report} from './h5.tsx';
import {ReferenceReportView} from './h5-reference.tsx';
import type {GhInviteReport} from '../../../packages/assessment-engine/gh-invite.ts';
import type {ReportMetadata} from './report-header.tsx';
import {canManageAssessment} from '../../../packages/security/assessment-access.ts';
import './assessment-center.css';
type Row={candidate_id?:string|null;project_group_id?:string|null;participant_kind?:string;id:string;name:string;title:string;purpose:string;expires_at:string;revoked_at:string|null;submitted_at:string|null;revision:number};
export function AssessmentCenter({role,initialReportId}:{role:string;initialReportId?:string}){
 const {groups,error:groupError,reload:reloadGroups}=useProjectGroups();
 const [total,setTotal]=useState(0),[standardReady,setStandardReady]=useState<boolean|null>(null);
 const [rows,setRows]=useState<Row[]>([]),[people,setPeople]=useState<Talent[]>([]),[creating,setCreating]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [report,setReport]=useState<{name:string;report:Report|GhInviteReport;submitted_at?:string;metadata?:ReportMetadata}>();
 const [filters,setFilters]=useListState('assessments',{q:'',search:'',tab:'invites',group:'',kind:'',page:1});
 const reports=filters.tab==='reports';
 const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[reportError,setReportError]=useState('');
 const request=useRef(0),reportRequest=useRef(0);
 const [pending,setPending]=useState<{id:string;name:string;action:'revoke'|'delete'}>();
 async function load(){
  const n=++request.current;setLoading(true);setLoadError('');
  try{
   const query=new URLSearchParams({q:filters.search,view:reports?'reports':'invites',page:String(filters.page)});
   if(filters.group)query.set('group',filters.group);if(filters.kind)query.set('kind',filters.kind);
   const r=await api<{items:Row[];standard_assessment_available:boolean;total:number}>(`/assessment/invites?${query}`);
   if(n!==request.current)return;setRows(r.items);setTotal(r.total);setStandardReady(r.standard_assessment_available);
  }catch(e){if(n===request.current)setLoadError((e as Error).message);}finally{if(n===request.current)setLoading(false);}
 }
 async function loadReport(){
  const n=++reportRequest.current;setReportError('');setReport(undefined);if(!initialReportId)return;
  try{const r=await api<NonNullable<typeof report>>(`/assessment/invites/${initialReportId}/report`);if(n===reportRequest.current)setReport(r);}
  catch{if(n===reportRequest.current)setReportError('报告暂不可访问，请确认账号权限、有效期或稍后重试。');}
 }
 useEffect(()=>{if(!initialReportId)void load();return()=>{request.current++;};},[initialReportId,filters.search,filters.group,filters.kind,filters.page,reports]);
 useEffect(()=>{api<Page<Talent>>('/talents?page_size=100').then(r=>setPeople(r.items)).catch(e=>setError(e.message));},[]);
 useEffect(()=>{void loadReport();return()=>{reportRequest.current++;};},[initialReportId]);
 useRestoreListScroll(!loading&&!loadError);
 const stats=invitationStats(rows);
 function switchTab(tab:string){if(tab===filters.tab)return;setCreating(false);setLoading(true);setRows([]);setFilters(x=>({...x,tab,page:1}));}
 if(initialReportId)return <section className="panel report-stage"><div className="assessment-report-back no-print"><button onClick={()=>returnToList('assessments')}>← 返回测评列表</button><span>个人测评结果</span></div>{reportError?<RetryError onRetry={()=>void loadReport()}>{reportError}</RetryError>:!report?<Loading>正在读取报告…</Loading>:'kind' in report.report&&report.report.kind==='qilun_277_invite_reference'?<ReferenceReportView report={report.report as GhInviteReport} name={report.name} submittedAt={report.submitted_at} metadata={report.metadata}/>:<ReportView report={report.report as Report} name={report.name}/>}</section>;
 return <>
  <div className="page-heading"><div><h1>测评中心</h1><p>邀请与进度在这里管理，完成后到报告页查看个人结果。</p></div>{!reports&&<button className="primary" aria-expanded={creating} onClick={()=>setCreating(!creating)}>{creating?'收起创建':'发起测评'}</button>}</div>
  <div className="tabbar" role="tablist" aria-label="测评中心页面" onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const target=e.key==='Home'?'invites':e.key==='End'?'reports':reports?'invites':'reports';switchTab(target);e.currentTarget.querySelector<HTMLButtonElement>('#assessment-tab-'+target)?.focus();}}><button role="tab" id="assessment-tab-invites" tabIndex={reports?-1:0} aria-selected={!reports} aria-controls="assessment-list" className={!reports?'active':''} onClick={()=>switchTab('invites')}>测评邀请</button><button role="tab" id="assessment-tab-reports" tabIndex={reports?0:-1} aria-selected={reports} aria-controls="assessment-list" className={reports?'active':''} onClick={()=>switchTab('reports')}>测评报告</button></div>
  <section className={'assessment-overview '+(reports?'assessment-reports-overview':'')} aria-busy={loading}>
   <div className="overview-intro"><h2>{reports?'查看个人测评结果':'邀请与答题进度'}</h2><p>{reports?'按人员查看已完成报告，支持保存图片与 PDF。':'生成共用链接，跟进每位参与者的答题状态。'}</p><small>{reports?'报告总数对应当前筛选；待关联数量基于本页。':'以下统计基于当前筛选页面的测评记录。'}</small></div>
   {loading?<Loading>正在读取{reports?'报告':'进度'}…</Loading>:loadError?<RetryError onRetry={()=>void load()}>{loadError}</RetryError>:<div className="overview-metrics">{(reports?[['已完成报告',total],['本页报告',rows.length],['本页待关联',rows.filter(r=>!r.candidate_id).length]]:[['参与记录',stats.total],['答题中 / 待完成',stats.pending],['已完成',stats.completed]]).map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>}
  </section>
  {groupError&&<Notice kind="error">项目组读取失败：{groupError}</Notice>}{error&&<Notice kind="error">{error}</Notice>}
  {pending&&<ConfirmDialog title={pending.action==='delete'?'删除本次测评数据':'停止本次测评访问'} busy={busy} error={error} onCancel={()=>{setPending(undefined);setError('');}} confirmLabel={pending.action==='delete'?'确认永久删除':'确认停止访问'} onConfirm={async()=>{if(busy)return;setBusy(true);setError('');try{await api(`/assessment/invites/${pending.id}/${pending.action}`,pending.action==='delete'?{confirm:'delete_assessment'}:{});setPending(undefined);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><p>当前对象：<strong>{pending.name}</strong></p><p>{pending.action==='delete'?'将永久删除本次答卷和报告，本界面不能恢复。不会删除该人员的其他档案；离线备份及下载文件不受影响。':'本人将无法继续答题或通过原链接访问本次报告；后台仍保留答卷和报告。其他参与者的独立答卷不受影响。'}</p></ConfirmDialog>}
  <PublicEntryManager groups={groups} creating={creating&&!reports} ready={!!standardReady} showHistory={!reports}>
   <section className="panel assessment-participants" id="assessment-list" role="tabpanel" aria-labelledby={reports?'assessment-tab-reports':'assessment-tab-invites'} aria-label={reports?'已完成报告':'参与者进度'}>
    <div className="section-heading"><div><h2>{reports?'已完成报告':'参与者进度'}</h2><p className="muted">{reports?'选择一位参与者，查看完整测评结果。':'参与者登记后，会在这里生成各自的测评记录。'}</p></div>{!reports&&<CreateProject onCreated={()=>void reloadGroups()}/>}</div>
    <form className="toolbar" onSubmit={e=>{e.preventDefault();setFilters(x=>({...x,search:x.q,page:1}));}}>
     <ProjectPicker filter groups={groups} value={filters.group} onChange={group=>setFilters(x=>({...x,group,page:1}))}/>
     <select aria-label="筛选参与者类型" value={filters.kind} onChange={e=>setFilters(x=>({...x,kind:e.target.value,page:1}))}><option value="">全部参与者</option><option value="internal">内部人员</option><option value="external">外部 / 独立测评</option></select>
     <input placeholder="搜索姓名" aria-label="搜索测评人员" value={filters.q} onChange={e=>setFilters(x=>({...x,q:e.target.value}))}/><button>搜索</button>
     {(filters.q||filters.search)&&<button type="button" onClick={()=>setFilters(x=>({...x,q:'',search:'',page:1}))}>清空条件</button>}<button type="button" onClick={()=>void load()}>{reports?'刷新报告':'刷新进度'}</button>
    </form>
    {loading?<Loading>正在读取{reports?'报告':'参与者'}列表…</Loading>:loadError?<RetryError onRetry={()=>void load()}>{loadError}</RetryError>:rows.length?<>
     <p className="table-hint">左右滑动可查看完整{reports?'报告信息':'进度与操作'}。</p>
     <div className="table-scroll"><table>
      <thead><tr><th>姓名</th>{reports?<><th>测评用途</th><th>所属项目</th><th>完成时间</th><th>档案关联</th></>:<><th>所属项目</th><th>答题状态</th><th>访问截止</th></>}<th>操作</th></tr></thead>
      <tbody>{rows.map(r=><tr key={r.id}>
       <td><strong>{r.name}</strong><small>{r.participant_kind==='external'?'外部 / 独立测评':'内部人员'}</small></td>
       {reports?<><td className="assessment-purpose">{r.purpose}</td><td>{groups.find(g=>g.id===r.project_group_id)?.name??'未分组'}</td><td>{date(r.submitted_at!)}</td><td><span className={'assessment-binding-state '+(r.candidate_id?'linked':'')}>{r.candidate_id?'已关联档案':'待关联档案'}</span></td></>:<><td><AssignProject target="assessment/invites" id={r.id} current={r.project_group_id} groups={groups} onDone={()=>void load()}/><small>{r.candidate_id?'已关联档案':'待关联档案'}</small></td><td><span className={'status-pill '+(r.submitted_at?'done':r.revoked_at||new Date(r.expires_at)<new Date()?'closed':'')}>{r.submitted_at?'已完成':r.revoked_at?'已停止访问':new Date(r.expires_at)<new Date()?'已到期':r.revision?'答题中':'待开始'}</span></td><td>{date(r.expires_at)}</td></>}
       <td><div className="assessment-row-actions">{r.submitted_at&&<button className="report-action" onClick={()=>navigate({view:'assessments',id:r.id})}>查看报告 →</button>}{!r.candidate_id&&<AssessmentBinding id={r.id} name={r.name} people={people} onDone={()=>void load()}/>}</div>
        {(!reports||canManageAssessment(role))&&<details className="danger-menu"><summary>{reports?'报告管理':'更多操作'}</summary><div>{!reports&&!r.revoked_at&&<button className="danger" onClick={()=>setPending({id:r.id,name:r.name,action:'revoke'})}>停止本次访问</button>}{canManageAssessment(role)&&<button className="danger" onClick={()=>setPending({id:r.id,name:r.name,action:'delete'})}>永久删除本次测评</button>}</div></details>}
       </td>
      </tr>)}</tbody>
     </table></div>
    </>:<div className="empty"><h3>{filters.search?'没有符合条件的记录':reports?'暂时没有已完成报告':'还没有参与者登记'}</h3><p>{filters.search?'请清空条件或更换搜索词。':reports?'参与者完成并提交测评后，个人报告会自动出现在这里。':'点击“发起测评”创建共用链接，参与者登记后可查看进度。'}</p>{reports&&!filters.search&&<button onClick={()=>switchTab('invites')}>前往测评邀请</button>}</div>}
    <div className="toolbar assessment-pagination"><button type="button" disabled={loading||filters.page<=1} onClick={()=>setFilters(x=>({...x,page:x.page-1}))}>上一页</button><span>第 {filters.page} 页 · 共 {total} {reports?'份报告':'条参与记录'}</span><button type="button" disabled={loading||filters.page*100>=total} onClick={()=>setFilters(x=>({...x,page:x.page+1}))}>下一页</button></div>
    <p className="muted assessment-list-note">{reports?'姓名以本人填写为准。报告独立保存；关联档案前请核对人员信息。':'一条链接可供多人使用，无需密码。每人填写自己的姓名，答案和进度分别保存。'}</p>
   </section>
  </PublicEntryManager>
 </>;
}
