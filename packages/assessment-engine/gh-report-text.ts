import cfg from './data/gh-report-text-v1.json' with {type:'json'};
import {halfUp} from './gh-rounding.ts';

type Motive={code:string;raw:number};
type Strength={item:number;name:string;rank:number};
type Value={item:number;calibrated:number|null};
type Role={item:number;scoreTotalCalibrateSeniorNew:number};
const sum=(a:number[])=>a.reduce((x,y)=>x+y,0);
const lookup=(id:number)=>{
 const r=cfg.results.find(r=>r.id===id&&(r.type===4||id===113));
 if(!r)throw new Error('REPORT_COPY_CONFIGURATION_MISSING');
 return r;
};

/** Match raw motive sums, NOT calibrated/rounded plot values. Source stores a
 * DJob resultName with swapped labels; the report actually joins resultId to
 * C8EvaluateResult, so the dictionary ID, not that label, is authoritative. */
export function deriveGhMotivationText(input:Motive[]){
 if(input.length!==8||new Set(input.map(r=>r.code)).size!==8||input.some(r=>!/^[1-8]$/.test(r.code)||!Number.isFinite(r.raw)||r.raw<0))throw new Error('INVALID_MOTIVATION_COPY_INPUT');
 const rows=[...input].sort((a,b)=>Number(a.code)-Number(b.code));
 const groupA=sum(rows.filter(r=>['1','4','5','8'].includes(r.code)).map(r=>r.raw)),groupB=sum(rows.filter(r=>['2','3','6','7'].includes(r.code)).map(r=>r.raw));
 const diff=groupB-groupA,energy=groupA+groupB;
 const max=rows.reduce((a,b)=>b.raw>a.raw?b:a),min=rows.reduce((a,b)=>b.raw<a.raw?b:a);
 const pair=`${max.code}.${min.code}`,top3=[...rows].sort((a,b)=>b.raw-a.raw||Number(a.code)-Number(b.code)).slice(0,3).map(r=>r.code).sort().join('');
 const find=(code:string)=>cfg.results.find(r=>r.type===4&&r.code===code);
 const fields=[['DWork','动机倾向',lookup(diff< -3?74:diff<=3?75:76),diff.toString()],
  ['DTopAndLow','动机类型',find(pair)??lookup(113),max.code+min.code],
  ['DThink','思维模式',lookup(energy>105?80:energy>72?81:energy>50?82:83),energy.toString()],
  ['DJob','管理偏向',lookup(diff< -3?79:diff<=3?78:77),diff.toString()],
  ['D3TOP','动机组合',find(top3)??lookup(112),top3]] as const;
 return {version:cfg.version,basis:'SOURCE_AND_DB_RULE' as const,groupA,groupB,difference:diff,energy,
  lines:fields.map(([type,label,row,value])=>({type,label,result_id:row.id,matched:row.id!==112&&row.id!==113,name:row.name,text:row.text,value})),
  // Source all-equal pair fallback is id113 (type3 NO). The report join uses
  // resultId without filtering the dictionary type, so preserve its actual
  // "没有对应匹配" copy instead of creating a personality label for a tie.
  unmatched_fields:fields.filter(([, ,row])=>row.id===112||row.id===113).map(([type])=>type),missing_fields:[] as string[]};
}

export function deriveGhReportText(input:{style_code:string;motivation:Motive[];strengths:Strength[];values:Value[];roles:Role[]}){
 if(!/^[EI][SN][TF][JP]$/.test(input.style_code))throw new Error('INVALID_STYLE_COPY_INPUT');
 const code=input.style_code[1]==='S'?input.style_code[1]+input.style_code[3]:input.style_code[1]+input.style_code[2];
 const temperament=cfg.results.find(r=>r.type===3&&r.code===code);
 if(!temperament?.temperament_name)throw new Error('TEMPERAMENT_COPY_MISSING');
 const item=(type:number,id:number)=>{
  const row=cfg.items.find(r=>r.type===type&&r.item===id);
  if(!row)throw new Error('REPORT_ITEM_COPY_MISSING');
  return row;
 };
 const strengths=[...input.strengths].sort((a,b)=>a.rank-b.rank);
 const top=strengths.slice(0,6).map(s=>({...s,text:item(2,s.item).text,parent:item(2,s.item).parent}));
 const groups=cfg.items.filter(r=>r.type===2&&!r.parent).map(g=>({item:g.item,name:g.name,rows:top.filter(r=>r.parent===g.item)}));
 const values=[...input.values].filter((v):v is Value&{calibrated:number}=>v.calibrated!==null).sort((a,b)=>halfUp(b.calibrated,1)-halfUp(a.calibrated,1)||a.item-b.item).slice(0,3).map(v=>({item:v.item,label:item(5,v.item).name,text:item(5,v.item).text}));
 const roles=[...input.roles].sort((a,b)=>b.scoreTotalCalibrateSeniorNew-a.scoreTotalCalibrateSeniorNew||a.item-b.item).slice(0,2).map(r=>({item:r.item,label:item(28,r.item).name,text:item(28,r.item).text}));
 return {version:cfg.version,basis:'ORIGINAL_DICTIONARY_AND_KNOWN_RULES' as const,
  temperament:{code,name:temperament.temperament_name,text:`${code}（${temperament.temperament_name}）`},
  motivation:deriveGhMotivationText(input.motivation),values,roles,strengths:{groups,top_six:top,bottom_six:strengths.slice(-6).map(r=>({item:r.item,name:r.name,rank:r.rank}))},
  historical_version_equivalence_verified:false};
}
