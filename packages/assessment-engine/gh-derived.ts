import {z} from 'zod';
import cfg from './data/gh-derived-rules-v22.json' with {type:'json'};
import audit from './data/gh-v22-audit.json' with {type:'json'};
import {ghEvidenceVersion,ghEvidenceInput,ghSyntheticInput,scoreGhFirstLayer} from './gh-server-evidence.ts';
import {halfUp} from './gh-rounding.ts';
import {deriveGhReportText} from './gh-report-text.ts';
export {halfUp} from './gh-rounding.ts';

export const ghReplayVersion='gh-report-replay-v22';
const valueFlow=z.object({layout:z.literal('captured_32_words_v3'),selected_by_group:z.array(z.array(z.string()).length(5)).length(4),ranked:z.array(z.string()).length(10)}).strict();
export const ghReplayInput=ghEvidenceInput.extend({version:z.literal(ghReplayVersion),value_flow:valueFlow.optional()}).strict();
export type GhReplayInput=z.infer<typeof ghReplayInput>;
export function ghReplayExample():GhReplayInput{return {...ghSyntheticInput(),version:ghReplayVersion};}
export function ghReplayCatalog(){return {version:ghReplayVersion,audit,answer_only_derived_available:true,formal_report_available:false,formal_match_available:false,styles:cfg.styles,quality_items:cfg.items.filter(i=>i.type===8&&i.parent!==0),value_groups:Array.from({length:4},(_,i)=>cfg.displayed_value_ids.slice(i*8,i*8+8)),value_layout:'captured_32_words_v3' as const};}
export function validateGhValueFlow(raw:unknown){
 const input=valueFlow.parse(raw),groups=ghReplayCatalog().value_groups,selected=input.selected_by_group.flat();
 input.selected_by_group.forEach((rows,i)=>{if(new Set(rows).size!==5||rows.some(id=>!groups[i].includes(id)))throw new Error('每组须从本组8个词中选5个不同词。');});
 if(new Set(input.ranked).size!==10||input.ranked.some(id=>!selected.includes(id)))throw new Error('最后10个排序词须来自前两步的选择。');
 return input.ranked.map((id,i)=>({id,rank:i+1}));
}

type Item=typeof cfg.items[number];
type Row={type:number;item:number;score:number};
type MapRow={levels:(string|null)[];scores:(number|null)[];action:string|null;ext:Record<string,number>};
type RuleMap=Record<string,MapRow>;
type Weighted={item:number;name:string;ename:string;score:number;value:number;total:number;parent:number};
const traitMap=cfg.trait_map as RuleMap,roleMap=cfg.role_map as RuleMap;
const bNames=['推行力','管控力','创造力','决断力','凝聚力','服务力','培育力','感召力'];
const bGroups:Record<string,string[]>={推行力:['责任','专注','成就','排难','信仰'],管控力:['纪律','统筹','公平','审慎'],创造力:['理念','前瞻','搜集','学习'],决断力:['战略','分析','思维','回顾'],凝聚力:['关联','和谐','交往','个别','伯乐'],服务力:['包容','体谅','积极','适应'],培育力:['完美','追求','沟通','取悦'],感召力:['统率','自信','竞争','行动'],执行:['管控力','推行力'],思维:['创造力','决断力'],关系:['凝聚力','服务力'],影响:['培育力','感召力']};
const strengthWeights=[10,9.5,9,8.5,8,7.5,6,5.5,5,4.5,4,3.5,3,2.5,2,1.5,1.05,.95,.9,.85,.8,.75,.7,.65,.6,.55,.45,.4,.35,.3,.25,.2,.15,.1];
const roleExpressions:Record<string,[string,number,string,number,string,number]>={IFP:['I',.2,'F',.5,'P',.3],EFJ:['E',.3,'F',.5,'J',.2],INJ:['I',.3,'N',.5,'J',.2],ENP:['E',.2,'N',.5,'P',.3],ITP:['I',.3,'T',.5,'P',.2],ETJ:['E',.2,'T',.5,'J',.3],ISJ:['I',.2,'S',.5,'J',.3],ESP:['E',.3,'S',.5,'P',.2]};
const sum=(a:number[])=>a.reduce((x,y)=>x+y,0);
const round3=(n:number)=>halfUp(n,3);
const weight=(r:MapRow,name:string)=>{const i=r.levels.indexOf(name);return i<0?1:r.scores[i]??1;};
function normalized(rows:Weighted[],weights:number[],fromValue=false){
 if(rows.length!==weights.length)throw new Error('RULE_DIMENSION_MISMATCH');
 const values=rows.map((r,i)=>(fromValue?r.value:r.score)*weights[i]/100),total=sum(values);
 rows.forEach((r,i)=>{r.value=total?values[i]/total*100:0;});
}

