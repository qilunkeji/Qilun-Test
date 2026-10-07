import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {deriveMotivation,dimensionNames} from '../packages/assessment-engine/rules.ts';
type Report={ref:string;name:string;sha256:string;pages:{page:number;text:string}[]};
const results=[];
const hashes=new Set<string>();
for(let n=1;n<=11;n++){
 const r=JSON.parse(await readFile(`.local/report-analysis/R${String(n).padStart(2,'0')}.json`,'utf8')) as Report;
 hashes.add(createHash('sha256').update(r.pages.map(x=>x.text).join('\n')).digest('hex'));
}
for(const ref of ['R03','R05','R07','R09','R11']){
 const report=JSON.parse(await readFile(`.local/report-analysis/${ref}.json`,'utf8')) as Report;
 const page=report.pages.find(x=>x.page===7)!;
 const chart=page.text.match(/财富\s+健康\s+享受\s+工作\s+权力\s+创新\s+情感\s+荣誉\s+([\s\S]*?)平衡型/);
 const values=chart?.[1].match(/-?\d+(?:\.\d+)?/g)?.map(Number);
 const label=page.text.match(/平衡型\s+(权利|成就|安乐|归属)\s/ )?.[1];
 if(values?.length!==8||!label)throw new Error(`${ref}: chart extraction requires manual review`);
 const scores=Object.fromEntries(dimensionNames.map((name,i)=>[name,values[i]]));
 const derived=deriveMotivation({adapter:'gh_talent_web_v81',source_field:'pc_motivation_report_values',scale_ref:`${ref}:pdf-page7:visible-chart:API-scale-unverified`,input_kind:'manual_report_values',purpose:'rule_verification_only',scores});
 const consistent=derived.highest_groups.includes(label);
 if(!consistent)throw new Error(`${ref}: group-label disagreement; do not change rules to fit`);
 results.push({ref,sha256:report.sha256,pdf_page:7,printed_page:6,check:'four_group_maximum_only',status:derived.tie?'compatible_tie_not_reproduced':'unique_maximum_agrees',tie:derived.tie,
  limitation:'只有报告展示层分组合计验证；不验证答案计分、模板版本、岗位模型或总匹配。'});
}
const summary={files:11,pages:56,unique_extracted_texts:hashes.size,checks:results,raw_answers_available:false,job_model_available:false,formal_matching_verified:false};
await writeFile('.local/report-analysis/sample-verification.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
