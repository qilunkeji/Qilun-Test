/**
 * Golden-vector generator for the fixed assessment engine (R0 parity oracle).
 *
 * Produces a deterministic corpus: N answer sets across structured coverage
 * patterns (constants, ramps, alternating, low/high biased, uniform random with
 * a fixed seed), scored by the frozen TypeScript engine. The Java rewrite must
 * reproduce every vector bit-exactly (R3 acceptance gate).
 *
 * Usage:
 *   node --experimental-strip-types tools/golden/generate.mjs [--count 1200] [--seed 20261011] [--check]
 * - writes vectors.jsonl next to this script (gitignored, regenerable)
 * - writes manifest.json with the hash-chain head (committed; CI regenerates and compares)
 * - --check exits non-zero if regeneration does not reproduce the committed manifest
 */
import { createHash } from 'node:crypto';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
process.chdir(resolve(here, '../..')); // loadAssessmentRuntime resolves .local from cwd

const { loadAssessmentRuntime } = await import('../../apps/api/assessment-product.ts');
const { qilunStandardInvitePackage, scoreGhInvite } = await import('@qilun/assessment-engine/gh-invite.ts');

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? Number(process.argv[i + 1]) : dflt; };
const COUNT = arg('count', 1200), SEED = arg('seed', 20261011), CHECK = process.argv.includes('--check');

const runtime = loadAssessmentRuntime();
if (!runtime.standard) { console.error('engine unavailable:', runtime.problem); process.exit(2); }
const r = runtime.standard, pkg = qilunStandardInvitePackage(r);
const qids = pkg.questions.map(q => q.id);

// mulberry32: small, fast, fully deterministic across engines/languages
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(SEED);
const randint = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const shuffled = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// coverage patterns cycle deterministically; random patterns draw from the seeded PRNG
const PATTERN_CYCLE = ['const-1', 'const-3', 'const-5', 'ramp-up', 'ramp-down', 'alternate-15', 'alternate-51', 'low-bias', 'high-bias', 'uniform-random', 'mid-noise', 'parity-odd-even'];
function answerFor(pattern, i, q) {
  switch (pattern) {
    case 'const-1': case 'const-3': case 'const-5': return Number(pattern.slice(-1));
    case 'ramp-up': return 1 + ((q + i) % 5);
    case 'ramp-down': return 5 - ((q + i) % 5);
    case 'alternate-15': return q % 2 ? 5 : 1;
    case 'alternate-51': return q % 2 ? 1 : 5;
    case 'low-bias': return rand() < 0.75 ? randint(1, 2) : randint(3, 5);
    case 'high-bias': return rand() < 0.75 ? randint(4, 5) : randint(1, 3);
    case 'mid-noise': return rand() < 0.6 ? 3 : randint(1, 5);
    case 'parity-odd-even': return (q % 2 === i % 2) ? 2 : 4;
    default: return randint(1, 5); // uniform-random
  }
}
const valueDraft = () => {
  const selected = pkg.value_groups.map(group => shuffled(group).slice(0, 5));
  const ranked = shuffled(selected.flat()).slice(0, 10);
  return { selected, ranked };
};

const rows = [];
let chain = '';
for (let i = 0; i < COUNT; i++) {
  const pattern = PATTERN_CYCLE[i % PATTERN_CYCLE_CYCLELEN()];
  const answers = Object.fromEntries(qids.map((id, q) => [id, answerFor(pattern, i, q)]));
  const values = valueDraft();
  const report = scoreGhInvite(pkg, answers, values, r.model, r);
  const payload = JSON.stringify(report);
  const sha = createHash('sha256').update(payload).digest('hex');
  chain = createHash('sha256').update(chain + sha).digest('hex');
  rows.push(JSON.stringify({ i, pattern, answers, values, sha256: sha, report: payload }));
}
function PATTERN_CYCLE_CYCLELEN() { return PATTERN_CYCLE.length; }

const manifest = {
  generator: 'tools/golden/generate.mjs',
  seed: SEED, count: COUNT,
  engine_version: pkg.version, scoring_version: pkg.scoring_version,
  rules_fingerprint: r.rules_fingerprint, model_hash: r.model_hash,
  chain_head: chain,
};

if (CHECK) {
  const committed = JSON.parse(readFileSync(resolve(here, 'manifest.json'), 'utf8'));
  const ok = committed.chain_head === manifest.chain_head && committed.count === manifest.count;
  console.log(ok ? `GOLDEN_CHECK_OK count=${COUNT} chain=${chain.slice(0, 16)}...` : `GOLDEN_CHECK_FAILED regenerated=${manifest.chain_head} committed=${committed.chain_head}`);
  process.exit(ok ? 0 : 1);
}
writeFileSync(resolve(here, 'vectors.jsonl'), rows.join('\n') + '\n');
writeFileSync(resolve(here, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`GOLDEN_GENERATED count=${COUNT} seed=${SEED} chain_head=${chain}`);
