import type {GhDisplayReport as GhReportReplay} from '@qilun/assessment-engine/gh-inference.ts';
import {ghReportValues,ghReportRoles,ghRadarGeometry} from './gh-report-data.ts';
import {halfUp} from '@qilun/assessment-engine/gh-rounding.ts';
const palette=['#ed8a8a','#e2b4b3','#6ac36c','#b3d9ad','#73a0fb','#b0c6f9','#f7c739','#f6dd9a'];
const shown=(v:number)=>halfUp(v,2).toString();

export function ghReportFields(r:GhReportReplay):Record<string,string>{
 const roles=ghReportRoles(r);
 const strengths=r.strengths;
 const style=r.style.code;
 const standard='product' in r;
 return {
  ...('abilities' in r?{
   'abilities.overview':standard?'依据齐论固定规则呈现能力画像，供自我理解与发展沟通参考；不等同于实际技能或绩效。':'28项分数由历史结果反推估计，仅用于核验；尚不能保证与原版一致。',
   'abilities.top_six':r.ability_summary.top_six.map((a,i)=>`${i+1}. ${a.name}　${a.value}${standard?'':'（估计）'}`).join('\n\n'),
   'abilities.bottom_three':r.ability_summary.bottom_three.map(a=>`${a.name}　${a.value}${standard?'':'（估计）'}`).join('\n\n'),
   // The four original boxes are not evenly spaced text lines. Their values
   // are positioned independently in GhReportPlots, leaving this slot empty.
   'abilities.layers':'',
  }:{}),
  'style.type':`${style}（${r.style.name}）`,
  'style.temperament':r.report_text.temperament.text,
  'values.interpretation':r.report_text.values.map(v=>`${v.label}：${v.text}`).join('\n'),
  'motivation.interpretation':r.report_text.motivation.lines.map(v=>v.text).join('\n'),
  'roles.interpretation':r.report_text.roles.map(v=>`${v.label}：${v.text}`).join('\n'),
  'strengths.top_bottom':`前6项：${strengths.slice(0,6).map(x=>x.name).join('、')}\n最后6项：${strengths.slice(-6).map(x=>x.name).join('、')}`,
  'strengths.summary':r.report_text.strengths.groups.map(g=>`${g.name}\n${g.rows.map(s=>`${s.name}：${s.text}——第${s.rank}位`).join('\n')}`).join('\n')+`\n最后6项：${strengths.slice(-6).map(x=>x.name).join('、')}`,
  'traits.table':r.traits.children.map(x=>`${x.name} ${x.score}`).join('　'),
  'roles.primary':`${roles[0].name}：${shown(roles[0].scoreTotalCalibrateSeniorNew)}`,
  'roles.secondary':`${roles[1].name}：${shown(roles[1].scoreTotalCalibrateSeniorNew)}`,
  'motivation.top_bottom':`当前动机图表值：\n${r.motivation.map(x=>`${x.name} ${x.report_value}`).join('　')}`,
  'values.summary':ghReportValues(r).filter(x=>x.report_value!==null).slice(0,3).map(x=>`${x.label} ${x.report_value}`).join('　'),
 };
}
type Bar={value:number|null;color:string};
function Bars({x,y,width,height,max,rows,paired=false}:{x:number;y:number;width:number;height:number;max:number;rows:Bar[];paired?:boolean}){
 return <g>{rows.map((r,i)=>{
  if(r.value===null)return null;
  const cell=width/(paired?11:rows.length),w=cell*.69,left=x+(paired?i+Math.floor(i/2):i)*cell+cell*.155,h=Math.max(0,Math.min(max,r.value))/max*height;
  return <g key={i}><rect x={left} y={y+height-h} width={w} height={h} fill={r.color}/><text x={left+w/2} y={y+height-h-7} textAnchor="middle" fontSize="12" fill="#555">{shown(r.value)}</text></g>;
 })}</g>;
}
function Radar({cx,cy,radius,rows}:{cx:number;cy:number;radius:number;rows:number[]}){
 const pts=rows.map((v,i)=>{const angle=(-90+i*360/5)*Math.PI/180,len=Math.max(0,Math.min(30,v))/30*radius;return [cx+Math.cos(angle)*len,cy+Math.sin(angle)*len];});
 return <g><polygon points={pts.map(p=>p.join(',')).join(' ')} fill="#6ac36c" fillOpacity=".32" stroke="#6ac36c" strokeWidth="2"/>{pts.map((p,i)=><text key={i} x={p[0]} y={p[1]-5} fontSize="11" textAnchor="middle" fill="#666">{shown(rows[i])}</text>)}</g>;
}
const sentence=(s:string)=>s&&!/[。！？]$/.test(s.trim())?s.trim()+'。':s.trim();
/** PDF-baseline coordinates from the user's data report. All short copy comes
 * from the original dictionary; no language-model prose or person-based lookup. */
