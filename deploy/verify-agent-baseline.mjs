// No DB. Compare the immutable scoring baseline before/after activation.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const r=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','deploy/verify-qilun-standard.mjs'],{encoding:'utf8'}));
assert.equal(r.result,'passed');assert.equal(r.rules_fingerprint,'03f5e8584eeddd2c56ab7d4ce1ef6e72dd62d1bda42f2efd4cad176826f006b3');assert.equal(r.synthetic_result_sha256,'cc1db892e631d83ce8180bf95646a9dd6e4712aa0155ec5fc4597f91fc3b0576');
console.log(JSON.stringify({result:'passed',fixed_rules_preserved:true,synthetic_sha_preserved:true}));
