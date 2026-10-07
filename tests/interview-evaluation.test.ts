import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateInterviewOutput} from '../apps/api/interviews.ts';
import type {InterviewContext} from '../apps/api/interviews.ts';
const ctx={mode:'evaluate',session:{rubric:[{name:'执行',requirement:'交付任务',weight:70},{name:'复盘',requirement:'说明复盘',weight:30}],question_count:10},evidence:[{id:'E1',source:'job',text:'岗位要求独立交付任务'},{id:'E2',source:'transcript',text:'候选人：我完成了目录清单，并核对了每一个链接。'}]} as InterviewContext;
const item=(criterion:string,score:number|null)=>({criterion,score,reason:'基于面试回答进行初步判断',citations:score===null?[]:[{id:'E2',quote:'完成了目录清单'}]});
test('岗位能力分由服务端按人工权重计算；未知项不补零也不出完整总分',()=>{
 const full=validateInterviewOutput({items:[item('执行',3),item('复盘',2)],unknowns:[]},ctx) as {score:number|null;coverage:number};assert.equal(full.score,68);assert.equal(full.coverage,100);
 const missing=validateInterviewOutput({items:[item('执行',3),item('复盘',null)],unknowns:['复盘未问到']},ctx) as {score:number|null;coverage:number};assert.equal(missing.score,null);assert.equal(missing.coverage,70);
});
test('面试打分不得使用岗位或人格引用；拒绝缺项、重复、伪造引用与越界',()=>{
 const good={items:[item('执行',3),item('复盘',2)],unknowns:[]};
 assert.throws(()=>validateInterviewOutput({...good,items:[{...item('执行',3),citations:[{id:'E1',quote:'独立交付任务'}]},item('复盘',2)]},ctx));
 assert.throws(()=>validateInterviewOutput({...good,items:[item('执行',3)]},ctx));
 assert.throws(()=>validateInterviewOutput({...good,items:[item('执行',3),item('执行',2)]},ctx));
 assert.throws(()=>validateInterviewOutput({...good,items:[{...item('执行',3),citations:[]},item('复盘',2)]},ctx));
 assert.throws(()=>validateInterviewOutput({...good,items:[item('执行',5),item('复盘',2)]},ctx));
 assert.throws(()=>validateInterviewOutput({...good,items:[{...item('执行',3),citations:[{id:'E2',quote:'没有说过的事情'}]},item('复盘',2)]},ctx));
});
