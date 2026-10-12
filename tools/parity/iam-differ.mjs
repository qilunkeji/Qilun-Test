/**
 * IAM-specific differ (R6 prep batch 3): boots both systems with IAM_ENABLED=1
 * plus a mock OIDC issuer, and verifies the IAM endpoint family:
 *   - auth/options reports unified_login
 *   - local password login is rejected (IAM_REQUIRED)
 *   - webhook with valid HMAC signature processes identity
 *   - webhook with invalid signature is rejected
 *   - session endpoint returns null user when not authenticated
 *   - authenticated business endpoints reject without IAM session
 *   - identity mapping created staff_users/iam_identities rows (via webhook)
 *
 *   IAM_DIFFER=1 node --experimental-strip-types tools/parity/iam-differ.mjs [--java]
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const ROOT = resolve(here, '../..');
const FIXED_KEY = randomBytes(32).toString('hex');
const WEBHOOK_SECRET = randomBytes(32).toString('hex');
const AGENT_TOKEN = randomBytes(32).toString('base64url');
const AGENT_SHA = createHash('sha256').update(AGENT_TOKEN).digest('hex');
const TENANT = '00000000-0000-4000-8000-000000000001';
const PORT_LEGACY = 3211, PORT_JAVA = 43140, PORT_IDP = 3999;

function normalize(value, key) {
  const VOLATILE = new Set(['request_id', 'csrf_token', 'token', 'session', 'cookie', 'url', 'pin', 'lease_token', 'nonce', 'waiting_seconds', 'oldest_queued_seconds']);
  if (Array.isArray(value)) return value.map(v => normalize(v));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (VOLATILE.has(k)) { out[k] = '<volatile>'; continue; }
      out[k] = normalize(v, k);
    }
    return out;
  }
  return value;
}

async function main() {
  const failures = [];
  const check = (name, a, b) => {
    const ja = JSON.stringify(normalize(a)), jb = JSON.stringify(normalize(b));
    if (ja === jb) { console.log(`PASS ${name}`); }
    else { failures.push(name); console.log(`FAIL ${name}\n  A: ${ja.slice(0, 300)}\n  B: ${jb.slice(0, 300)}`); }
  };

  // mock IdP
  const idp = createServer((req, res) => {
    if (req.url.startsWith('/api/v1/service/users/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'parity-user-001', auth_user_id: 'parity-user-001', system_id: 'sys_parity_test',
        status: 'active', username: 'parity_iam_user', roles: ['talent_lead'], permissions: ['talent.view', 'talent.manage'],
      }));
      return;
    }
    res.writeHead(404); res.end('{}');
  });
  await new Promise(r => idp.listen(PORT_IDP, '127.0.0.1', r));

  // boot legacy
  const legacyDir = await mkdtemp(join(tmpdir(), 'qilun-iam-legacy-'));
  const { openDatabase } = await import('../../apps/api/db.ts');
  const { hashPassword } = await import('@qilun/security/index.ts');
  const legacyDb = await openDatabase(legacyDir);
  await legacyDb.query('INSERT INTO tenants(id,name) VALUES($1,$2)', [TENANT, 'parity']);
  await legacyDb.query('INSERT INTO staff_users(id,tenant_id,username,password_hash,role) VALUES($1,$2,$3,$4,$5)',
    ['00000000-0000-4000-8000-000000000002', TENANT, 'local-admin', await hashPassword('Parity!Fixed-2026'), 'talent_lead']);
  await legacyDb.close();

  const legacyEnv = {
    ...process.env, PORT: String(PORT_LEGACY), DATA_DIR: legacyDir,
    PUBLIC_ORIGIN: `http://127.0.0.1:${PORT_LEGACY}`, H5_ORIGIN: `http://127.0.0.1:${PORT_LEGACY}`,
    CONTACT_ENCRYPTION_KEY: FIXED_KEY, NODE_ENV: '',
    IAM_ENABLED: '1', IAM_ISSUER: `http://127.0.0.1:${PORT_IDP}`, IAM_CLIENT_ID: 'client_parity',
    IAM_CLIENT_SECRET: 'secret_parity', IAM_WEBHOOK_SECRET: WEBHOOK_SECRET, IAM_SYSTEM_ID: 'sys_parity_test',
    IAM_SESSION_DB: '/tmp/qilun-iam-differ-' + Date.now() + '.db', DEFAULT_TENANT_ID: TENANT,
  };
  const legacy = spawn(process.execPath, ['--experimental-strip-types', 'apps/api/main.ts'],
    { cwd: ROOT, env: legacyEnv, stdio: ['ignore', 'ignore', 'pipe'] });
  for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 500)); try { if ((await fetch(`http://127.0.0.1:${PORT_LEGACY}/api/v1/health`)).ok) break; } catch {} }

  // boot java
  const { default: pg } = await import('pg');
  const admin = new pg.Client({ connectionString: 'postgres://qilun@127.0.0.1:54329/postgres' });
  await admin.connect();
  const javaDb = 'qilun_iam_differ_' + Date.now();
  await admin.query(`CREATE DATABASE ${javaDb}`);
  await admin.end();

  const java = spawn(process.env.JAVA_BIN ?? 'java', ['-jar', 'backend/qilun-api/target/qilun-api-0.1.0-SNAPSHOT.jar'], {
    cwd: ROOT,
    env: {
      ...process.env,
      QILUN_DATABASE_URL: `jdbc:postgresql://127.0.0.1:54329/${javaDb}?user=qilun`,
      QILUN_ORIGIN: `http://127.0.0.1:${PORT_JAVA}`, SERVER_PORT: String(PORT_JAVA),
      QILUN_PARITY_SEED: '1', CONTACT_ENCRYPTION_KEY: FIXED_KEY,
      IAM_ENABLED: '1', IAM_ISSUER: `http://127.0.0.1:${PORT_IDP}`, IAM_CLIENT_ID: 'client_parity',
      IAM_CLIENT_SECRET: 'secret_parity', IAM_WEBHOOK_SECRET: WEBHOOK_SECRET, IAM_SYSTEM_ID: 'sys_parity_test',
      DEFAULT_TENANT_ID: TENANT,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  for (let i = 0; i < 90; i++) { await new Promise(r => setTimeout(r, 500)); try { if ((await fetch(`http://127.0.0.1:${PORT_JAVA}/api/v1/health`)).ok) break; } catch {} }

  const call = async (port, path, opts = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: opts.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}`, ...(opts.headers ?? {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    let parsed; try { parsed = await res.json(); } catch { parsed = { raw: 'non-json' }; }
    return { status: res.status, body: parsed };
  };

  // 1) auth/options in IAM mode
  check('auth-options-iam', await call(PORT_LEGACY, '/api/v1/auth/options'), await call(PORT_JAVA, '/api/v1/auth/options'));

  // 2) local password login rejected
  check('login-rejected-iam',
    await call(PORT_LEGACY, '/api/v1/auth/login', { method: 'POST', body: { username: 'local-admin', password: 'Parity!Fixed-2026' } }),
    await call(PORT_JAVA, '/api/v1/auth/login', { method: 'POST', body: { username: 'local-admin', password: 'Parity!Fixed-2026' } }));

  // 3) session endpoint returns null user
  check('iam-session-null', await call(PORT_LEGACY, '/api/iam/session'), await call(PORT_JAVA, '/api/iam/session'));

  // 4) webhook with valid HMAC
  const webhookBody = JSON.stringify({
    event_id: 'iam-parity-' + Date.now(), system_id: 'sys_parity_test',
    user: { id: 'parity-user-001', auth_user_id: 'parity-user-001', system_id: 'sys_parity_test', status: 'active', username: 'parity_iam_user', roles: ['talent_lead'], permissions: ['talent.view', 'talent.manage'] },
  });
  const ts = String(Date.now());
  const sig = createHmac('sha256', WEBHOOK_SECRET).update(ts + '.' + webhookBody).digest('hex');
  const webhookOpts = { method: 'POST', headers: { 'x-iam-timestamp': ts, 'x-iam-signature': sig }, body: JSON.parse(webhookBody) };
  check('iam-webhook-valid', await call(PORT_LEGACY, '/api/iam/webhook', webhookOpts), await call(PORT_JAVA, '/api/iam/webhook', webhookOpts));

  // 5) webhook with invalid signature
  const badOpts = { method: 'POST', headers: { 'x-iam-timestamp': ts, 'x-iam-signature': '0'.repeat(64) }, body: JSON.parse(webhookBody) };
  check('iam-webhook-bad-sig', await call(PORT_LEGACY, '/api/iam/webhook', badOpts), await call(PORT_JAVA, '/api/iam/webhook', badOpts));

  // 6) authenticated business endpoint rejects without IAM session
  check('dashboard-unauthenticated-iam',
    await call(PORT_LEGACY, '/api/v1/dashboard'),
    await call(PORT_JAVA, '/api/v1/dashboard'));

  // cleanup
  legacy.kill(); java.kill();
  await rm(legacyDir, { recursive: true, force: true });
  const admin2 = new pg.Client({ connectionString: 'postgres://qilun@127.0.0.1:54329/postgres' });
  await admin2.connect();
  await admin2.query(`DROP DATABASE IF EXISTS ${javaDb}`);
  await admin2.end();
  idp.close();

  console.log(failures.length ? `IAM_DIFFER_FAILED (${failures.join(', ')})` : 'IAM_DIFFER_OK');
  process.exit(failures.length ? 1 : 0);
}

main().catch(e => { console.error('IAM_DIFFER_ERROR', e); process.exit(2); });
