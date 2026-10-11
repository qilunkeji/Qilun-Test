/**
 * API parity differ (R0): runs an identical deterministic scenario suite against
 * two systems and diffs normalized responses field-by-field.
 *
 * Modes:
 *   self   - boots the current (legacy) system twice on fresh throwaway data dirs
 *            and compares the two captures. R0 acceptance: zero differences.
 *   url    - --a http://host:port --b http://host:port : compares two already
 *            running systems (R2+ usage: legacy vs Java backend).
 *
 * Volatile values (request ids, tokens, timestamps) are normalized before
 * comparison; both systems must be seeded with the same fixed credentials.
 * Exit code 0 only when every scenario matches.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const ROOT = resolve(here, '../..');
const FIXED_PASSWORD = 'Parity!Fixed-2026';
const FIXED_KEY = randomBytes(32).toString('hex'); // fixed per differ invocation, identical for both sides

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const MODE = process.argv.includes('--a') && process.argv.includes('--b') ? 'url' : 'self';

// --- normalization ---------------------------------------------------------
const VOLATILE_KEYS = new Set(['request_id', 'csrf_token', 'token', 'session', 'cookie']);
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}T\d{2}:/;
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function normalize(value, key) {
  if (Array.isArray(value)) return value.map(v => normalize(v));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (VOLATILE_KEYS.has(k)) { out[k] = '<volatile>'; continue; }
      out[k] = normalize(v, k);
    }
    return out;
  }
  // runtime-generated UUIDs (audit ids, session-generated rows) differ per boot
  if (key && (key === 'id' || key.endsWith('_id')) && typeof value === 'string' && UUID_LIKE.test(value)) return '<uuid>';
  if (typeof value === 'string' && ISO_LIKE.test(value)) return '<time>';
  return value;
}

// --- scenario suite (order matters; login first for session cookie) --------
async function runScenarios(base) {
  const call = async (name, path, { method = 'GET', body, cookie } = {}) => {
    const headers = { 'Content-Type': 'application/json', Origin: base };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 200) }; }
    return { name, status: res.status, body: normalize(parsed), setCookie: res.headers.get('set-cookie') ? '<cookie>' : null };
  };
  const results = [];
  results.push(await call('health', '/api/v1/health'));
  results.push(await call('auth-options', '/api/v1/auth/options'));
  const login = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ username: 'local-admin', password: FIXED_PASSWORD }) });
  const session = (login.headers.get('set-cookie') || '').split(';')[0];
  results.push({ name: 'login', status: login.status, body: normalize(await login.json()), setCookie: '<cookie>' });
  results.push(await call('auth-me', '/api/v1/auth/me', { cookie: session }));
  results.push(await call('readiness', '/api/v1/readiness', { cookie: session }));
  results.push(await call('dashboard', '/api/v1/dashboard', { cookie: session }));
  results.push(await call('jobs', '/api/v1/jobs', { cookie: session }));
  results.push(await call('talents', '/api/v1/talents', { cookie: session }));
  results.push(await call('applications', '/api/v1/applications', { cookie: session }));
  results.push(await call('audit-events', '/api/v1/audit-events', { cookie: session }));
  results.push(await call('assessment-rules-unauth', '/api/v1/assessment/rules'));
  results.push(await call('public-open-bogus', '/api/v1/public/assessment/open', { method: 'POST', body: { token: 'bogus-token-000000' } }));
  results.push(await call('ai-meta', '/api/v1/ai/meta', { cookie: session }));
  results.push(await call('auth-me-after-logout', '/api/v1/auth/me'));
  return results;
}

// --- legacy system boot ----------------------------------------------------
async function bootLegacy(port) {
  const dataDir = await mkdtemp(join(tmpdir(), `qilun-parity-${port}-`));
  const { openDatabase } = await import('../../apps/api/db.ts');
  const { hashPassword } = await import('@qilun/security/index.ts');
  const db = await openDatabase(dataDir);
  const tenant = '00000000-0000-4000-8000-000000000001', user = '00000000-0000-4000-8000-000000000002';
  await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)', [tenant, 'parity']);
  await db.query('INSERT INTO staff_users(id,tenant_id,username,password_hash,role) VALUES($1,$2,$3,$4,$5)', [user, tenant, 'local-admin', await hashPassword(FIXED_PASSWORD), 'talent_lead']);
  await db.close();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--experimental-strip-types', 'apps/api/main.ts'], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, PUBLIC_ORIGIN: origin, H5_ORIGIN: origin, CONTACT_ENCRYPTION_KEY: FIXED_KEY, NODE_ENV: '' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const stderr = []; child.stderr.on('data', d => stderr.push(d));
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500));
    try { const res = await fetch(`${origin}/api/v1/health`); if (res.ok) return { child, dataDir, origin, stderr }; } catch { /* booting */ }
  }
  child.kill(); await rm(dataDir, { recursive: true, force: true });
  throw new Error(`legacy system failed to boot on ${origin}: ${Buffer.concat(stderr).toString().slice(0, 400)}`);
}

// --- driver ----------------------------------------------------------------
async function capture(base) { return runScenarios(base); }
function diffResults(a, b) {
  const problems = [];
  if (a.length !== b.length) problems.push(`scenario count ${a.length} vs ${b.length}`);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const ja = JSON.stringify(a[i]), jb = JSON.stringify(b[i]);
    if (ja !== jb) problems.push(`scenario "${a[i].name}" differs:\n  A: ${ja.slice(0, 400)}\n  B: ${jb.slice(0, 400)}`);
  }
  return problems;
}

let systems = [];
try {
  let a, b;
  if (MODE === 'url') {
    a = await capture(arg('a')); b = await capture(arg('b'));
  } else {
    for (const [label, port] of [['A', 3211], ['B', 3212]]) {
      const sys = await bootLegacy(port);
      systems.push(sys);
      const result = await capture(sys.origin);
      if (label === 'A') a = result; else b = result;
      sys.child.kill();
      await new Promise(r => setTimeout(r, 1000));
      await rm(sys.dataDir, { recursive: true, force: true });
    }
  }
  const problems = diffResults(a, b);
  console.log(`scenarios=${a.length} diffs=${problems.length}`);
  problems.forEach(p => console.log('DIFF ' + p));
  console.log(problems.length ? 'PARITY_FAILED' : 'PARITY_OK');
  process.exit(problems.length ? 1 : 0);
} finally {
  for (const s of systems) { try { s.child.kill(); } catch { /* already gone */ } }
}
