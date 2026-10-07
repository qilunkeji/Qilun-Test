// Synthetic read-only verification. Do NOT import API/main or open a database.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadAssessmentRuntime} from '../apps/api/assessment-product.ts';
import {ghInvitePackage,qilunStandardInvitePackage,scoreGhInvite} from '../packages/assessment-engine/gh-invite.ts';
const runtime=loadAssessmentRuntime();assert.ok(runtime.standard,runtime.problem);
const r=runtime.standard,pkg=qilunStandardInvitePackage(r),answers=Object.fromEntries(pkg.questions.map(q=>[q.id,3])),selected=pkg.value_groups.map(g=>g.slice(0,5)),v={selected,ranked:selected.flat().slice(0,10)};
const one=scoreGhInvite(pkg,answers,v,r.model,r),two=scoreGhInvite(pkg,Object.fromEntries(Object.entries(answers).reverse()),v,r.model,r);
assert.deepEqual(one,two);assert.equal(one.result.abilities.length,28);assert.equal(one.result.roles.length,8);assert.equal(one.result.strengths.length,34);assert.equal(one.result.product.runtime_training,false);
assert.doesNotMatch(JSON.stringify(one),/coefficients|"support"|holdout|mean_absolute_error|private_id/);
assert.equal('abilities' in scoreGhInvite(ghInvitePackage(),answers,v).result,false);
console.log(JSON.stringify({result:'passed',version:pkg.version,abilities:28,roles:8,strengths:34,deterministic:true,legacy_compatible:true,rules_fingerprint:r.rules_fingerprint,synthetic_result_sha256:createHash('sha256').update(JSON.stringify(one)).digest('hex')},null,2));
