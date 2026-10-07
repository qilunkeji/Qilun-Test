import type {GhDisplayReport as GhReportReplay} from '../../../packages/assessment-engine/gh-inference.ts';
import {halfUp} from '../../../packages/assessment-engine/gh-rounding.ts';
export const ghRadarGeometry={data:{cx:904,cy:323,radius:90},'talent-04':{cx:612.5,cy:358,radius:84.75}};
/** Bind by item ID, not translated display names. Source orders calibrated
 * value rows before multiplying by 6; null rows remain at the end. */
export function ghReportValues(r:GhReportReplay){return [...r.values].sort((a,b)=>{
 if(a.calibrated===null||b.calibrated===null)return a.calibrated===b.calibrated?a.item-b.item:a.calibrated===null?1:-1;
 return halfUp(b.calibrated,1)-halfUp(a.calibrated,1)||a.item-b.item;
}).map(v=>({...v,label:v.name.replace(/型$/,'')}));}
export function ghReportRoles(r:GhReportReplay){return [...r.roles].sort((a,b)=>b.scoreTotalCalibrateSeniorNew-a.scoreTotalCalibrateSeniorNew||a.item-b.item);}
