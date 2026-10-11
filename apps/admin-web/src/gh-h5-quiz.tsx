import {useEffect,useRef,useState} from 'react';
import type {GhInviteReport,GhValueDraft} from '@qilun/assessment-engine/gh-invite.ts';
import {resumeGhProgress} from '@qilun/assessment-engine/gh-progress.ts';
import type {GhProgress} from '@qilun/assessment-engine/gh-progress.ts';
import {DraftAutosaver,stableDraftJSON} from './draft-autosaver.ts';
import type {SaveStatus} from './draft-autosaver.ts';
import {ReferenceReportView} from './h5-reference.tsx';
import type {GhOpen} from './h5-reference.tsx';
import {GhAnswerQuestion} from './gh-answer-question.tsx';
import './h5-answer-design.css';

type Snapshot={active_seconds?:number;answers:Record<string,number>;value_draft:GhValueDraft;ui_progress:GhProgress};
export function GhH5App({token,pin,initial}:{token:string;pin?:string;initial:GhOpen}){
 const resume=(r:GhOpen)=>resumeGhProgress(r.package.questions.map(q=>q.id),r.answers,r.value_draft,r.ui_progress);
 const [data,setData]=useState(initial),[answers,setAnswers]=useState(initial.answers),[values,setValues]=useState(initial.value_draft),[progress,setProgress]=useState(()=>resume(initial));
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState<SaveStatus>('saved'),[agreed,setAgreed]=useState(false),[confirmSubmit,setConfirmSubmit]=useState(false);
 const [participantName,setParticipantName]=useState('');
 const [phone,setPhone]=useState(''),[birthDate,setBirthDate]=useState(''),[timingTick,setTimingTick]=useState(0);
 const elapsed=useRef(initial.metadata?.active_seconds??0);
 const tracking=useRef(initial.consented&&!initial.submitted&&(!initial.metadata||initial.metadata.profile_completed));
 const profileValid=!!participantName.trim()&&/^\+?[0-9]{7,15}$/.test(phone)&&/^\d{4}-\d{2}-\d{2}$/.test(birthDate)&&birthDate>='1900-01-01'&&birthDate<=new Date().toISOString().slice(0,10);
 const profileFields=<div className="h5-profile-fields"><h2>填写基本信息</h2><p>每次测评请填写本人资料，手机号码将脱敏呈现。</p><label className="field"><span>姓名</span><input autoComplete="name" maxLength={80} value={participantName} onChange={e=>setParticipantName(e.target.value)} required/></label><label className="field"><span>手机号码</span><input type="tel" inputMode="tel" autoComplete="tel" maxLength={16} value={phone} onChange={e=>setPhone(e.target.value)} required/></label><label className="field"><span>出生日期</span><input type="date" autoComplete="bday" min="1900-01-01" max={new Date().toISOString().slice(0,10)} value={birthDate} onChange={e=>setBirthDate(e.target.value)} required/></label></div>;
 async function saveProfile(){const result=await call<{metadata:NonNullable<GhOpen['metadata']>}>('consent',{accepted:true,consent_version:pkg.consent_version,profile:{name:participantName.trim(),phone,birth_date:birthDate}});elapsed.current=result.metadata.active_seconds??elapsed.current;tracking.current=true;setData(d=>({...d,consented:true,metadata:result.metadata}));}
 useEffect(()=>{if(!data.consented||data.submitted||data.metadata&&!data.metadata.profile_completed)return;let last=Date.now();const activity=()=>{last=Date.now();};const events=['pointerdown','keydown','scroll'] as const;events.forEach(e=>window.addEventListener(e,activity,{passive:true}));const timer=setInterval(()=>{if(document.visibilityState==='visible'&&Date.now()-last<120000){elapsed.current++;if(elapsed.current%30===0)setTimingTick(x=>x+1);}},1000);return()=>{clearInterval(timer);events.forEach(e=>window.removeEventListener(e,activity));};},[data.consented,data.submitted,data.metadata?.profile_completed]);
 const saver=useRef<DraftAutosaver<Snapshot>|null>(null),snapshot=useRef<Snapshot>({answers,value_draft:values,ui_progress:progress});
 const pkg=data.package,questions=pkg.questions,pages=Math.ceil(questions.length/3),count=Object.keys(answers).length,{phase,page,group}=progress;
 async function call<T>(action:string,body:object={}):Promise<T>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{const response=await fetch(`/api/v1/public/assessment/${action}`,{method:'POST',credentials:'omit',keepalive:true,signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,...body})});
   const j=await response.json();if(!response.ok)throw Object.assign(new Error(j.error?.message??'操作失败'),{code:j.error?.code});return j.data;
  }finally{clearTimeout(timeout);}
 }
 function createSaver(r:GhOpen,value:Snapshot){
  return new DraftAutosaver(r.revision,value,async(sent,revision)=>{
   try{return await call<{revision:number}>('save',{...sent,revision});}
   catch(error){
    // A response can be lost after the server commits. Acknowledge only an
    // exact matching snapshot; never merge or overwrite a different tab.
    if(!(error as {code?:string}).code||(error as {code?:string}).code==='DRAFT_CONFLICT'){
     const remote=await call<GhOpen>('open');
     if(!remote.submitted&&remote.revision>revision&&stableDraftJSON({answers:remote.answers,value_draft:remote.value_draft,ui_progress:remote.ui_progress,...(sent.active_seconds!==undefined?{active_seconds:sent.active_seconds}:{})})===stableDraftJSON(sent))return {revision:remote.revision};
    }
    throw error;
   }
  },(state,problem)=>{setStatus(state);if(state==='error')setError((problem as Error).message+'。未保存的内容仍在本页，请勿关闭。');else if(state==='saved')setError('');});
 }
 useEffect(()=>{
  const value={answers:initial.answers,value_draft:initial.value_draft,ui_progress:resume(initial)};
  const controller=createSaver(initial,value);saver.current=controller;
  const flush=()=>{if(tracking.current){const value={...snapshot.current,active_seconds:elapsed.current};snapshot.current=value;saver.current?.update(value);}if(saver.current?.dirty)void saver.current.flush().catch(()=>{});};
  const visibility=()=>{if(document.visibilityState==='hidden')flush();};
  const warn=(e:BeforeUnloadEvent)=>{if(saver.current?.dirty){flush();e.preventDefault();e.returnValue='';}};
  window.addEventListener('online',flush);window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',visibility);window.addEventListener('beforeunload',warn);
  return()=>{saver.current?.dispose();window.removeEventListener('online',flush);window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('beforeunload',warn);};
 },[token,pin]);
 useEffect(()=>{const value={answers,value_draft:values,ui_progress:progress,active_seconds:elapsed.current};snapshot.current=value;if(data.consented&&!data.submitted)saver.current?.update(value);},[answers,values,progress,timingTick,data.consented,data.submitted]);
 function change(next:Partial<Snapshot>){
  const value={...snapshot.current,...next,active_seconds:elapsed.current};snapshot.current=value;
  if(next.answers)setAnswers(next.answers);if(next.value_draft)setValues(next.value_draft);if(next.ui_progress)setProgress(next.ui_progress);
  setConfirmSubmit(false);if(data.consented&&!data.submitted)saver.current?.update(value);
 }
 function navigate(next:Partial<GhProgress>){change({ui_progress:{...snapshot.current.ui_progress,...next}});}
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();}catch(e){setError((e as Error).message+'。未保存的内容仍在本页，请勿关闭。');}finally{setBusy(false);}}
 async function reload(){
  if(saver.current?.isSaving)throw new Error('正在保存，请稍后再读取');
  if(saver.current?.dirty&&!window.confirm('重新读取会放弃本页未保存的修改，继续吗？'))return;
  saver.current?.cancelScheduled();
  const r=await call<GhOpen>('open'),value={answers:r.answers,value_draft:r.value_draft,ui_progress:resume(r)};
  // No in-flight save is allowed when this button is enabled.
  saver.current?.dispose();saver.current=createSaver(r,value);snapshot.current=value;
  elapsed.current=r.metadata?.active_seconds??0;tracking.current=r.consented&&!r.submitted&&(!r.metadata||r.metadata.profile_completed);setData(r);setAnswers(r.answers);setValues(r.value_draft);setProgress(value.ui_progress);setStatus('saved');setConfirmSubmit(false);
 }
 async function submit(){
  const value={...snapshot.current,active_seconds:elapsed.current};snapshot.current=value;saver.current!.update(value);await saver.current!.flush();
  const r=await call<{revision:number;report:GhInviteReport|null;submitted:boolean;metadata?:GhOpen['metadata'];submitted_at?:string}>('submit',{...value,revision:saver.current!.revision});
  if(r.submitted){tracking.current=false;saver.current!.dispose();setConfirmSubmit(false);setData(d=>({...d,submitted:true,report:r.report,submitted_at:r.submitted_at??new Date().toISOString(),metadata:r.metadata??d.metadata}));}
 }
 const word=(id:string)=>pkg.words.find(w=>w.id===id)!;
 function toggle(id:string){
  const current=snapshot.current.value_draft;
  if(phase==='groups'){
   const selected=current.selected.map((items,i)=>i===group?(items.includes(id)?items.filter(x=>x!==id):items.length<5?[...items,id]:items):items);
   if(JSON.stringify(selected)!==JSON.stringify(current.selected))change({value_draft:{selected,ranked:[]}});
  }else{const ranked=current.ranked.includes(id)?current.ranked.filter(x=>x!==id):current.ranked.length<10?[...current.ranked,id]:current.ranked;change({value_draft:{...current,ranked}});}
 }
 function move(i:number,d:number){const current=snapshot.current.value_draft,ranked=[...current.ranked];[ranked[i],ranked[i+d]]=[ranked[i+d],ranked[i]];change({value_draft:{...current,ranked}});}
 const complete=count===questions.length&&values.selected.every(items=>items.length===5)&&values.ranked.length===10;
 return <main className="h5-shell h5-reference h5-assessment"><div className="h5-brand"><img src="/brand/qilun-logo-light.png" alt="齐论AI"/><span>内部性格与发展测评</span></div>
  {error&&<div role="alert" className="notice error"><p>{error}</p><button disabled={busy||status==='saving'} onClick={()=>void run(async()=>{await saver.current!.flush();})}>重试保存</button><button disabled={busy||status==='saving'} onClick={()=>void run(reload)}>读取服务器进度</button></div>}
  {data.submitted&&data.report?<div className="h5-card"><ReferenceReportView report={data.report} name={data.name} submittedAt={data.submitted_at} metadata={data.metadata}/><p className="muted no-print">报告已自动生成。下次可通过同一浏览器打开原测评链接再次查看。</p></div>
  :data.consented&&data.metadata&&!data.metadata.profile_completed?<section className="h5-card">{profileFields}<button className="primary" disabled={!profileValid||busy} onClick={()=>void run(saveProfile)}>保存并继续答题</button></section>
  :!data.consented?<section className="h5-card h5-welcome"><span className="eyebrow">QILUN / KNOW YOURSELF</span><h1>齐论内部<br/>性格与发展测评</h1><p className="h5-welcome-lead">留一段专注的时间，<br/>看见更真实的自己。</p><p>从日常行为、内在驱动力与个人优势出发，梳理你习惯的思考、协作与行动方式，为自我理解与成长沟通提供新的视角。</p><div className="h5-welcome-guide"><p><b>01 · 预留约30分钟</b><span>建议在安静、不被打扰的环境中完成。用时因人而异，可以中途暂停。</span></p><p><b>02 · 认真对待每一道题</b><span>按最近一段时间的真实状态作答，不必寻找“正确答案”。</span></p><p><b>03 · 遵循内心的第一判断</b><span>选择更像自己的描述，而不是别人期待你成为的样子。</span></p></div><p className="h5-welcome-note">结果供自我探索与内部发展沟通参考，不是心理诊断，也不作为自动录用或淘汰依据。答案仅供本人及有权限的齐论工作人员按邀请用途查看。</p><details className="h5-participation"><summary>参与须知与数据说明</summary><p>邀请用途：{data.purpose}</p><p>你的答案及结果会被保存，可在同一浏览器打开原链接继续。邀请访问截止 {new Date(data.expires_at).toLocaleString()}；截止不等于自动删除。如需删除，请联系邀请人；离线备份与已下载文件需另行处理。</p><p>{'rule_profile' in pkg?'本次结果依据齐论固定规则生成。能力分数为模型推算的参考评分，不等同于实际技能或绩效。':pkg.estimate_abilities?'本次结果包含部分能力估计，可能有误差，报告会明确标注。':'暂不提供能力估计，相关区域保持空白。'}结果供参考，不代表完整或确定的人才判断。</p><p>参加是自愿的；不愿参加可关闭页面，并联系邀请人选择其他沟通方式。</p></details>{profileFields}<label className="check-label"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/>我自愿参加，已了解参与须知，同意按邀请用途保存本次答案及结果。</label><button className="primary" disabled={!agreed||!profileValid||busy} onClick={()=>void run(saveProfile)}>开启自我探索</button></section>
  :<section className="h5-card h5-quiz"><div className="h5-quiz-heading"><span className="h5-quiz-kicker">QILUN / DISCOVER YOURSELF</span><div className="section-heading"><h1>{phase==='questions'?'Part A':'Part B'}</h1><span>{phase==='questions'?`第 ${page*3+1}–${Math.min(questions.length,page*3+3)} 题`:'偏好选择'}</span></div><p>每一次选择，都更接近真实的你。</p></div><div className="h5-quiz-progress"><progress aria-label="测评作答进度" value={count} max={questions.length}/><p role="status" className={'h5-save-status '+(status==='error'?'failed':'')}>{status==='saved'?'已自动保存 · 下次从这里继续':status==='saving'?'正在保存…':status==='pending'?'准备保存…':'保存未完成，请重试'}</p></div><div className="h5-phase-nav"><button disabled={busy} aria-pressed={phase==='questions'} onClick={()=>navigate({phase:'questions'})}>Part A</button><button disabled={busy} aria-pressed={phase!=='questions'} onClick={()=>navigate({phase:'groups'})}>Part B</button></div>
   {phase==='questions'?<><p className="muted h5-answer-guide">请选择更符合自己的描述，点选圆点即可。</p><div className="h5-question-list">{questions.slice(page*3,page*3+3).map(q=><GhAnswerQuestion key={q.id} question={q} choices={pkg.choices} value={answers[q.id]} disabled={busy} onSelect={value=>change({answers:{...snapshot.current.answers,[q.id]:value}})}/>)}</div><div className="h5-page-control"><button disabled={busy||!page} onClick={()=>navigate({page:page-1})}>上一组</button><label>第<select aria-label="答题组页码" disabled={busy} value={page} onChange={e=>navigate({page:Number(e.target.value)})}>{Array.from({length:pages},(_,i)=><option key={i} value={i}>{i+1}</option>)}</select>组</label><button className="primary" disabled={busy} onClick={()=>page<pages-1?navigate({page:page+1}):navigate({phase:'groups',group:0})}>{page===pages-1?'进入 Part B':'下一组'}</button></div><button className="text-button" disabled={busy} onClick={()=>{const missing=questions.findIndex(q=>answers[q.id]===undefined);if(missing>=0)navigate({page:Math.floor(missing/3)});}}>跳到未完成题目</button></>
   :<><h2>{phase==='groups'?`第 ${group+1} 组 · 选择5项（${values.selected[group].length}/5）`:phase==='shortlist'?`选择10项（${values.ranked.length}/10）`:'调整先后顺序'}</h2><p className="muted">{phase==='groups'?'选出对你更重要的5项。重新选择本组会清空后续选择。':phase==='shortlist'?'从已选内容中，保留对你更重要的10项。':'第1项最重要。用上移、下移调整。'}</p>{phase==='rank'?<ol className="h5-value-ranking">{values.ranked.map((id,i)=><li key={id}><span><b>{i+1}.</b> {word(id).title}</span><div><button aria-label={`${word(id).title}上移`} disabled={busy||!i} onClick={()=>move(i,-1)}>上移</button><button aria-label={`${word(id).title}下移`} disabled={busy||i===9} onClick={()=>move(i,1)}>下移</button></div></li>)}</ol>:<div className="h5-word-grid">{(phase==='groups'?pkg.value_groups[group]:values.selected.flat()).map(id=><button key={id} disabled={busy} aria-pressed={(phase==='groups'?values.selected[group]:values.ranked).includes(id)} onClick={()=>toggle(id)}><b>{word(id).title}</b><small>{word(id).description}</small></button>)}</div>}<div className="h5-actions">{phase==='groups'?<><button disabled={busy||!group} onClick={()=>navigate({group:group-1})}>上一组</button><button className="primary" disabled={busy||values.selected[group].length!==5} onClick={()=>group<3?navigate({group:group+1}):navigate({phase:'shortlist'})}>{group===3?'继续':'下一组'}</button></>:phase==='shortlist'?<><button disabled={busy} onClick={()=>navigate({phase:'groups'})}>返回</button><button className="primary" disabled={busy||values.ranked.length!==10||!values.selected.every(s=>s.length===5)} onClick={()=>navigate({phase:'rank'})}>继续</button></>:<><button disabled={busy} onClick={()=>navigate({phase:'shortlist'})}>返回选择</button><button className="primary" disabled={busy||!complete} onClick={()=>setConfirmSubmit(true)}>核对并提交</button></>}</div>{phase==='rank'&&!complete&&<p role="alert">Part A 还有 {questions.length-count} 题未完成。</p>}</>}
   {confirmSubmit&&<div role="alert" className="h5-submit-confirm"><h2>确认提交？</h2><p>全部内容已完成。提交后不可修改，将生成本次性格与发展参考结果。</p><button disabled={busy} className="primary" onClick={()=>void run(submit)}>{busy?'正在提交…':'确认提交并查看结果'}</button><button disabled={busy} onClick={()=>setConfirmSubmit(false)}>再检查一下</button></div>}<p className="muted h5-resume-note">答案与停留位置会自动保存。网络中断或提示保存失败时，请保留页面，联网后重试。</p></section>}
 </main>;
}
