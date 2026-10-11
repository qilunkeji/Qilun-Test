/**
 * Weekly cutover rehearsal (R0 discipline, runs until R6):
 *   snapshot -> full migrate --recreate -> reconciliation, appends the result
 *   to tools/rehearsal/log.md (committed provenance chain).
 *
 *   node --experimental-strip-types tools/rehearsal/weekly.mjs \
 *     --source <local-pglite-snapshot-dir>            # or --ssh --key <id> --known-hosts <file>
 *     --target postgres://... [--no-log]
 *
 * SSH mode streams the production data dir via tar over ssh (zero server writes)
 * into a temp dir, exactly like the original rehearsal methodology.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const ROOT = resolve(here, '../..');
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };

let source = arg('source'), cleanup = null;
if (process.argv.includes('--ssh')) {
  const key = arg('key'), kh = arg('known-hosts');
  if (!key || !kh) { console.error('weekly rehearsal: --ssh requires --key and --known-hosts'); process.exit(2); }
  const dir = mkdtempSync(join(tmpdir(), 'qilun-weekly-'));
  const pull = spawnSync('bash', ['-c',
    `ssh -i "${key}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="${kh}" -o BatchMode=yes root@124.223.159.190 "cd /opt/qilun-talent/shared && tar cf - database" | tar xf - -C "${dir}"`],
    { cwd: dir, encoding: 'utf8' });
  if (pull.status !== 0) { console.error('snapshot pull failed:', pull.stderr); process.exit(2); }
  source = join(dir, 'database');
  cleanup = dir;
}
const target = arg('target') ?? 'postgres://qilun@127.0.0.1:54329/qilun_migration_drill';
if (!source) { console.error('weekly rehearsal: --source <dir> or --ssh required'); process.exit(2); }

const run = (file, extra = []) => {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', file, '--source', source, '--target', target, ...extra], { cwd: ROOT, encoding: 'utf8' });
  return { status: r.status, tail: (r.stdout + r.stderr).trim().split('\n').filter(Boolean).slice(-2).join(' | ') };
};
const started = Date.now();
const migrate = run('scripts/migrate-pglite-to-pg.ts', ['--recreate']);
const verify = migrate.status === 0 ? run('scripts/verify-pg-migration.ts') : { status: 1, tail: 'migrate failed' };
const seconds = ((Date.now() - started) / 1000).toFixed(1);

const line = `${new Date().toISOString()} migrate=${migrate.status === 0 ? 'OK' : 'FAIL'} verify=${verify.status === 0 ? 'VERIFY_OK' : 'FAILED'} ${seconds}s :: ${verify.tail}`;
console.log(line);
if (!process.argv.includes('--no-log')) appendFileSync(join(here, 'log.md'), line + '\n');
if (cleanup) rmSync(cleanup, { recursive: true, force: true });
process.exit(migrate.status === 0 && verify.status === 0 ? 0 : 1);
