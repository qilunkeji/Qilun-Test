import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import cfg from '../packages/assessment-engine/data/gh-report-text-v1.json' with {type:'json'};
import {deriveGhMotivationText,deriveGhReportText} from '../packages/assessment-engine/gh-report-text.ts';
import {ghReplayExample,scoreGhReportReplay} from '../packages/assessment-engine/gh-derived.ts';

const motive=(scores:number[])=>scores.map((raw,i)=>({code:String(i+1),raw}));
test('原文词库覆盖34优势、8价值观、8角色岗位、4气质；分发内容无个人信息',()=>{
 assert.equal(cfg.items.filter(r=>r.type===2&&r.parent).length,34);
 assert.equal(cfg.items.filter(r=>r.type===5).length,8);
 assert.equal(cfg.items.filter(r=>r.type===28).length,8);
 assert.equal(cfg.results.filter(r=>r.type===3&&r.code.length===2&&r.code!=='NO').length,4);
 assert.equal(cfg.results.filter(r=>r.type===4).length,131);
 assert.ok(cfg.items.filter(r=>r.parent||r.type!==2).every(r=>r.text));
 assert.doesNotMatch(JSON.stringify(cfg),/黄非红|月月|1993.01.07|130\*\*\*\*1215|321373|Bearer |password|candidateUid|\.local\//);
});
test('动机按原始分触发，原报告五句吻合；工作对应原则性管理而非旧错写label',()=>{
 const r=deriveGhMotivationText(motive([18,7.5,8.5,15,17,12,13.5,16]));
 assert.deepEqual(r.lines.map(r=>r.name),['工作型','透支','正面进攻型','原则性管理','领导者']);
 assert.deepEqual(r.lines.map(r=>r.text),[
  '工作型---比较注重工作付出及贡献，并以此为内驱力',
  '透支---追求结果重视回报,做事目的明确,忽视健康',
  '正面进攻型---进攻性强,积极乐观,喜欢直接攻关',
  '原则性管理---原则性强，社会工作者，奉献动机',
  '领导者---胸襟宽广目的性强,喜欢控制局面达成目标']);
 assert.equal(r.difference,-24.5);assert.equal(r.energy,107.5);
 assert.deepEqual(r.missing_fields,[]);
});
test('动机边界与全部56最高最低组合/56前三组合，不靠人名挑选文案',()=>{
 for(const [e,id] of [[0,83],[50,83],[50.01,82],[72,82],[72.01,81],[105,81],[105.01,80]])assert.equal(deriveGhMotivationText(motive(Array(8).fill(e/8))).lines[2].result_id,id);
 for(const [diff,work,job] of [[-3.01,74,79],[-3,75,78],[0,75,78],[3,75,78],[3.01,76,77]]){
  const a=Array(8).fill(10);a[1]+=diff;
  const r=deriveGhMotivationText(motive(a));assert.equal(r.lines[0].result_id,work);assert.equal(r.lines[3].result_id,job);
 }
 let pairs=0,triples=0;
 for(let i=0;i<8;i++)for(let j=0;j<8;j++)if(i!==j){
  const a=Array(8).fill(10);a[i]=20;a[j]=1;
  const line=deriveGhMotivationText(motive(a)).lines[1];
  assert.equal(line.result_id,cfg.results.find(r=>r.type===4&&r.code===`${i+1}.${j+1}`)!.id);assert.ok(line.text);pairs++;
 }
 for(let i=0;i<6;i++)for(let j=i+1;j<7;j++)for(let k=j+1;k<8;k++){
  const a=Array(8).fill(1);a[i]=20;a[j]=19;a[k]=18;
  const line=deriveGhMotivationText(motive(a)).lines[4];
  assert.equal(line.result_id,cfg.results.find(r=>r.type===4&&r.code===`${i+1}${j+1}${k+1}`)!.id);assert.ok(line.text);triples++;
 }
 assert.equal(pairs,56);assert.equal(triples,56);
 const tied=deriveGhMotivationText(motive(Array(8).fill(10)));
 assert.equal(tied.lines[4].value,'123');assert.equal(tied.lines[1].value,'11');assert.equal(tied.lines[1].text,'没有对应匹配');
 assert.deepEqual(tied.unmatched_fields,['DTopAndLow']);assert.deepEqual(tied.missing_fields,[]);
 assert.throws(()=>deriveGhMotivationText(motive([1,2])));assert.throws(()=>deriveGhMotivationText(motive(Array(8).fill(NaN))));
});
test('气质按S+J/P或N+T/F，优势按前6原排名分组，空价值不补文字',()=>{
 const r=scoreGhReportReplay(ghReplayExample());
 assert.equal(r.report_text.temperament.text,'NF（理想主义者）');
 for(const [style,expected] of [['ISTJ','SJ（护卫者）'],['ESTP','SP（艺术创造者）'],['INTP','NT（理性者）'],['ENFP','NF（理想主义者）']]){
  const t=deriveGhReportText({style_code:style,motivation:motive(Array(8).fill(10)),strengths:r.strengths,values:[],roles:r.roles});assert.equal(t.temperament.text,expected);assert.deepEqual(t.values,[]);
 }
 const names=['行动','前瞻','交往','伯乐','和谐','自信'];
 const top=names.map((name,i)=>({name,item:cfg.items.find(r=>r.type===2&&r.name===name)!.item,rank:i+1}));
 const t=deriveGhReportText({style_code:'ENFP',motivation:motive([18,7.5,8.5,15,17,12,13.5,16]),strengths:[...top,...r.strengths.filter(s=>!names.includes(s.name)).map((s,i)=>({...s,rank:i+7}))],
  values:[{item:82,calibrated:13},{item:83,calibrated:10.7},{item:84,calibrated:8.3},{item:81,calibrated:2.3}],roles:[{item:358,scoreTotalCalibrateSeniorNew:86},{item:354,scoreTotalCalibrateSeniorNew:82}]});
 assert.deepEqual(t.strengths.groups.map(r=>r.rows.map(r=>r.rank)),[[],[2],[3,4,5],[1,6]]);
 assert.equal(t.strengths.top_six[1].text,'重视发展；企业未来的规划师');
 assert.deepEqual(t.values.map(r=>r.label),['影响','精彩','奋斗']);
 assert.equal(t.values[0].text,'追求权力地位，有影响力，有支配权，被尊重，被褒奖。');
 assert.equal(t.roles[0].text,'业务拓展岗、商务谈判岗、危机公关岗、娱乐经纪岗');
 assert.equal(t.roles[1].text,'创意创新岗、科技研发岗、项目发起岗、培训激励岗');
 assert.equal(r.report_text.historical_version_equivalence_verified,false);assert.equal(r.formal_score,false);
});
const fixturePath=new URL('../.local/gh-report-text/regression.json',import.meta.url);
test('独立原数据库6例：30个动机结果ID及触发值逐项相同',{skip:!existsSync(fixturePath)},()=>{
 const f=JSON.parse(readFileSync(fixturePath,'utf8')) as {inputs:{code:string;raw:number}[];expected:{type:string;id:number;value:string}[]}[];
 assert.equal(f.length,6);let count=0;
 for(const sample of f){const r=deriveGhMotivationText(sample.inputs);for(const e of sample.expected){const actual=r.lines.find(r=>r.type===e.type)!;assert.equal(actual.result_id,e.id);if(['DWork','DThink','DJob'].includes(e.type))assert.equal(Number(actual.value),Number(e.value));else assert.equal(actual.value,e.value);count++;}}
 assert.equal(count,30);
});