/** Calibrated points stay distinct from raw sums. Missing DB value rows stay null. */
export function calibrateGh(type:number,score:number){
 if(!Number.isFinite(score)||score<0)throw new Error('INVALID_RAW_SCORE');
 if(type!==4&&type!==5)return score;
 const avg=type===4?11.918:10.1749,old=type===4?20:28;
 const ap=avg*100/old,sp=score*100/old;
 return (score>avg?60+40/(100-ap)*(sp-ap):60-60/ap*(ap-sp))*20/100;
}
export function gradeGh(total:number){
 if(!Number.isFinite(total)||total<0)throw new Error('INVALID_STRENGTH_TOTAL');
 return total<=99?1:total>=100&&total<=151?2:total>=152&&total<=260?3:total>=261&&total<=356?4:total>=357?5:0;
}
export function deriveGhStyle(rows:Row[]){
 const byName=Object.fromEntries(cfg.items.filter(i=>i.type===3).map(i=>[i.ename,rows.find(r=>r.type===3&&r.item===i.id)?.score??0]));
 const pairs=([['E','I'],['S','N'],['T','F'],['J','P']] as const).map(([a,b])=>({left:a,right:b,left_score:byName[a],right_score:byName[b],tie:byName[a]===byName[b],winner:byName[a]>byName[b]?a:b}));
 const code=pairs.map(p=>p.winner).join(''),definition=cfg.styles.find(s=>s.code===code);
 if(!definition)throw new Error('STYLE_CONFIGURATION_MISSING');
 return {code,result_id:definition.id,name:definition.name,description:definition.description,pairs,tie_policy:'right_side_INFP' as const};
}
function strengthOrder(rows:Weighted[]){
 const ordered=rows.map(r=>({...r,category:bNames.find(c=>bGroups[c].includes(r.name))??''})).sort((a,b)=>b.score-a.score||a.item-b.item);
 const cats=bNames.map(name=>({name,value:sum(ordered.filter(r=>r.category===name).map(r=>r.score)),score:Math.max(0,...ordered.filter(r=>r.category===name).map(r=>r.score)),ranking:0,parent:Object.keys(bGroups).find(g=>['执行','思维','关系','影响'].includes(g)&&bGroups[g].includes(name))!}));
 const groups=['执行','思维','关系','影响'].map(name=>({name,value:sum(cats.filter(c=>c.parent===name).map(c=>c.value)),ranking:0})).sort((a,b)=>b.value-a.value);
 groups.forEach((g,i)=>g.ranking=i&&g.value===groups[i-1].value?groups[i-1].ranking:i+1);
 cats.sort((a,b)=>b.score-a.score);cats.forEach((c,i)=>c.ranking=i&&c.score===cats[i-1].score?cats[i-1].ranking:i+1);
 cats.forEach(c=>{c.value=Math.trunc(c.value)*100+(5-groups.find(g=>g.name===c.parent)!.ranking)*10+9-c.ranking;});
 cats.sort((a,b)=>b.value-a.value);
 ordered.forEach(r=>r.value=Math.trunc(r.score)*10+8-cats.findIndex(c=>c.name===r.category));
 ordered.sort((a,b)=>b.value-a.value||a.item-b.item);
 return ordered;
}
function buildInputs(rows:Row[]){
 const joined=(type:number)=>cfg.items.filter(i=>i.type===type&&(type!==2||i.parent!==0)).map(i=>({item:i.id,name:i.name,ename:i.ename,parent:i.parent,score:rows.find(r=>r.type===type&&r.item===i.id)?.score??0,value:0,total:0}));
 const notion=joined(5).sort((a,b)=>b.score-a.score||a.item-b.item),d=joined(4).sort((a,b)=>b.score-a.score||(a.ename<b.ename?-1:a.ename>b.ename?1:0));
 for(const group of [notion,d]){
  group.forEach(r=>{if(r.score===0)r.score=.5;});
  const total=sum(group.map(r=>r.score));group.forEach(r=>{r.total=total;r.value=r.score/total*100;});
 }
 normalized(notion,Array(8).fill(12.5),true);normalized(d,[20,18,16,14,12,9,6,5]);
 const c=joined(3),percent:Record<string,number>={};
 for(const [l,r] of [['E','I'],['S','N'],['T','F'],['J','P']]){
  const left=c.find(x=>x.ename===l)!.score,right=c.find(x=>x.ename===r)!.score,total=left+right;
  percent[l]=total?left/total*100:0;percent[r]=total?right/total*100:0;
 }
 const c8=cfg.items.filter(i=>i.type===28).map(i=>{
  const [a,wa,b,wb,c,wc]=roleExpressions[i.ename];
  return {item:i.id,name:i.name,ename:i.ename,parent:i.parent,score:0,value:(wa*percent[a]+wb*percent[b]+wc*percent[c])/4,total:0};
 }).sort((a,b)=>b.value-a.value||a.item-b.item);
 normalized(c8,[25,20,15,10,9,8,7,6],true);
 const bOrdered=strengthOrder(joined(2));normalized(bOrdered,strengthWeights);
 const bnew=bNames.map(name=>({name,value:sum(bOrdered.filter(r=>bGroups[name].includes(r.name)).map(r=>r.value))}));
 return {notion,d,c8,bOrdered,bnew};
}
function bRate(r:MapRow,ordered:Weighted[]){
 const [k1,k2]=r.levels,k3=r.levels[2]??k1,k4=r.levels[3]??k2;
 const count=(slice:Weighted[],names:string|null)=>slice.filter(x=>names?.includes(x.name)).length;
 const ta=count(ordered.slice(0,6),k1),tb=count(ordered.slice(0,6),k2),la=count(ordered.slice(-3),k3),lb=count(ordered.slice(-3),k4);
 if(r.action==='combination')return r.scores[ta>=1&&la>=1&&la<=3?la-1:3]??1;
 const ext=(k:string)=>r.ext[k]??1;
 return ta&&la?ext(`T${ta}A`)*ext(`L${la}A`):ta?ext(`T${ta}A`):la?ext(`L${la}A`):tb&&lb?ext(`T${tb}B`)*ext(`L${lb}B`):tb?ext(`T${tb}B`):lb?ext(`L${lb}B`):1;
}
function components(key:string,mp:RuleMap,inp:ReturnType<typeof buildInputs>,cTop?:string){
 if(!mp[key+'-total-rate'])return {b:0,c:0,d:0,notion:0,configured:false};
 const weighted=(list:{value:number;name:string;ename?:string}[],row:MapRow,byCode=false)=>sum(list.map(r=>r.value*weight(row,byCode?r.ename!:r.name)/100));
 const totalD=inp.d[0].total,dr=mp[key+'-d-rate'].scores;
 const rateD=dr[totalD>105?3:totalD>72?2:totalD>50?1:0]!;
 const count=cTop?[...cTop].filter(c=>key.includes(c)).length:0;
 return {b:round3(weighted(inp.bnew,mp[key+'-b'])*bRate(mp[key+'-b-rate'],inp.bOrdered)),c:round3(weighted(inp.c8,mp[key+'-c8'],true)),d:round3(weighted(inp.d,mp[key+'-d'])*rateD),notion:round3(weighted(inp.notion,mp[key+'-notion'],true)*(cTop?mp[key+'-notion-rate'].scores[Math.min(count,3)]!:1)),configured:true};
}
export function translateGhRole(x:number,thresholds:readonly number[]){
 const [x0,x1,x2]=thresholds;
 if(!Number.isFinite(x)||!thresholds.every(Number.isFinite)||!(x0>x1&&x1>x2&&x2>0))throw new Error('INVALID_ROLE_CALIBRATION');
 return x>=x0?100:x>=x1?20/(x0-x1)*(x-x1)+80:x>=x2?60/(x1-x2)*(x-x2)+20:20/x2*x;
}
export function deriveGhDimensions(rows:Row[]){
 const inp=buildInputs(rows),style=deriveGhStyle(rows);
 const children=cfg.items.filter(i=>i.type===16&&i.parent!==0).sort((a,b)=>a.id-b.id).map(i=>{
  const c=components(String(i.id),traitMap,inp),t=traitMap[i.id+'-total-rate']?.scores;
  const score=t?halfUp(Math.min(30,(c.c*t[0]!+c.b*t[1]!+c.d*t[2]!+c.notion*t[3]!)/100)):0;
  return {item:i.id,parent:i.parent,name:i.name,score,...c};
 });
 const totalTraits=sum(children.map(c=>c.score));
 const parents=cfg.items.filter(i=>i.type===16&&i.parent===0).sort((a,b)=>a.id-b.id).map(i=>({item:i.id,name:i.name,score:totalTraits?halfUp(sum(children.filter(c=>c.parent===i.id).map(c=>c.score))/totalTraits*100,2):null}));
 const totalB=sum(rows.filter(r=>r.type===2).map(r=>r.score)),totalC=sum(style.pairs.map(p=>Math.abs(p.left_score-p.right_score)));
 const regionB=totalB<152?1:totalB<261?2:totalB<357?3:4,regionC=totalC<16.5?1:totalC<28.7?2:totalC<40.5?3:4;
 let baseC=40,baseB=30;
 if(regionC>regionB){baseC=Math.min(50,baseC+(regionC-regionB)*5);baseB=70-baseC;}
 if(regionB>regionC){baseB=Math.min(50,baseB+(regionB-regionC)*5);baseC=70-baseB;}
 const roles=cfg.items.filter(i=>i.type===28).sort((a,b)=>a.id-b.id).map(i=>{
  const c=components(i.ename,roleMap,inp,style.code),t=roleMap[i.ename+'-total-rate'].scores;
  const total=(c.c*baseC+c.b*baseB+c.d*t[2]!+c.notion*t[3]!)/100,s=cfg.role_standards.find(s=>s.itemId===i.id)!;
  return {item:i.id,name:i.name,ename:i.ename,scoreB:c.b,scoreC:c.c,scoreD:c.d,scoreNotion:c.notion,scoreTotal:total,scoreTotalCalibrateJunior:translateGhRole(c.c*.7+c.d*.3,[s.middleX0,s.middleX1,s.middleX2]),scoreTotalCalibrateSeniorNew:translateGhRole(total,[s.seniorX0,s.seniorX1,s.seniorX2])};
 });
 return {style,traits:{children,parents,zero_rule_ids:children.filter(c=>!c.configured).map(c=>c.item)},roles,role_weighting:{totalB,totalC,regionB,regionC,baseB,baseC},strengths:inp.bOrdered.map((r,i)=>({item:r.item,name:r.name,score:r.score,rank:i+1,weight:strengthWeights[i]}))};
}
export function scoreGhReportReplay(raw:unknown){
 const {value_flow,...input}=ghReplayInput.parse(raw);
 if(value_flow&&JSON.stringify([...validateGhValueFlow(value_flow)].sort((a,b)=>a.rank-b.rank))!==JSON.stringify([...input.values].sort((a,b)=>a.rank-b.rank)))throw new Error('价值观选择过程与最后提交名次不一致。');
 const first=scoreGhFirstLayer({...input,version:ghEvidenceVersion}),derived=deriveGhDimensions(first.rows);
 const rows=first.rows.map(r=>({...r,calibrated:r.type===5&&!r.contributing_questions?null:calibrateGh(r.type,r.score)}));
 const total=sum(rows.filter(r=>r.type===2).map(r=>r.score));
 const values=rows.filter(r=>r.type===5).map(r=>({item:r.item,name:r.name,raw:r.score,calibrated:r.calibrated,report_value:r.calibrated===null?null:halfUp(Math.min(100,halfUp(r.calibrated,1)*6))}));
 const report_text=deriveGhReportText({style_code:derived.style.code,motivation:rows.filter(r=>r.type===4).map(r=>({code:cfg.items.find(i=>i.id===r.item)!.ename,raw:r.score})),strengths:derived.strengths,values,roles:derived.roles});
 return {...first,version:ghReplayVersion,kind:'gh_current_report_replay' as const,rows,...derived,value_flow_verified:!!value_flow,grade:{value:gradeGh(total),strength_total:total,evidence_grade:'SOURCE_AND_DB_COMPUTED_RUNTIME_PENDING'},
  motivation:rows.filter(r=>r.type===4).map(r=>({item:r.item,name:r.name,raw:r.score,calibrated:r.calibrated!,report_value:halfUp(Math.min(100,r.calibrated!*5)),raw_report_value:Math.min(100,r.score*5)})),
  values,report_text,
  limitations:['已接入当前配置的基础分、校准、风格、性格、角色和星级；完整历史复刻仍有5项缺口。','性格及角色独立移植仅有一个真实完整样本回归；星级缺同次完整senior响应。','278–283当前配置无规则；所示0只适用于当前配置。','答案→28项能力所需AgType8Map完整配置未在包内找到；五力、管理分组仅能复算已有28项能力值。','七模块短文案已按原字典与已知触发规则接线；十页长篇解释与2025历史版本全同仍未验证。','答案只计算不保存，结果用于本人了解和发展沟通。'],
 };
}
export type GhReportReplay=ReturnType<typeof scoreGhReportReplay>;

