import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as tick,setTimeout as delay} from 'node:timers/promises';
import {DraftAutosaver,stableDraftJSON} from '../apps/admin-web/src/draft-autosaver.ts';
import {resumeGhProgress,ghProgressSchema} from '../packages/assessment-engine/gh-progress.ts';

test('自动保存串行使用最新revision；保存期间的新答案不被旧回包误标为已保存',async()=>{
 const calls:{value:number;revision:number}[]=[],resolvers:((v:{revision:number})=>void)[]=[],states:string[]=[];
 const saver=new DraftAutosaver(0,0,(value,revision)=>{calls.push({value,revision});return new Promise(resolve=>resolvers.push(resolve));},state=>states.push(state),1000);
 saver.update(1);const first=saver.flush();saver.update(2);const second=saver.flush();assert.equal(first,second);assert.deepEqual(calls,[{value:1,revision:0}]);assert.equal(saver.dirty,true);
 resolvers[0]({revision:1});await tick();assert.equal(saver.dirty,true);assert.deepEqual(calls,[{value:1,revision:0},{value:2,revision:1}]);
 resolvers[1]({revision:2});await first;assert.equal(saver.dirty,false);assert.equal(saver.revision,2);assert.equal(states.at(-1),'saved');saver.dispose();
});
test('保存失败保持答案和版本；重新保存成功后才消除未保存提示',async()=>{
 let fail=true;const states:string[]=[];
 const saver=new DraftAutosaver(4,{answer:1},async()=>{if(fail)throw new Error('offline');return {revision:5};},state=>states.push(state));
 saver.update({answer:2});await assert.rejects(saver.flush(),/offline/);assert.equal(saver.dirty,true);assert.equal(saver.revision,4);assert.deepEqual(saver.value,{answer:2});assert.equal(states.at(-1),'error');
 fail=false;await saver.flush();assert.equal(saver.revision,5);assert.equal(saver.dirty,false);saver.dispose();
});
test('短延迟自动保存合并连续点击；无变化和已卸载的页面不写入',async()=>{
 const calls:number[]=[];const saver=new DraftAutosaver(0,0,async(value,revision)=>{calls.push(value);return {revision:revision+1};},()=>{},5);
 saver.update(1);saver.update(2);saver.update(3);await delay(20);assert.deepEqual(calls,[3]);assert.equal(saver.dirty,false);
 saver.update(3);await delay(10);assert.deepEqual(calls,[3]);saver.update(4);saver.dispose();await delay(10);assert.deepEqual(calls,[3]);
});
test('只换页也保存；JSONB键顺序变化不导致假冲突，数组顺序不能被忽略',async()=>{
 assert.equal(stableDraftJSON({phase:'questions',page:1}),stableDraftJSON({page:1,phase:'questions'}));assert.notEqual(stableDraftJSON([1,2]),stableDraftJSON([2,1]));
 const saved:unknown[]=[];const saver=new DraftAutosaver(3,{page:1,answer:2},async(value,revision)=>{saved.push(value);return {revision:revision+1};},()=>{});
 saver.update({answer:2,page:1});assert.equal(saver.dirty,false);saver.update({page:20,answer:2});await saver.flush();assert.deepEqual(saved,[{page:20,answer:2}]);saver.dispose();
});
test('恢复服务器准确停留位置；旧邀请无游标时从未完成题/后续阶段继续',()=>{
 const ids=Array.from({length:277},(_,i)=>String(i)),values={selected:[[],[],[],[]] as string[][],ranked:[] as string[]};
 const saved={phase:'groups' as const,page:22,group:2};assert.deepEqual(resumeGhProgress(ids,{},values,saved),saved);
 assert.deepEqual(resumeGhProgress(ids,{'0':3,'1':2,'2':1},values),{phase:'questions',page:1,group:0});
 const answers=Object.fromEntries(ids.map(id=>[id,3]));assert.equal(resumeGhProgress(ids,answers,values).phase,'groups');
 const full={selected:Array.from({length:4},()=>['a','b','c','d','e']),ranked:[]};assert.equal(resumeGhProgress(ids,answers,full).phase,'shortlist');assert.equal(resumeGhProgress(ids,answers,{...full,ranked:Array(10).fill('a')}).phase,'rank');
 for(const bad of [{phase:'rules',page:0,group:0},{phase:'questions',page:93,group:0},{phase:'groups',page:0,group:4},{phase:'questions',page:0.5,group:0}])assert.equal(ghProgressSchema.safeParse(bad).success,false);
});
