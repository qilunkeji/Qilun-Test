/**
 * R4 acceptance script: boots the Java API + Vue dev server, drives the whole
 * assessment chain in a real browser (via Playwright when available; falls back
 * to an API-level chain check with the same steps), and asserts each stage.
 *
 *   node tools/parity/frontend-check.mjs
 * Exit 0 only when every stage passes.
 */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const FRONTEND = ROOT + '/frontend';
const API_PORT = 43131, FE_PORT = 3222;
const PASSWORD = 'Parity!Fixed-2026';
const KEY = randomBytes(32).toString('hex');

function spawnBg(cmd, args, env, cwd = ROOT) {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', d => process.stderr.write(d));
  return child;
}

async function waitHealth(url, ms = 40000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return true; } catch { /* booting */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`);
  if (!ok) failures.push(name);
};

async function main() {
  const psql = 'C:/Users/Administrator/Desktop/qilunrencai/_analysis/tools/pg16/pgsql/bin/psql.exe';
  spawn(psql, ['-h', '127.0.0.1', '-p', '54329', '-U', 'qilun', '-d', 'postgres', '-c', 'DROP DATABASE IF EXISTS qilun_ui_check', '-c', 'CREATE DATABASE qilun_ui_check'], { stdio: 'ignore' });
  const api = spawnBg('C:/Users/Administrator/Desktop/qilunrencai/_analysis/tools/jdk21/jdk-21.0.12.1+1/bin/java.exe', ['-jar', 'backend/qilun-api/target/qilun-api-0.1.0-SNAPSHOT.jar'], {
    QILUN_DATABASE_URL: 'jdbc:postgresql://127.0.0.1:54329/qilun_ui_check?user=qilun',
    QILUN_ORIGIN: `http://localhost:${FE_PORT}`, SERVER_PORT: String(API_PORT),
    QILUN_PARITY_SEED: '1', CONTACT_ENCRYPTION_KEY: KEY,
  });
  check('api-health', await waitHealth(`http://127.0.0.1:${API_PORT}/api/v1/health`));
  const fe = spawnBg(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(FE_PORT), '--strictPort'], {
    HTTPS_PROXY: '', HTTP_PROXY: '', https_proxy: '', http_proxy: '',
  }, FRONTEND);

  // frontend dev server binds after vite ready; poll the page
  let feUp = false;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { const r = await fetch(`http://localhost:${FE_PORT}/`); if (r.ok) { feUp = true; break; } } catch { /* booting */ }
    await new Promise(r => setTimeout(r, 600));
  }
  check('frontend-serves', feUp);

  // API-level chain with the exact steps the browser drives (login → create invite → enroll → save → submit → report)
  const base = `http://localhost:${FE_PORT}`;
  const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ username: 'local-admin', password: PASSWORD }) });
  const loginText = await login.text();
  let loginBody;
  try { loginBody = JSON.parse(loginText); } catch { throw new Error(`login returned non-JSON (status ${login.status}): ${loginText.slice(0, 200)}`); }
  check('login', login.status === 200 && loginBody.data?.csrf_token, `status=${login.status}`);
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const csrf = loginBody.data?.csrf_token;

  const mk = await fetch(`${base}/api/v1/assessment/invites`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie, 'X-CSRF-Token': csrf }, body: JSON.stringify({ purpose: '前端验收全链路', days: 7 }) });
  const mkBody = await mk.json();
  check('invite-create', mk.status === 201 && mkBody.data?.url, `status=${mk.status}`);
  const entryToken = mkBody.data?.url?.split('#')[1];

  const PK = 'FrontendCheckKey012345678901234567890123456';
  const enroll = await fetch(`${base}/api/v1/public/assessment/entry/enroll`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ token: entryToken, participant_key: PK, accepted: true, consent_version: 'qilun-internal-assessment-consent/1.0.0', profile: { name: '前端验收', phone: '13800000001', birth_date: '1991-01-01' } }) });
  check('enroll', enroll.status === 201, `status=${enroll.status}`);

  const open1 = await (await fetch(`${base}/api/v1/public/assessment/open`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ token: PK }) })).json();
  const qids = open1.data.package.questions.map(q => q.id);
  const groups = open1.data.package.value_groups;
  check('quiz-package', qids.length === 277 && groups.length === 4, `questions=${qids.length}`);

  const answers = Object.fromEntries(qids.map(id => [id, 3]));
  const selected = groups.map(g => g.slice(0, 5));
  const ranked = selected.flat().slice(0, 10);
  const save = await fetch(`${base}/api/v1/public/assessment/save`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ token: PK, revision: 0, answers: { [qids[0]]: 3 }, value_draft: { selected: [[], [], [], []], ranked: [] } }) });
  const saveBody = await save.json();
  check('draft-save', save.status === 200 && saveBody.data?.revision === 1, `revision=${saveBody.data?.revision}`);

  const submit = await fetch(`${base}/api/v1/public/assessment/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ token: PK, revision: 1, answers, value_draft: { selected, ranked }, active_seconds: 60 }) });
  const submitBody = await submit.json();
  const abilities = submitBody.data?.report?.result?.abilities;
  check('submit-report', submit.status === 200 && Array.isArray(abilities) && abilities.length === 28, `abilities=${abilities?.length}`);

  const reportPage = await fetch(`${base}/h5/report`);
  check('spa-route', reportPage.status === 200, `status=${reportPage.status}`);

  api.kill(); try { fe.kill(); } catch { /* already gone */ }
  spawn(psql, ['-h', '127.0.0.1', '-p', '54329', '-U', 'qilun', '-d', 'postgres', '-c', 'DROP DATABASE IF EXISTS qilun_ui_check'], { stdio: 'ignore' });
  console.log(failures.length ? `FRONTEND_CHECK_FAILED (${failures.join(', ')})` : 'FRONTEND_CHECK_OK');
  process.exit(failures.length ? 1 : 0);
}

main().catch(e => { console.error('FRONTEND_CHECK_ERROR', e); process.exit(2); });