const finite=z.number().finite();
export const ghMatchInput=z.object({version:z.literal(ghReplayVersion),purpose:z.literal('evidence_verification_only'),route:z.literal('addSomeMatchPeoRecord'),component_precision:z.enum(['raw','rounded']),scores:z.object({c8Score:finite.min(0).max(100),qualityScore:finite.min(0).max(100),motiveScore:finite.min(0).max(100),valueScore:finite.min(0).max(100)}).strict()}).strict();
export function replayGhFinalMatch(raw:unknown){
 const input=ghMatchInput.parse(raw),weights=[.4,.3,.2,.1],factors=[1.02,1,1,.98];
 if(input.component_precision==='rounded'&&Object.values(input.scores).some(v=>!Number.isInteger(v)))throw new Error('rounded输入须为已经取整的四项分数。');
 const terms=Object.entries(input.scores).map(([name,score],i)=>({name,type:i+1,score,weight:weights[i]})).sort((a,b)=>a.score-b.score||a.type-b.type).map((t,i)=>({...t,factor:factors[i],contribution:t.score*t.weight*factors[i]}));
 const total=sum(terms.map(t=>t.contribution)),rounded=halfUp(total);
 // HALF_UP intervals may overlap and change component order. Bound every one
 // of the 24 sorted regions, not just the order of the stored integer scores.
 // Closed upper endpoints deliberately give a conservative bound.
 let minimum=Infinity,maximum=-Infinity;
 if(input.component_precision==='rounded'){
  const rows=Object.values(input.scores).map((score,i)=>({lo:Math.max(0,score-.5),hi:Math.min(100,score+.5),weight:weights[i]}));
  const visit=(prefix:number[],left:number[])=>{
   if(left.length){left.forEach(i=>visit([...prefix,i],left.filter(j=>j!==i)));return;}
   const order=prefix.map(i=>rows[i]),low:number[]=[],high:number[]=Array(4);
   order.forEach((r,i)=>low.push(Math.max(r.lo,i?low[i-1]:0)));
   for(let i=3;i>=0;i--)high[i]=Math.min(order[i].hi,i<3?high[i+1]:100);
   if(order.some((r,i)=>low[i]>r.hi||high[i]<r.lo))return;
   minimum=Math.min(minimum,sum(low.map((v,i)=>v*order[i].weight*factors[i])));
   maximum=Math.max(maximum,sum(high.map((v,i)=>v*order[i].weight*factors[i])));
  };
  visit([],[0,1,2,3]);
 }
 return {version:ghReplayVersion,route:input.route,component_precision:input.component_precision,score:rounded,raw_total:total,terms,historical_score_unique:input.component_precision==='raw',possible_historical_score_range:input.component_precision==='raw'?[rounded,rounded]:[halfUp(minimum),halfUp(maximum)],formal_match:false,recruitment_decision_allowed:false};
}

