import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deriveMotivation,piecewiseWeight,encodeAnswer,validateValueSelection,externalMatchLabel,validateFormalPublication,deriveStylePairs,sumFirstSixteenTalents} from '../packages/assessment-engine/rules.ts';

const scores={财富:60,健康:40,享受:45,工作:70,权力:55,创新:65,情感:50,荣誉:60};
const pc={adapter:'gh_talent_web_v81',source_field:'pc_motivation_report_values',scale_ref:'synthetic-v1',input_kind:'synthetic',purpose:'rule_verification_only',scores};
const phone={...pc,adapter:'gh_phone_senior_v81',source_field:'type4Result'};
const template={reference:'E1-phone-template-20260916',occupation:[21.6,6.1,3.6,0],energy:[637.5,472.5,375,257.5]};
test('当前277题编码统一；旧反向编码须显式版本，越界拒绝',()=>{
 assert.deepEqual([0,1,2,3,4].map(i=>encodeAnswer('ab_five_choice',i)),[1,2,3,4,5]);
 assert.deepEqual([0,1,2,3,4].map(i=>encodeAnswer('single_five_choice',i)),[1,2,3,4,5]);
 assert.deepEqual([0,1,2,3,4].map(i=>encodeAnswer('single_five_choice',i,'legacy_e2')),[5,4,3,2,1]);
 assert.throws(()=>encodeAnswer('ab_five_choice',5));assert.throws(()=>encodeAnswer('ab_five_choice',1.5));
});
test('64词选择遵循可见排序；重复和越组不合法',()=>{
 const groups=Array.from({length:4},(_,g)=>Array.from({length:16},(_,i)=>`${g}-${i}`));
 const selected_by_group=groups.map(g=>g.slice(0,5));const ranked=selected_by_group.flat().slice(0,10).reverse();
 assert.deepEqual(validateValueSelection({groups,selected_by_group,ranked}).map(x=>x.question_id),ranked);
 assert.throws(()=>validateValueSelection({groups,selected_by_group,ranked:Array(10).fill('0-0')}));
 assert.throws(()=>validateValueSelection({groups,selected_by_group,ranked:[...ranked.slice(0,9),'3-15']}));
 const wrong=structuredClone(selected_by_group);wrong[0][0]='1-0';assert.throws(()=>validateValueSelection({groups,selected_by_group:wrong,ranked}));
});
test('PC与手机除数隔离，未知分档保持 null',()=>{
 const a=deriveMotivation(pc),b=deriveMotivation(phone);
 assert.equal(a.W,12.4);assert.equal(a.L,9);assert.equal(b.W,62);assert.equal(b.L,45);
 assert.equal(a.occupation_band,null);assert.equal(a.energy_band,null);assert.equal(a.work_life_label,null);
 assert.equal(b.k,0);assert.equal(b.I,17);assert.equal(b.work_life_label,'工作倾向');assert.equal(b.occupation_band,null);
 assert.equal(a.formal_score,false);assert.equal(a.recruitment_decision_allowed,false);
});
test('手机计算来源不能混用图表；PC拒绝套手机参数',()=>{
 assert.throws(()=>deriveMotivation({...phone,source_field:'motivationForAll'}));
 assert.throws(()=>deriveMotivation({...pc,template}));
 assert.throws(()=>deriveMotivation({...phone,template:{...template,reference:'all-accounts'}}));
});
test('严格保留1/5/10边界及末段回0',()=>{
 for(const sign of [-1,1])for(const [d,k] of [[0,.2],[1,.2],[1.001,.3],[5,.3],[5.001,.4],[10,.4],[10.001,0]])assert.equal(piecewiseWeight(sign*d),k);
 assert.throws(()=>piecewiseWeight(Infinity));
});
test('分别toFixed后减法，不交换运算次序',()=>{
 const actual=deriveMotivation({...pc,scores:{财富:25.125,健康:15.075,享受:0,工作:0,权力:0,创新:0,情感:0,荣誉:0}});
 assert.equal(actual.W,Number((25.125/25).toFixed(2)));assert.equal(actual.L,Number((15.075/15).toFixed(2)));assert.equal(actual.D,actual.W-actual.L);
});
test('缺失、非数、客户端最终得分及招聘用途均被拒绝',()=>{
 const {健康,...incomplete}=scores;
 for(const invalid of [{...pc,scores:incomplete},{...pc,scores:{...scores,财富:NaN}},{...pc,scores:{...scores,财富:'60'}},{...pc,final_score:99},{...pc,purpose:'hiring_rank'}])assert.throws(()=>deriveMotivation(invalid));
});
test('并列保留所有组，不伪造唯一标签；纯函数可重现',()=>{
 const input={...pc,scores:Object.fromEntries(Object.keys(scores).map(k=>[k,10]))};const a=deriveMotivation(input);
 assert.equal(a.tie,true);assert.equal(a.highest_groups.length,4);assert.deepEqual(a,deriveMotivation(input));
});
test('手机阈值只在显式指定模板后启用',()=>{
 assert.equal(deriveMotivation({...phone,template}).occupation_band,3);
 for(const [sum,band] of [[257.49,0],[257.5,1],[374.99,1],[375,2],[472.49,2],[472.5,3]]){
  const s=Object.fromEntries(Object.keys(scores).map(k=>[k,0]));s.财富=sum;
  assert.equal(deriveMotivation({...phone,scores:s,template}).energy_band,band);
 }
 for(const [value,band] of [[-0.01,0],[0,1],[3.598,1],[3.6,2],[6.098,2],[6.1,3]]){
  // W=L=value*5, so D=0, k=.2, I=value (avoids changing branch).
  const s=Object.fromEntries(Object.keys(scores).map(k=>[k,value*5]));
  const r=deriveMotivation({...phone,scores:s,template});
  assert.equal(r.occupation_band,band);
 }
});
test('综合与分项显示阈值不混同；不是总分算法',()=>{
 assert.equal(externalMatchLabel(83,'overall').label,'比较符合');assert.equal(externalMatchLabel(83,'component').label,'非常符合');
 assert.equal(externalMatchLabel(85,'overall').label,'非常符合');assert.equal(externalMatchLabel(70,'overall').label,'比较符合');assert.equal(externalMatchLabel(50,'overall').label,'基本符合');assert.equal(externalMatchLabel(49.99,'overall').label,'不符合');
 assert.throws(()=>externalMatchLabel(101,'overall'));assert.throws(()=>externalMatchLabel(NaN,'overall'));
});
test('当前风格并列取右；旧版空值保留，才干前16按输入顺序',()=>{
 const scores={E:10,I:9,S:10,N:10,T:9,F:10,J:10,P:9};
 assert.equal(deriveStylePairs(scores).type,'ENFJ');assert.equal(deriveStylePairs(scores,'legacy_e5').type,null);
 const rows=Array.from({length:17},(_,i)=>({id:String(i),category_id:i<16?'a':'b',value:i<16?1:999}));
 assert.deepEqual(sumFirstSixteenTalents(rows).categories,[{category_id:'a',sum:16}]);assert.throws(()=>sumFirstSixteenTalents(rows.slice(0,15)));
});
test('当前正式发布和匹配恒定阻塞，缺项不能由样本试算解除',()=>{
 deriveMotivation(pc);const gate=validateFormalPublication();assert.equal(gate.publishable,false);assert.equal(gate.formal_match_available,false);
 assert.ok(gate.missing.some(x=>x.id==='item_scoring'));assert.ok(gate.missing.some(x=>x.id==='overall_match'));assert.ok(gate.missing.some(x=>x.id==='golden_cases'));
});
