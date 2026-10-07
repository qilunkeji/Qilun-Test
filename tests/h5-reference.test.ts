import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ghInvitePackage,emptyGhValues,validateGhInviteDraft,scoreGhInvite} from '../packages/assessment-engine/gh-invite.ts';
import {deploymentConfig} from '../apps/api/deployment.ts';
test('277手机邀请只包含题干与选项，不包含计分权重、私人历史人员或推算模型',()=>{
 const p=ghInvitePackage();assert.equal(p.questions.length,277);assert.equal(p.words.length,32);assert.equal(p.estimate_abilities,false);assert.equal(p.value_groups.length,4);
 assert.ok(p.questions.every(q=>!('scores' in q)));assert.ok(!JSON.stringify(p).includes('support'));
});
test('277草稿允许未答题和未完成价值观，但拒绝未知题号、跨组词和重复排序',()=>{
 const p=ghInvitePackage();validateGhInviteDraft(p,{},emptyGhValues());
 assert.throws(()=>validateGhInviteDraft(p,{fake:1},emptyGhValues()));assert.throws(()=>validateGhInviteDraft(p,{[p.questions[0].id]:6},emptyGhValues()));
 const v=emptyGhValues();v.selected[0]=[p.value_groups[1][0]];assert.throws(()=>validateGhInviteDraft(p,{},v));
 assert.throws(()=>validateGhInviteDraft(p,{},emptyGhValues(),true));
});
test('277完整邀请只生成已知规则的持久化发展参考，能力默认留白，招聘决策标志仍关闭',()=>{
 const p=ghInvitePackage(),answers=Object.fromEntries(p.questions.map(q=>[q.id,3]));
 const selected=p.value_groups.map(g=>g.slice(0,5)),v={selected,ranked:selected.flat().slice(0,10)};
 const r=scoreGhInvite(p,answers,v);assert.equal(r.persisted_as_person_reference,true);assert.equal(r.formal_score,false);assert.equal(r.recruitment_decision_allowed,false);assert.equal(r.result.value_flow_verified,true);assert.equal(r.result.roles.length,8);assert.equal(r.result.strengths.length,34);assert.equal('abilities' in r.result,false);
 assert.throws(()=>scoreGhInvite(ghInvitePackage('missing'),answers,v));
});
test('公网启动必须明确允许单实例HTTPS且仅绑定回环，开发默认不受影响',()=>{
 const e={NODE_ENV:'production',SINGLE_INSTANCE_HTTPS:'1',PUBLIC_ORIGIN:'https://rc.iqilun.cn',H5_ORIGIN:'https://rc.iqilun.cn',DATA_DIR:'/opt/qilun-talent/shared/database',LISTEN_HOST:'127.0.0.1',PORT:'43130'};
 assert.equal(deploymentConfig(e).production,true);assert.equal(deploymentConfig({}).production,false);
 for(const bad of [{SINGLE_INSTANCE_HTTPS:'0'},{LISTEN_HOST:'0.0.0.0'},{PUBLIC_ORIGIN:'http://rc.iqilun.cn'},{H5_ORIGIN:'https://other.invalid'},{DATA_DIR:'.local/database'}])assert.throws(()=>deploymentConfig({...e,...bad}));
});