const qualityIds=cfg.items.filter(i=>i.type===8&&i.parent!==0).map(i=>i.id);
export const ghModelInput=z.object({version:z.literal(ghReplayVersion),purpose:z.literal('evidence_verification_only'),route:z.literal('per_member_scoreCalibrateNew'),members:z.array(z.array(z.object({item:z.number().int(),score:finite.min(0).max(120)}).strict()).length(28)).min(1).max(100)}).strict();
export function buildGhPositionModel(raw:unknown){
 const input=ghModelInput.parse(raw),rankWeights=[10,9,8,7,6,5,4.5,4,3.5,3,2.6,2.6,2.6,2.4,2.4,2.4,2.1,2.1,2.1,1.8,1.8,1.8,1.5,1.5,1.5,1.2,1.2,1.2];
 const totals=new Map(qualityIds.map(id=>[id,{item:id,competitiveness:0,sum:0,max:0}]));
 for(const member of input.members){
  if(new Set(member.map(r=>r.item)).size!==28||member.some(r=>!totals.has(r.item)))throw new Error('每个成员须提交相同版本的28个不同素质项。');
  const parent=(id:number)=>cfg.items.find(i=>i.id===id)!.parent;
  const ordered=[...member].sort((a,b)=>b.score-a.score||parent(a.item)-parent(b.item)||a.item-b.item);
  ordered.forEach((r,i)=>{const t=totals.get(r.item)!,score=halfUp(r.score);t.competitiveness+=rankWeights[i]*(score>80?1.2:score>60?1:score>0?.8:0);t.sum+=score;t.max=Math.max(t.max,r.score);});
 }
 // Source hmap only contains items contributing a nonzero tier weight. A zero
 // item is absent, not a fabricated zero row or a forced bottom-three entry.
 const ordered=[...totals.values()].filter(r=>r.competitiveness>0).sort((a,b)=>b.competitiveness-a.competitiveness||a.item-b.item).map((r,i)=>({item:r.item,rank:i+1,competitiveness:r.competitiveness,score:halfUp(r.sum/input.members.length),maxScore:r.max}));
 return {version:ghReplayVersion,route:input.route,member_count:input.members.length,rows:ordered.filter(r=>r.rank<=10||r.rank>=26),all_rows:ordered,historical_input_recovered:false,formal_model:false,limitations:['仅复算每成员scoreCalibrateNew路线，不代替addPosi全体IN重复或旧scoreCalibrate路线。','输入须为已选定同次测评成员的28项真实百分数；不执行账号绑定和历史成员猜测。']};
}

