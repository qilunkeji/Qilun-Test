import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selfReviewPackage,scoreSelfReview,validateAnswers} from '@qilun/assessment-engine/self-review.ts';
const ids=selfReviewPackage.dimensions.flatMap(d=>d.questions.map(q=>q.id));
test('24项原创自评固定计分边界、重算一致和逐题依据',()=>{
 assert.equal(ids.length,24);assert.equal(new Set(ids).size,24);
 for(const [answer,score] of [[1,0],[3,50],[5,100]]){const input=Object.fromEntries(ids.map(id=>[id,answer]));const r=scoreSelfReview(selfReviewPackage,input);assert.ok(r.dimensions.every(d=>d.score===score&&d.evidence.length===3));assert.deepEqual(r,scoreSelfReview(selfReviewPackage,input));assert.equal(r.flat_response,true);}
});
test('缺答不补零、未知题号和越界拒绝',()=>{
 assert.throws(()=>scoreSelfReview(selfReviewPackage,{}));assert.deepEqual(validateAnswers(selfReviewPackage,{}),{});
 assert.throws(()=>validateAnswers(selfReviewPackage,{unknown:3}));assert.throws(()=>validateAnswers(selfReviewPackage,{[ids[0]]:0}));assert.throws(()=>validateAnswers(selfReviewPackage,{[ids[0]]:2.5}));
});
