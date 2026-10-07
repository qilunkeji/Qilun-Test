import {test} from 'node:test';
import assert from 'node:assert/strict';
import {profileSchema,boundedActiveSeconds,reportMetadata} from '../apps/api/assessment-metadata.ts';
test('资料日期拒绝无效与未来日期；历史缺失不伪造，高低吻合不默认填入',()=>{
 assert.throws(()=>profileSchema.parse({phone:'13800000000',birth_date:'2020-02-31'}));assert.throws(()=>profileSchema.parse({phone:'13800000000',birth_date:'2099-01-01'}));
 const meta=reportMetadata({tenant_id:'fictional'},Buffer.alloc(32,7));assert.equal(meta.phone,null);assert.equal(meta.active_seconds,null);assert.equal(meta.consistency.status,'unavailable');
});
test('计时单调、限服务端经过时间、不把跨日暂停计入、不信任任意客户端累加',()=>{
 const now=Date.parse('2026-10-08T00:01:00Z');assert.equal(boundedActiveSeconds(30,25,'2026-10-08T00:00:30Z',now),30);assert.equal(boundedActiveSeconds(30,10000,'2026-10-08T00:00:30Z',now),62);assert.equal(boundedActiveSeconds(30,10000,'2026-10-07T00:00:30Z',now),152);assert.equal(boundedActiveSeconds(null,undefined,null,now),null);
});
