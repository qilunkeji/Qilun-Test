// Local E2E seed: create invite → enroll participant → answer all 277 → submit,
// so the 已完成报告 (view=reports) tab has one row. Local diagnosis only.
const BASE = 'http://127.0.0.1:43131/api/v1';
const ORIGIN = 'http://127.0.0.1:43131';
const j = async (r) => { const b = await r.json(); if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(b.error ?? b)}`); return b.data; };
const post = (path, body, cookie = '', csrf = '') => fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, body: JSON.stringify(body) }).then(j);

// 1) admin invite
const login = await post('/auth/login', { username: 'local-admin', password: 'yMbv0pUydGLKmQgl_fUWZa_5' });
const cookie = 'qilun_session=' + login.csrf_token.slice(0, 0); // placeholder, real cookie below
const loginRes = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ username: 'local-admin', password: 'yMbv0pUydGLKmQgl_fUWZa_5' }) });
const setCookie = loginRes.headers.get('set-cookie') ?? '';
const sessionCookie = setCookie.split(';')[0];
const me = await j(await fetch(BASE + '/auth/me', { headers: { Cookie: sessionCookie } }));
const csrf = me.csrf_token;
console.log('login ok', me.username, '| cookie:', sessionCookie.slice(0, 24) + '…');

const invite = await post('/assessment/invites', { purpose: '报告显示验证', days: 7 }, sessionCookie, csrf);
const token = invite.url.split('#')[1];
console.log('invite ok, token=', token.slice(0, 8));

// 2) public flow
const open = await post('/public/assessment/entry/open', { token });
const enroll = await post('/public/assessment/entry/enroll', { token, participant_key: 'seedDiag00000000000000000000000000000000000', accepted: true, consent_version: open.consent_version, profile: { name: '验证参与者', phone: '13800000001', birth_date: '1990-01-01' } });
const personal = await post('/public/assessment/open', { token: enroll.token });
const pkg = personal.package;
console.log('questions=', pkg.questions.length, 'groups=', pkg.value_groups.length);

// 3) answers: every question = 1
const answers = {};
for (const q of pkg.questions) answers[q.id] = 1;
const selected = pkg.value_groups.map(g => g.slice(0, 5));
const ranked = selected.flat().slice(0, 10);

// 4) submit
const submitted = await post('/public/assessment/submit', { token: enroll.token, revision: personal.revision, active_seconds: 300, answers, value_draft: { selected, ranked } });
console.log('submitted at', submitted.report?.submitted_at ?? 'ok');

// 5) verify both views (with Origin header like a browser)
const get = (path) => fetch(BASE + path, { headers: { Cookie: sessionCookie, Origin: ORIGIN } }).then(j);
const list = await get('/assessment/invites');
const reports = await get('/assessment/invites?view=reports');
console.log('invites view total =', list.total, '| reports view total =', reports.total);
console.log('reports rows:', reports.items.map(r => `${r.name} submitted=${r.submitted_at} kind=${r.participant_kind}`).join(' ; ') || '(empty)');
