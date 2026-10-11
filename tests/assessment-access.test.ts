import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canManageAssessment} from '@qilun/security/assessment-access.ts';
import {settingsTabs} from '../apps/admin-web/src/settings-access.ts';

test('后台入口与服务端使用相同角色约束，未知或中心通用admin角色不默认获得权限',()=>{
 for(const role of ['hr','ops','interviewer','admin','', 'TALENT_LEAD']){
  assert.equal(canManageAssessment(role),false);
  assert.ok(!settingsTabs(role).some(tab=>['assessment-admin','rules'].includes(tab.id)));
 }
 assert.equal(canManageAssessment('talent_lead'),true);
 assert.ok(settingsTabs('talent_lead').some(tab=>tab.id==='assessment-admin'));
 assert.ok(settingsTabs('ops').some(tab=>tab.id==='audit'));
 assert.ok(!settingsTabs('hr').some(tab=>tab.id==='audit'));
});
test('日常测评入口不再包含原理和留白模板，后台按需加载且独立校验角色',async()=>{
 const source=(file:string)=>readFile(new URL('../apps/admin-web/src/'+file,import.meta.url),'utf8');
 const daily=await source('assessment-center.tsx');
 assert.doesNotMatch(daily,/AssessmentReplica|OriginalReportStudio|规则核验|版式与留白/);
 assert.match(daily,/ReferenceReportView/);assert.match(daily,/canManageAssessment\(role\).*action:'delete'/);assert.match(daily,/永久删除本次测评/);
 const main=await source('main.tsx');assert.match(main,/lazy\(\(\)=>import\('\.\/assessment-admin.tsx'\)/);assert.doesNotMatch(main,/import \{AssessmentRules\}/);assert.match(main,/active==='assessment-admin'&&canManageAssessment\(role\)/);
 const admin=await source('assessment-admin.tsx');assert.match(admin,/if\(!canManageAssessment\(role\)\)/);assert.match(admin,/原版报告 · 版式与留白/);assert.match(admin,/齐论测评 · 规则核验/);
});
