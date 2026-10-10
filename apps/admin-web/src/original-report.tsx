import {useEffect,useRef,useState} from 'react';
import {saveReportImage} from './report-export.ts';
import {reportHeaderBranding,reportCoverBranding,reportFooterContactMask,reportFooterBranding,reportBodyBranding} from './report-branding.ts';
import {QilunReportCoverArt} from './qilun-report-cover.tsx';
import {GhReportPlots,ghReportFields} from './gh-report-preview.tsx';
import type {GhDisplayReport as GhReportReplay} from '../../../packages/assessment-engine/gh-inference.ts';
import './original-report.css';
import {ReportHeader} from './report-header.tsx';
import type {ReportMetadata} from './report-header.tsx';
import {date as formatDate} from './ui.tsx';

type Slot={id:string;x:number;y:number;width:number;height:number};
type Sheet={id:string;document:'data'|'talent';page:number;title:string;width:number;height:number;src:string;slots:Slot[]};
type Manifest={version:string;palette:string[];pages:Sheet[]};
type Mode='blank'|'recorded'|'computed';

/** Keep the original geometry separate from the app theme. Recorded, manually
 * filled and versioned partial calculation views must remain distinguishable. */
export function OriginalReportStudio({sourceBase='/api/v1/assessment/layout/source/',initialMode='blank',replay,dataOnly=false,personName,submittedAt,metadata}:{sourceBase?:string;initialMode?:Mode;replay?:GhReportReplay;dataOnly?:boolean;personName?:string;submittedAt?:string|null;metadata?:ReportMetadata}){
 const [manifest,setManifest]=useState<Manifest>(),[sheet,setSheet]=useState('data'),[mode,setMode]=useState<Mode>(replay?'computed':initialMode);
 const [error,setError]=useState(''),[editing,setEditing]=useState(false),[selected,setSelected]=useState(''),[zoom,setZoom]=useState('fit');
 const [fields,setFields]=useState<Record<string,string>>({});
 const sheetRef=useRef<HTMLDivElement>(null),[saving,setSaving]=useState(false);
 useEffect(()=>{fetch('/report-layout/manifest.json').then(r=>{if(!r.ok)throw new Error('尚未生成原版报告母版');return r.json();}).then(setManifest).catch(e=>setError(e.message));},[]);
 if(!manifest)return <div className="original-studio"><p role="status">{error||(replay&&'product' in replay?'正在加载测评数据表…':'正在加载原版报告母版…')}</p></div>;
 const page=manifest.pages.find(p=>p.id===sheet)!;
 const branding=reportHeaderBranding(page.id);
 const cover=page.id==='talent-01'?reportCoverBranding:undefined;
 const footerMask=reportFooterContactMask(page.id);
 const footerBrand=reportFooterBranding(page.id);
 const bodyBrand=reportBodyBranding(page.id,mode==='recorded');
 const placement=(box:{x:number;y:number;width:number;height:number})=>({left:`${box.x/page.width*100}%`,top:`${box.y/page.height*100}%`,width:`${box.width/page.width*100}%`,height:`${box.height/page.height*100}%`});
 const fieldKey=(id:string)=>`${page.id}/${id}`;
 const active=page.slots.find(s=>s.id===selected);
 const hasFilledFields=Object.values(fields).some(v=>v.trim());
 const computed:Record<string,string>=mode==='computed'&&replay?{...ghReportFields(replay),...(personName?{'person.name':personName}:{}),...(submittedAt?{'assessment.date':new Date(submittedAt).toLocaleDateString()}:{} )}:{};
 const standard=mode==='computed'&&replay&&'product' in replay;
 // Data-page copy has individual original PDF baselines and dynamic talent
 // groups, not one block of evenly spaced HTML lines. Manual slots stay intact.
 const svgCopyFields=new Set([...(page.id==='data'&&mode==='computed'?['person.name','person.phone','person.birth_date','assessment.date','assessment.duration']:[]),'style.type','style.temperament','values.interpretation','motivation.interpretation','roles.interpretation','strengths.summary']);
 function selectPage(value:string){setSheet(value);setSelected('');setError('');}
 return <section className="original-studio" aria-label={standard?'齐论测评数据表':'原版报告版式'}>
  <div className="original-toolbar no-print">
   <div>{dataOnly?<><h1>{metadata?.participant_name??personName?`${metadata?.participant_name??personName} · 测评结果`:'测评数据报告'}</h1><p>七模块数据总览{submittedAt?` · 完成于 ${formatDate(submittedAt)}`:''}</p></>:<><h2>原版报告</h2><p>{standard?'性格与发展数据总览':'一页数据总览 · 十页人才报告'}</p></>}</div>
   <div className="original-controls">
    {!dataOnly&&<label>报告页面<select aria-label="原版报告页面" value={sheet} onChange={e=>selectPage(e.target.value)}><optgroup label="数据报告"><option value="data">七模块数据总览</option></optgroup><optgroup label="人才报告 · 10页">{manifest.pages.filter(p=>p.document==='talent').map(p=><option value={p.id} key={p.id}>{p.page}. {p.title}</option>)}</optgroup></select></label>}
    <label>显示比例<select aria-label="显示比例" value={zoom} onChange={e=>setZoom(e.target.value)}><option value="fit">适合窗口</option><option value="native">原稿尺寸</option></select></label>
    {dataOnly&&<button className="report-save-image" disabled={saving} onClick={async()=>{if(!sheetRef.current)return;setSaving(true);setError('');try{await saveReportImage(sheetRef.current,'齐论AI-测评数据报告.png');}catch(e){setError((e as Error).message);}finally{setSaving(false);}}}>{saving?'正在生成…':'保存图片'}</button>}
    <button onClick={()=>window.print()}>{dataOnly?'打印 / 保存 PDF':'打印当前页'}</button>
   </div>
  </div>
  {!standard&&<div className="original-modebar no-print">
   {!dataOnly&&<div><button aria-pressed={mode==='blank'} onClick={()=>{setMode('blank');setError('');}}>留白模板</button><button aria-pressed={mode==='recorded'} onClick={()=>{setMode('recorded');setEditing(false);setError('');}}>原稿录入对照</button>{replay&&<button aria-pressed={mode==='computed'} onClick={()=>{setMode('computed');setEditing(false);setError('');}}>本次计算预览</button>}</div>}
   <p>{mode==='recorded'?'原PDF的版式与样例结果录入，仅用于对照；不是本系统重新计分。':mode==='computed'?(replay&&'abilities' in replay?'七模块短文案使用原字典与已知规则；28项能力为反推估计。保留原版版型和颜色，尚不是原版全同结果。':'七模块短文案已按原字典与已知规则匹配；能力区域仍留白。2025历史版本全同待验。'):'保留原稿版型、字体轮廓、颜色和图表坐标；个人结果留空，不补零、不推算。'}</p>
  </div>}
  {error&&<p role="alert" className="original-error no-print">{error}</p>}
  {!standard&&<div className="original-editor-tools no-print">
   <span>{page.title} · 原稿 {page.width} × {page.height} pt</span>
   {mode==='blank'&&<><button aria-pressed={editing} onClick={()=>setEditing(!editing)}>{editing?'收起字段位置':'查看 / 填写留白字段'}</button><button disabled={!hasFilledFields} onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({version:manifest.version,kind:'manual_layout_fill',fields},null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='原版报告-手工填录.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>导出手工填录</button></>}
  </div>}
  {editing&&mode==='blank'&&<div className="original-field-editor no-print"><label>留白字段<select aria-label="留白字段" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">选择字段，或点击页内虚线区域</option>{page.slots.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</select></label>{active&&<label>手工填录内容（不会自动计分）<textarea aria-label="手工填录内容" value={fields[fieldKey(active.id)]??''} onChange={e=>setFields(f=>({...f,[fieldKey(active.id)]:e.target.value}))}/></label>}<p>输入仅保留在当前页面内存中。留白框不参与打印，原稿样例不会被覆盖。</p></div>}
  <div className={'original-scroll '+(zoom==='native'?'original-native':'')}>
   <div ref={sheetRef} className="original-sheet" data-document={page.document} style={{maxWidth:`${page.width}px`,aspectRatio:`${page.width}/${page.height}`}}>
    <img className="original-sheet-vector" key={`${mode}-${sheet}`} src={mode==='recorded'?`${sourceBase}${page.id}.svg`:page.src} alt={`${mode==='recorded'?'原稿录入样例':mode==='computed'?'部分计算报告':'留白模板'}：${page.title}`} onError={()=>setError(mode==='recorded'?'本机原稿样例不可用或需要重新登录。留白模板仍可使用；私人原稿未打包进公开资源。':'报告模板加载失败，请检查本地构建资源。')}/>
    {mode==='computed'&&replay&&<GhReportPlots page={page.id} width={page.width} height={page.height} replay={replay}/>}
    {branding&&<><div className="original-header-logo" style={placement(branding.logo)}><img src={branding.logo.src} alt={branding.logo.alt}/></div>{branding.hiddenQr&&<div className="original-header-qr-removed" style={placement(branding.hiddenQr)} aria-hidden="true"/>}</>}
    {cover&&<><div className="original-cover-art" style={placement(cover.artwork)}><QilunReportCoverArt/></div><div className="original-cover-title" style={{...placement(cover.title),fontSize:`${64/page.width*100}cqw`}}>{cover.title.text}</div></>}
    {footerMask&&<div className="original-brand-mask" style={placement(footerMask)} aria-hidden="true"/>}
    {footerBrand&&<div className="original-footer-brand" style={{...placement(footerBrand),fontSize:`${14/page.width*100}cqw`}}>{footerBrand.text}</div>}
    {bodyBrand.map((box,i)=><div className="original-body-brand" key={i} style={{...placement(box),fontSize:`${16/page.width*100}cqw`}}>{box.text}</div>)}
    {mode==='computed'&&page.id==='data'&&<ReportHeader name={personName} date={submittedAt} metadata={metadata} width={page.width} height={page.height}/>}
    {mode==='computed'&&replay&&'abilities' in replay&&<div className="original-inference-label" style={{fontSize:`${12/page.width*100}cqw`}}>{standard?'能力为模型推算参考评分':'能力为反推估计 · 非原版实算'} · 不作自动录用依据{replay.inference.outside_observed_domain?' · 本次能力画像参考性较低':''}</div>}
    {mode!=='recorded'&&page.slots.filter(s=>!(mode==='computed'&&page.id==='data'&&svgCopyFields.has(s.id))).map(s=><div key={s.id} className={'original-slot '+(editing&&mode==='blank'?'original-slot-editable':'')} style={{left:`${s.x/page.width*100}%`,top:`${s.y/page.height*100}%`,width:`${s.width/page.width*100}%`,height:`${s.height/page.height*100}%`}}>{editing&&mode==='blank'&&<button className="original-slot-hit no-print" aria-label={`填写 ${s.id}`} onClick={()=>setSelected(s.id)} title={s.id}/>}<div className="original-slot-text" style={{fontSize:`${(page.id==='talent-01'?24:page.document==='data'?12:16)/page.width*100}cqw`}}>{mode==='computed'?computed[s.id]??'':fields[fieldKey(s.id)]??''}</div></div>)}
   </div>
  </div>
  {!standard&&<p className="original-provenance no-print">版式参考用户提供的2025版PDF；展示品牌已统一为齐论AI，旧二维码、网址及联系电话已移除。{cover?'封面已替换齐论品牌元素与内部报告标题。':''}{mode==='computed'?'本页为当前配置的部分计算结果；完整报告与历史版本仍待验证。':mode==='recorded'?'样例数据仍来自原稿，不是本系统重新计分。':'未接入的结果字段保持空白；手工填录不会自动计分。'}</p>}
 </section>;
}
