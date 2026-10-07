import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replicaCatalog,scoreExternalStrengthV3,validateReplicaAnswers} from '../packages/assessment-engine/strength-v3.ts';
import evidence from '../packages/assessment-engine/data/strength-v3.json' with {type:'json'};
import fixtures from '../packages/assessment-engine/data/strength-replay-fixtures.json' with {type:'json'};

const answers=(choices:number[])=>Object.fromEntries(evidence.externalQuestions.map((q,i)=>[q.id,choices[i]]));
test('补给277题逐题保留：213对照题、64陈述题，不携带历史身份与答案',()=>{
 const c=replicaCatalog(),bank=c.full_question_bank;
 assert.equal(bank.questions.length,277);assert.equal(new Set(bank.questions.map(q=>q.id)).size,277);
 assert.deepEqual(bank.modules.map(m=>[m.name,m.count]),[['职业定位',64],['职业风格',28],['职业动机',32],['职业优势',153]]);
 assert.equal(bank.questions.filter(q=>q.answer_type===5).length,213);
 assert.equal(bank.questions.filter(q=>q.answer_type===6).length,64);
 for(const q of bank.questions)assert.deepEqual(Object.keys(q).sort(),['a','answer_type','b','id','module','order','order_in_page','page','title'].sort());
 for(const q of c.packages[0].questions){const full=bank.questions.find(f=>f.id===q.id)!;assert.equal(full.a,q.a);assert.equal(full.b,q.b);}
});
test('补给冲突不能解除计分阻塞，也不当作独立黄金样本',()=>{
 const c=replicaCatalog(),s=c.full_question_bank.summary;
 assert.equal(s.verified_files,15);assert.equal(s.same_answer_codes,277);
 assert.equal(s.scoring_key_available,false);assert.equal(s.report_pair_available,false);assert.equal(c.exact_replica_ready,false);
 assert.match(s.statement_code_conflict,/编码为1/);assert.match(s.readme_count_error,/213\/64/);
 assert.equal(Object.values(s.probe_summary)[1].returned_etids['0'],8);
 assert.ok(!c.gaps.some(g=>g.files.includes('20260918-assessment-question-bank.csv')));
});
test('高禾153题和外部180题保持各自原文、题号和版本边界',()=>{
 const c=replicaCatalog();assert.equal(c.exact_replica_ready,false);
 assert.equal(c.packages[0].questions.length,153);assert.equal(c.packages[0].scoring_available,false);
 assert.equal(c.packages[1].questions.length,180);
 assert.equal(c.packages[0].questions[0].id,'558');assert.equal(c.packages[0].questions[0].a,'我擅长与陌生人打交道');
 assert.equal(c.packages[1].questions[0].a,'我乐于助人');
 assert.equal(c.sections.length,7);assert.equal(c.sections.find(s=>s.name==='职业能力')!.labels.length,28);
 assert.equal(c.themes.length,34);assert.equal(c.traits.length,36);assert.equal(c.roles.length,8);
});
test('外部计分拒绝缺答、跨版本题号、非法选项；不能将高禾题号当外部答案',()=>{
 const full=answers(Array(180).fill(3));assert.doesNotThrow(()=>scoreExternalStrengthV3(full));
 const missing={...full};delete missing['2287'];assert.throws(()=>scoreExternalStrengthV3(missing),/INCOMPLETE/);
 for(const value of [0,6,1.5,NaN,Infinity])assert.throws(()=>scoreExternalStrengthV3({...full,'2287':value}),/INVALID/);
 assert.throws(()=>scoreExternalStrengthV3({...full,'558':1}),/INVALID/);
 assert.throws(()=>validateReplicaAnswers('ghrczx_strength_153',full),/INVALID/);
});
test('v3中立答案保留精确并列，明确区分外部与计分关系分母',()=>{
 const result=scoreExternalStrengthV3(answers(fixtures.all_middle.choices));
 assert.equal(result.contributions.length,574);assert.equal(result.excluded_edges,21);
 const observed=result.profiles.find(p=>p.id==='observed_links')!;
 assert.equal(observed.top5_candidates.length,34);assert.equal(observed.cutoff_tied,true);
 assert.ok(observed.ranking.every(r=>r.rank===1&&r.score===1));
 const book=result.profiles.find(p=>p.id==='book118')!;
 assert.equal(book.ranking.find(r=>r.name==='伯乐')!.score,17/16);
 assert.equal(book.ranking.find(r=>r.name==='追求')!.score,18/19);
 assert.equal(result.exact_replica_ready,false);
});
test('q29负分例外不截断，q36跨行弱证据不混入计分',()=>{
 for(const [index,points] of [3,2,1,-1,-2].entries()){
  const choice=Array(180).fill(3);choice[28]=index+1;
  const result=scoreExternalStrengthV3(answers(choice));
  assert.equal(result.contributions.find(r=>r.order===29&&r.theme==='统率')!.points,points);
  assert.ok(!result.contributions.some(r=>r.order===36&&r.theme==='追求'));
 }
});
test('真实归档反例可重现，不将包体完整性误判为原站结果一致',()=>{
 const result=scoreExternalStrengthV3(answers(fixtures.counterexample.choices));
 assert.deepEqual(fixtures.counterexample.observed,['前瞻','成就','个别','体谅','关联']);
 for(const profile of result.profiles){
  assert.deepEqual(profile.ranking.slice(0,5).map(r=>r.name),['前瞻','成就','个别','体谅','搜集']);
  const search=profile.ranking.find(r=>r.name==='搜集')!,connected=profile.ranking.find(r=>r.name==='关联')!;
  assert.equal(search.raw,27);assert.equal(search.denominator,17);
  assert.equal(connected.raw,28);assert.equal(connected.denominator,18);
  assert.ok(search.score>connected.score);
 }
});