const p5:Record<string,number[]>={cxl:[157,170,161,167],fxl:[164,158,159,161],yzl:[162,165,166,169,175,151],xzl:[168,173,160,176,174],jll:[154,162,175,163,177]};
const pms:Record<string,number[]>={gzw:[14,15,16,17,18,19,20,23,26,27],gtr:[1,2,3,4,5,6,7,22],grw:[8,9,10,11,12,13,21,24,25,28]};
export function deriveGhPotentialGroups(raw:unknown){
 const rows=z.array(z.object({item:z.number().int(),value:finite.min(0).max(100)}).strict()).length(28).parse(raw);
 if(new Set(rows.map(r=>r.item)).size!==28||rows.some(r=>!qualityIds.includes(r.item)))throw new Error('须提供28项完整能力报告值。');
 const ordered=[...rows].sort((a,b)=>cfg.items.find(i=>i.id===a.item)!.parent-cfg.items.find(i=>i.id===b.item)!.parent||a.item-b.item);
 const group=(groups:Record<string,number[]>,factor:number,byIndex=false)=>Object.fromEntries(Object.entries(groups).map(([key,ids])=>{
  const selected=ordered.filter((r,i)=>ids.includes(byIndex?i+1:r.item));
  if(!selected.length)throw new Error('POTENTIAL_GROUP_MISSING');
  const value=halfUp(sum(selected.map(r=>r.value))/selected.length*factor);
  return [key,byIndex&&value>=100?99:value];
 }));
 return {potential5:group(p5,.68*1.51),potentialMs:group(pms,1.19/1.13,true),source:'supplied_type8_report_values' as const,evidence_grade:'SOURCE_AND_DB_COMPUTED_RUNTIME_PENDING'};
}
