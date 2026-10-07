import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {ghReplayExample,scoreGhReportReplay} from '../packages/assessment-engine/gh-derived.ts';
import {ghInferenceFeatures,ghInferenceFeatureKeys} from '../packages/assessment-engine/gh-inference.ts';
const dir='.local/gh-inference-v1';mkdirSync(dir,{recursive:true});
const root='.local/gh-evidence-v22/baselines/v14/v10新增证据/证据';
const ids=readdirSync(root+'/original-answers-v10').filter(n=>n.endsWith('.json')).sort().map(n=>n.slice(0,-5));
const regression=JSON.parse(readFileSync('.local/gh-evidence-v22/regression.json','utf8'));
// Some archived IDs exceed Number.MAX_SAFE_INTEGER. Preserve these as strings
// before parsing; never join candidates using a rounded JavaScript number.
const outputs=JSON.parse(readFileSync(root+'/candidate-output-results-v9.json','utf8').replace(/("uid"\s*:\s*)(\d{16,})/g,'$1"$2"'));
const examples=regression.first_layer.map((f:{answers:Record<string,number>;values:{id:string;rank:number}[]},i:number)=>{
 const r=scoreGhReportReplay({...ghReplayExample(),input_kind:'manual_answers',answers:f.answers,values:f.values});
 const quality=outputs.filter((x:{uid:string;typeid:number})=>String(x.uid)===ids[i]&&x.typeid===8).sort((a:{itemid:number},b:{itemid:number})=>a.itemid-b.itemid);
 if(quality.length!==28)throw new Error('EXTERNAL_ANSWER_QUALITY_MISSING');
 return {private_id:ids[i],x:ghInferenceFeatures(r),y:quality.map((v:{scoreCalibrate:number})=>Math.min(100,v.scoreCalibrate*100))};
});
writeFileSync(dir+'/answer-features.json',JSON.stringify({feature_keys:ghInferenceFeatureKeys,examples})+'\n');
console.log(JSON.stringify({full_questionnaire_external_samples:examples.length,feature_count:ghInferenceFeatureKeys.length}));
