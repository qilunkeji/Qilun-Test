import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {invitationStats,auditDisplay,privacySummary,sourceLabel} from '../apps/admin-web/src/ui-presentation.ts';
import {parseRoute,routePath} from '../apps/admin-web/src/navigation.ts';

test('统计沿用提交/撤销/过期判定，零、一和大数值不补零',()=>{
 const now=new Date('2026-10-08').getTime(),active={submitted_at:null,revoked_at:null,expires_at:'2099-01-01'};
 assert.deepEqual(invitationStats([],now),{total:0,completed:0,pending:0});
 assert.deepEqual(invitationStats([active],now),{total:1,completed:0,pending:1});
 assert.equal(invitationStats(Array(1001).fill(active),now).pending,1001);
 assert.deepEqual(invitationStats([active,{...active,submitted_at:'2026-01-01'},{...active,revoked_at:'2026-01-01'},{...active,expires_at:'2020-01-01'}],now),{total:4,completed:1,pending:1});
});
test('导航只接受已知模块/UUID/受支持创建，旧根路径不变；URL不带敏感正文',()=>{
 const id='00000000-0000-4000-8000-000000000001';
 assert.deepEqual(parseRoute('/'),{view:'dashboard'});
 for(const view of ['jobs','talents','interviews','assessments'] as const)assert.deepEqual(parseRoute(routePath({view,id})),{view,id});
 assert.deepEqual(parseRoute('/settings/audit'),{view:'settings',section:'audit'});
 assert.equal(parseRoute('/talents/姓名手机号').invalid,true);assert.equal(parseRoute('/optimize/'+id).invalid,true);
 assert.equal(parseRoute('/talents/new').invalid,true);assert.equal(parseRoute('/unknown').invalid,true);
 assert.equal(routePath({view:'jobs'}),'/jobs');
});
test('中文事件不改原审计数据，拒绝不标成功；未知值可追溯',()=>{
 assert.equal(auditDisplay('contact.read').label,'审计查看联系方式');assert.equal(auditDisplay('access.denied').result,'已拒绝');
 const raw='future.event';assert.equal(auditDisplay(raw).label,raw);assert.equal(auditDisplay(raw).known,false);assert.match(auditDisplay(raw).result,/未知/);
});
test('人才缺授权/期限不默认成功，不推断或延长；来源未知保留原码',()=>{
 assert.match(privacySummary(null,null,null).authorization,/缺失/);assert.match(privacySummary(null,null,null).retention,/未知/);
 assert.match(privacySummary('测试用途','虚构授权','2020-01-01').retention,/已到期/);
 assert.equal(sourceLabel('manual'),'人工授权导入');assert.match(sourceLabel('unknown-channel'),/unknown-channel.*待核/);
});
test('后台共用CSS不选择原稿画布或改计分源，Logo不加混合效果',()=>{
 const css=readFileSync('apps/admin-web/src/unified-ui.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
 assert.doesNotMatch(css,/\.original-sheet|\.original-slot(?!-hit)|\.original-computed/);
 assert.doesNotMatch(readFileSync('apps/admin-web/src/premium.css','utf8'),/mix-blend-mode|filter:\s*drop-shadow/);
});