function DataReportCopy({replay:r}:{replay:GhReportReplay}){
 const copy=r.report_text;
 let strengthY=1257;
 const groups=copy.strengths.groups.map(g=>{
  const y=strengthY;strengthY+=Math.max(20,g.rows.length*23);
  return <g key={g.item}><circle cx={661} cy={y-5} r={3.5} fill="#6ac36c"/><text x={669} y={y} fontSize={15}>{g.name}</text>{g.rows.map((s,i)=><text key={s.item} x={754} y={y+i*23} fontSize={12}>{s.name}：{s.text} —— 第{s.rank}位</text>)}</g>;
 });
 const traits=[...r.traits.children].filter(t=>t.score>0).sort((a,b)=>b.score-a.score||a.item-b.item).slice(0,6);
 const five='ability_summary' in r?r.ability_summary.potential5:undefined;
 const fiveFields=[['cxl',289],['fxl',395.4],['yzl',501.8],['xzl',608.2],['jll',714.6]] as const;
 return <g className="original-data-copy" fill="#333" fontSize={12}>
  <text x={181.5} y={450}><tspan fill="#00b671">{r.style.code}</tspan><tspan> （{r.style.name}）</tspan></text>
  <text x={181.5} y={473}><tspan fill="#00b671">{copy.temperament.code}</tspan><tspan> （{copy.temperament.name}）</tspan></text>
  {traits.map((t,i)=><g key={t.item}><rect x={686+i*70.55} y={438} width={56} height={28} rx={1} fill="white" stroke="#d7d7d7"/><circle cx={700+i*70.55} cy={452} r={3} fill="#6ac36c"/><text x={707+i*70.55} y={456}>{t.name}</text></g>)}
  {copy.values.map((v,i)=><text key={v.item} x={110} y={722+i*23}><tspan fontWeight={700}>{v.label}：</tspan><tspan>{v.text}</tspan></text>)}
  {copy.motivation.lines.map((v,i)=><text key={v.type} x={732.5} y={722+i*23}>{sentence(v.text)}</text>)}
  {copy.roles.map((v,i)=><text key={v.item} x={136} y={1463+i*23}><tspan fontWeight={700}>{v.label}：</tspan><tspan>{v.text}</tspan></text>)}
  <rect x={748} y={1192} width={127} height={32} fill="white"/>
  <text x={751} y={1216} fontSize={20} fill="#f7d65c" stroke="#d8d8d8" strokeWidth={.4}>{'★'.repeat(r.grade.value)}{'☆'.repeat(5-r.grade.value)}</text>
  <rect x={650} y={1230} width={472} height={224} fill="white"/>
  {groups}
  <text x={668.6} y={strengthY+13}>最后6项</text><text x={750.2} y={strengthY+13}>{copy.strengths.bottom_six.map(s=>s.name).join('、')}</text>
  {five&&fiveFields.map(([key,x])=><text key={key} x={x} y={846} fontSize={14}>{five[key]}</text>)}
 </g>;
}
/** The exact vector template remains underneath; only computed, mapped fields
 * are drawn. Current New configuration is explicitly not a 2025 golden match. */
