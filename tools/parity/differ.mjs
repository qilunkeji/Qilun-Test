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
const MODE = process.argv.includes('--a') && process.argv.includes('--b') ? 'url' : (process.argv.includes('--java') ? 'java' : 'self');
const ONLY = arg('only') ? new Set(arg('only').split(',')) : null;

// --- normalization ---------------------------------------------------------
const VOLATILE_KEYS = new Set(['request_id', 'csrf_token', 'token', 'session', 'cookie', 'url', 'pin']);
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}T\d{2}:/;
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DB_ENGINE = new Set(['pglite', 'postgresql']);
const ORIGIN_LIKE = /^http:\/\/127\.0\.0\.1:\d+$/;
function normalize(value, key, parent) {
  // the whole point of the rewrite: legacy reports 'pglite', the Java backend
  // reports 'postgresql' for the same healthy deployment — an intended delta.
  if (key === 'database' && parent === 'data' && DB_ENGINE.has(value)) return '<engine>';
  if (key === 'h5_origin' && typeof value === 'string' && ORIGIN_LIKE.test(value)) return '<origin>';
  if (Array.isArray(value)) return value.map(v => normalize(v));
  if (value && typeof value === 'object') {
    const out = {};
    const parentKey = key;
    for (const [k, v] of Object.entries(value)) {
      if (VOLATILE_KEYS.has(k)) { out[k] = '<volatile>'; continue; }
      out[k] = normalize(v, k, parentKey);
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
  const loginBody = await login.json();
  results.push({ name: 'login', status: login.status, body: normalize(loginBody), setCookie: '<cookie>' });
  const csrf = loginBody.data && loginBody.data.csrf_token;
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

  // --- stateful assessment flow: create entry -> enroll -> answer -> submit -> report
  const ctx = {};
  const flow = async (name, path, opts = {}) => {
    const res = await fetch(base + path, {
      method: opts.method ?? 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base, ...(session ? { Cookie: session } : {}), ...(csrf && (opts.body !== undefined || opts.method === 'DELETE') ? { 'X-CSRF-Token': csrf } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 200) }; }
    if (opts.extract) {
      try { opts.extract(parsed, ctx); }
      catch (e) { throw new Error(`scenario ${name} unexpected shape: ${JSON.stringify(parsed).slice(0, 400)} :: ${e.message}`); }
    }
    return { name, status: res.status, body: normalize(parsed), setCookie: null };
  };
  const PK = 'ParityParticipantKey01234567890123456789010';
  results.push(await flow('invite-create', '/api/v1/assessment/invites', {
    body: { purpose: '对等验证：标准测评全链路', days: 7 },
    extract: j => { ctx.entryToken = j.data.url.split('#')[1]; },
  }));
  results.push(await flow('entry-open', '/api/v1/public/assessment/entry/open', { body: { token: ctx.entryToken } }));
  results.push(await flow('entry-enroll', '/api/v1/public/assessment/entry/enroll', {
    body: { token: ctx.entryToken, participant_key: PK, accepted: true, consent_version: 'qilun-internal-assessment-consent/1.0.0', profile: { name: '【虚构】对等参与者', phone: '13800000000', birth_date: '1990-06-15' } },
  }));
  results.push(await flow('personal-open', '/api/v1/public/assessment/open', {
    body: { token: PK },
    extract: j => { ctx.qids = j.data.package.questions.map(q => q.id); ctx.groups = j.data.package.value_groups; },
  }));
  const answers = Object.fromEntries(ctx.qids.map(id => [id, 3]));
  const selected = ctx.groups.map(g => g.slice(0, 5)), ranked = selected.flat().slice(0, 10);
  results.push(await flow('draft-save', '/api/v1/public/assessment/save', {
    body: { token: PK, revision: 0, answers: { [ctx.qids[0]]: 3 }, value_draft: { selected: [[], [], [], []], ranked: [] } },
  }));
  results.push(await flow('submit', '/api/v1/public/assessment/submit', {
    body: { token: PK, revision: 1, answers, value_draft: { selected, ranked }, active_seconds: 120 },
  }));
  results.push(await flow('submit-idempotent', '/api/v1/public/assessment/submit', {
    body: { token: PK, revision: 2, answers, value_draft: { selected, ranked } },
  }));
  results.push(await flow('invites-list', '/api/v1/assessment/invites', { method: 'GET' }));
  const listRes = await fetch(base + '/api/v1/assessment/invites', { headers: { Origin: base, Cookie: session } });
  const listJson = await listRes.json();
  const inviteId = listJson.data.items[0] && listJson.data.items[0].id;
  if (inviteId) results.push(await flow('invite-report', `/api/v1/assessment/invites/${inviteId}/report`, { method: 'GET' }));
  results.push(await flow('dashboard-after', '/api/v1/dashboard', { method: 'GET' }));
  // --- resume chain: web import -> library -> grant -> extension import -> duplicate -> delete
  const importBody = {
    name: '【虚构】简历链路', purpose: 'recruitment', processing_basis: '对等验证用途说明',
    retention_until: new Date(Date.now() + 200 * 86400000).toISOString(), channel: 'manual-parity',
    external_id: 'parity-001', authorization_ref: 'parity-auth', filename: 'parity.txt',
    text_content: '张三\n五年后端经验\n熟悉Java与PostgreSQL', completeness: 'full',
  };
  results.push(await flow('resume-import', '/api/v1/talents/imports', { body: importBody, extract: j => { ctx.resumeId = j.data.resume_version_id; ctx.candidateId = j.data.candidate_id; } }));
  results.push(await flow('resume-library', '/api/v1/resume-library', { method: 'GET' }));
  results.push(await flow('resumes-detail', '/api/v1/resumes/' + ctx.resumeId, { method: 'GET' }));
  results.push(await flow('talents-detail', '/api/v1/talents/' + ctx.candidateId, { method: 'GET' }));
  results.push(await flow('grant-create', '/api/v1/resume-extension/grants', {
    body: { extension_id: 'abcdefghijklmnopabcdefghijklmnop' },
    extract: j => { ctx.crToken = j.data.token; },
  }));
  const extImport = await fetch(base + '/extension/v1/imports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop', Authorization: 'Bearer ' + ctx.crToken },
    body: JSON.stringify({ ...importBody, text_content: importBody.text_content + '\n扩展导入一版' }),
  });
  results.push({ name: 'extension-import', status: extImport.status, body: normalize(await extImport.json()), setCookie: null });
  results.push(await flow('resume-import-duplicate', '/api/v1/talents/imports', { body: importBody }));
  // job chain: create job -> application for the imported candidate
  const jobCreate = await flow('job-create', '/api/v1/jobs', {
    method: 'POST',
    body: { title: '对等验证岗位', department: '质量部', owner: 'parity', location: '远程', tasks: '对等验证职责', criteria: '对等验证标准', public_jd: '对等验证JD', status: 'open', change_reason: '初始' },
    extract: j => { ctx.jobId = j.data.id; ctx.versionId = j.data.version_id; },
  });
  results.push(jobCreate);
  const appCreate = await flow('application-create', '/api/v1/applications', {
    body: { candidate_id: ctx.candidateId, job_id: ctx.jobId, job_version_id: ctx.versionId, resume_version_id: ctx.resumeId, batch: 'parity-batch' },
    extract: j => { ctx.applicationId = j.data.id; },
  });
  results.push(appCreate);
  results.push(await flow('application-duplicate', '/api/v1/applications', {
    body: { candidate_id: ctx.candidateId, job_id: ctx.jobId, job_version_id: ctx.versionId, resume_version_id: ctx.resumeId, batch: 'parity-batch' },
  }));
  results.push(await flow('resume-delete-in-use', '/api/v1/resume-library/' + ctx.resumeId + '/delete', { body: { confirm: 'delete_resume' } }));
  // --- recruiting materials + interview chain
  results.push(await flow('material-create', '/api/v1/recruiting/materials', {
    body: { title: '对等验证公司介绍', category: '公司介绍', source_name: 'parity', content: '对等验证参考资料内容，至少五个字。' },
    extract: j => { ctx.materialId = j.data.id; },
  }));
  results.push(await flow('materials-list', '/api/v1/recruiting/materials', { method: 'GET' }));
  results.push(await flow('material-detail', '/api/v1/resumes-material/'.replace('resumes-material/', 'recruiting/materials/') + ctx.materialId, { method: 'GET' }));
  results.push(await flow('interview-create', '/api/v1/interviews', {
    body: { application_id: ctx.applicationId, assessment_id: null, rubric: [{ name: '工程能力', requirement: '能独立完成后端开发任务', weight: 60 }, { name: '协作沟通', requirement: '能与团队清晰协作', weight: 40 }], question_count: 10 },
    extract: j => { ctx.interviewId = j.data.id; },
  }));
  results.push(await flow('interviews-list', '/api/v1/interviews', { method: 'GET' }));
  results.push(await flow('interview-detail', '/api/v1/interviews/' + ctx.interviewId, { method: 'GET' }));
  results.push(await flow('interview-transcript', '/api/v1/interviews/' + ctx.interviewId + '/transcript', {
    body: { text: '候选人回答：我负责过完整订单系统的设计与上线。', expected_revision: 0, processing_confirmed: true },
  }));
  results.push(await flow('interview-transcript-conflict', '/api/v1/interviews/' + ctx.interviewId + '/transcript', {
    body: { text: '候选人回答：我负责过完整订单系统的设计与上线（旧版本）。', expected_revision: 0, processing_confirmed: true },
  }));
  results.push(await flow('material-archive', '/api/v1/recruiting/materials/' + ctx.materialId + '/archive', { body: {} }));
  results.push(await flow('interview-assessments', '/api/v1/interviews/assessments/' + ctx.applicationId, { method: 'GET' }));
  results.push(await flow('audit-after', '/api/v1/audit-events', { method: 'GET' }));
  return ONLY ? results.filter(r => ONLY.has(r.name)) : results;
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

// --- java system boot (R1+): fresh throwaway PG database + spring boot jar ---
async function bootJava(port) {
  const dbName = `qilun_parity_java_${Date.now()}`;
  const { default: pg } = await import('pg');
  const admin = new pg.Client({ connectionString: 'postgres://qilun@127.0.0.1:54329/postgres' });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();
  const origin = `http://127.0.0.1:${port}`;
  const javaBin = process.env.JAVA_BIN ?? 'java';
  const jar = resolve(ROOT, 'backend/qilun-api/target/qilun-api-0.1.0-SNAPSHOT.jar');
  const child = spawn(javaBin, ['-jar', jar], {
    cwd: ROOT,
    env: { ...process.env, QILUN_DATABASE_URL: `jdbc:postgresql://127.0.0.1:54329/${dbName}?user=qilun`, QILUN_ORIGIN: origin, SERVER_PORT: String(port), QILUN_PARITY_SEED: '1', CONTACT_ENCRYPTION_KEY: FIXED_KEY },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stderr = []; child.stderr.on('data', d => stderr.push(d)); child.stdout.on('data', d => stderr.push(d));
  const { createWriteStream } = await import('node:fs');
  const logFile = createWriteStream(resolve(ROOT, 'tools/parity/java-last.log'));
  child.stdout.on('data', d => logFile.write(d)); child.stderr.on('data', d => logFile.write(d));
  child.on('exit', () => logFile.end());
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 500));
    try { const res = await fetch(`${origin}/api/v1/health`); if (res.ok) return { child, dbName, origin, stderr }; } catch { /* booting */ }
  }
  child.kill();
  throw new Error(`java system failed to boot on ${origin}: ${Buffer.concat(stderr).toString().slice(0, 400)}`);
}

// --- driver ----------------------------------------------------------------
async function capture(base) { return runScenarios(base); }
function diffResults(a, b) {
  const problems = [];
  if (a.length !== b.length) problems.push(`scenario count ${a.length} vs ${b.length}`);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const ja = JSON.stringify(a[i]), jb = JSON.stringify(b[i]);
    if (ja !== jb) {
      let pos = 0;
      while (pos < Math.min(ja.length, jb.length) && ja[pos] === jb[pos]) pos++;
      problems.push(`scenario "${a[i].name}" differs at char ${pos}:
  A: ${ja.slice(Math.max(0, pos - 80), pos + 140)}
  B: ${jb.slice(Math.max(0, pos - 80), pos + 140)}`);
    }
  }
  return problems;
}

let systems = [];
try {
  let a, b;
  if (MODE === 'url') {
    a = await capture(arg('a')); b = await capture(arg('b'));
  } else if (MODE === 'java') {
    const legacy = await bootLegacy(3211);
    systems.push(legacy);
    console.error('[differ] capturing A (legacy) ...');
    a = await capture(legacy.origin);
    const jvm = await bootJava(43140);
    systems.push(jvm);
    console.error('[differ] capturing B (java) ...');
    b = await capture(jvm.origin);
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
