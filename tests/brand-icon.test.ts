import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

test('后台和H5共用齐论正式图标入口，禁止回退到默认模板图标',()=>{
 const html=readFileSync(new URL('../apps/admin-web/index.html',import.meta.url),'utf8');
 for(const rel of ['icon','apple-touch-icon'])assert.match(html,new RegExp(`rel="${rel}"[^>]*href="/brand/qilun-favicon.png\\?v=20261003"`));
 assert.doesNotMatch(html,/vite\.svg|react\.svg|favicon\.ico/);
 const png=readFileSync(new URL('../apps/admin-web/public/brand/qilun-favicon.png',import.meta.url));
 assert.equal(png.subarray(1,4).toString(),'PNG');
 assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[118,128]);
 assert.ok(png.readUInt32BE(16)>=64);
 assert.equal(createHash('sha256').update(png).digest('hex'),'d45fe2c49d43c52bb7d719a86187b98bb0ebe9949027c617732c76baeb69c6b6');
});
