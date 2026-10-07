import {readFile,writeFile} from 'node:fs/promises';
// Only aggregate counts leave the private report-analysis directory.
const methods={sum:(a:number,b:number)=>a+b,maximum:(a:number,b:number)=>Math.max(a,b),product:(a:number,b:number)=>a*b};
const counts=Object.fromEntries(Object.keys(methods).map(k=>[k,{unique_agreement:0,tie_compatible:0,contradiction:0}]));
for(const ref of ['R03','R05','R07','R09','R11']){
 const report=JSON.parse(await readFile(`.local/report-analysis/${ref}.json`,'utf8'));
 const page=report.pages.find((p:{page:number})=>p.page===7).text as string;
 const chart=page.match(/财富\s+健康\s+享受\s+工作\s+权力\s+创新\s+情感\s+荣誉\s+([\s\S]*?)平衡型/);
 const values=chart?.[1].match(/-?\d+(?:\.\d+)?/g)?.map(Number);
 const label=page.match(/平衡型\s+(权利|成就|安乐|归属)\s/)?.[1];
 if(!values||values.length!==8||!label)throw new Error('需要人工核对图表提取');
 const pairs={安乐:[values[2],values[1]],归属:[values[6],values[7]],权利:[values[4],values[0]],成就:[values[3],values[5]]};
 for(const [method,fn] of Object.entries(methods)){
  const scores=Object.entries(pairs).map(([k,[a,b]])=>({k,v:fn(a,b)}));
  const top=scores.filter(x=>x.v===Math.max(...scores.map(x=>x.v))).map(x=>x.k);
  counts[method][!top.includes(label)?'contradiction':top.length>1?'tie_compatible':'unique_agreement']++;
 }
}
const result={sample_count:5,methods:counts,scope:'仅动机组标签；没有拟合题项或岗位总分',conclusion:'零矛盾不证明唯一算法；E1/E5的代码观察支持加和，报告样本仅用于交叉核对。'};
await writeFile('docs/qa/rule-hypotheses.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