export function GhReportPlots({page,width,height,replay:r}:{page:string;width:number;height:number;replay:GhReportReplay}){
 const style=r.rows.filter(x=>x.type===3).sort((a,b)=>a.item-b.item).map((x,i)=>({value:x.score,color:palette[i]}));
 const orderedValues=ghReportValues(r);
 const values=orderedValues.map((x,i)=>({value:x.report_value,color:palette[i]}));
 const motivation=['财富','健康','享受','工作','权力','创新','情感','荣誉'].map((name,i)=>({value:r.motivation.find(x=>x.name===name)?.report_value??null,color:palette[i]}));
 const orderedRoles=ghReportRoles(r);
 const roles=orderedRoles.map((x,i)=>({value:halfUp(x.scoreTotalCalibrateSeniorNew),color:palette[i]}));
 const axisLabels=(labels:string[],x:number,y:number,w:number,fontSize:number)=><g><rect x={x} y={y} width={w} height={fontSize*2.3} fill="white"/>{labels.map((label,i)=><text key={i} x={x+(i+.5)*w/8} y={y+fontSize*1.3} textAnchor="middle" fontSize={fontSize} fill="#555">{label}</text>)}</g>;
 const bigFive=[242,246,245,244,243].map(id=>halfUp(r.traits.parents.find(p=>p.item===id)?.score??0));
 const abilities='abilities' in r?[...r.abilities].sort((a,b)=>a.parent-b.parent||a.item-b.item).map(a=>({value:a.value,color:({'238':palette[0],'239':palette[2],'240':palette[4],'241':palette[6]} as Record<string,string>)[a.parent]})):[];
 return <svg className="original-computed-plots" viewBox={`0 0 ${width} ${height}`} aria-label="当前版本计算图表">
  {page==='data'&&<><Bars x={134} y={213} width={420} height={160} max={25} paired rows={style}/><Bars x={144} y={540} width={417.2} height={133} max={100} rows={values}/>{axisLabels(orderedValues.map(v=>v.label),144,675,417.2,12)}<Bars x={684} y={540} width={411} height={133} max={100} rows={motivation}/><Bars x={134} y={1238} width={438} height={168} max={100} rows={roles}/>{axisLabels(orderedRoles.map(v=>v.name),134,1410,438,12)}<Radar {...ghRadarGeometry.data} rows={bigFive}/><DataReportCopy replay={r}/></>}
  {page==='talent-04'&&<Radar {...ghRadarGeometry['talent-04']} rows={bigFive}/>}
  {page==='talent-05'&&<><Bars x={220} y={277} width={850} height={234} max={100} rows={roles}/>{axisLabels(orderedRoles.map(v=>v.name),220,512,850,16)}</>}
  {abilities.length>0&&page==='data'&&<><Bars x={132} y={873} width={938} height={220} max={100} rows={abilities}/>{'ability_summary' in r&&r.ability_summary.top_six.map((a,i)=>{
   const index=[...r.abilities].sort((a,b)=>a.parent-b.parent||a.item-b.item).findIndex(s=>s.item===a.item),x=132+(index+.5)*938/28;
   return <g key={a.item}><circle cx={x} cy={1049} r={9} fill="#9e73e0"/><text x={x} y={1053} fontSize={12} textAnchor="middle" fill="white">{i+1}</text></g>;
  })}</>}
  {abilities.length>0&&page==='talent-06'&&'ability_summary' in r&&<><Bars x={215} y={242} width={860} height={278} max={100} rows={abilities}/>{[...r.ability_summary.groups].sort((a,b)=>b.value-a.value||a.item-b.item).map((g,i)=><text key={g.item} x={942} y={[947,1075,1205,1335][i]} fontSize={16} textAnchor="middle" fill="#555">{g.name}　{g.value}{'product' in r?'':'（估计）'}</text>)}</>}
  {page==='talent-07'&&<Bars x={194} y={254} width={853} height={179} max={100} rows={motivation}/>}
  {page==='talent-08'&&<><Bars x={246} y={277} width={754} height={204} max={100} rows={values}/>{axisLabels(orderedValues.map(v=>v.label),246,482,754,16)}</>}
  {page==='talent-09'&&<Bars x={300} y={583} width={610} height={207} max={30} rows={style}/>}
 </svg>;
}
