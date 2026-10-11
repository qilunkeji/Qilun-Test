/**
 * Post-migration reconciliation: PGlite source vs PostgreSQL target.
 *   node --experimental-strip-types scripts/verify-pg-migration.ts \
 *     --source <path-to-pglite-data-dir> --target <postgres-url>
 * Checks, per public table:
 *   1. column list identical (names in ordinal order)
 *   2. row count identical
 *   3. full-table content checksum identical:
 *      md5(string_agg(md5(to_jsonb(t)::text), '' ORDER BY <primary key>))
 *      (jsonb key order is deterministic in PostgreSQL, both engines are PG16)
 *   4. schema_migrations (version, checksum) pairs identical
 * Also prints business-level spot checks for human review.
 * Exit code 0 only when every check passes.
 */
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const sourceDir = flag('source'), targetUrl = flag('target');
if (!sourceDir || !targetUrl) { console.error('usage: verify-pg-migration.ts --source <pglite-dir> --target <postgres-url>'); process.exit(2); }

const source = new PGlite(sourceDir);
await source.waitReady;
const target = new pg.Pool({ connectionString: targetUrl, max: 4 });
// to_jsonb(timestamptz) renders in the session TimeZone; pin both engines to UTC so
// checksums compare stored instants, not server-local renderings.
await source.exec("SET TimeZone='UTC'");
await target.query("SET TimeZone='UTC'");
type Row = Record<string, unknown>;
const q = async <T extends Row = Row>(pool: 'src' | 'tgt', sql: string, params?: unknown[]): Promise<T[]> => {
  if (pool === 'src') return (await source.query<T>(sql, params as never[])).rows;
  return (await target.query({ text: sql, values: params as never[] })).rows;
};

const tables = (await q<{ tablename: string }>('src', `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).map(r => r.tablename);
let failures = 0;
const fail = (msg: string) => { failures++; console.log(`FAIL ${msg}`); };

for (const table of tables) {
  const colsOf = (await q<{ column_name: string }>('src', `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table])).map(r => r.column_name);
  const tgtCols = (await q<{ column_name: string }>('tgt', `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table])).map(r => r.column_name);
  if (JSON.stringify(colsOf) !== JSON.stringify(tgtCols)) { fail(`${table}: column lists differ`); continue; }
  const pk = (await q<{ cols: string }>('src', `
    SELECT string_agg(a.attname, ',' ORDER BY x.ord) AS cols FROM pg_index i
    JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS x(attnum, ord)
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=x.attnum
    WHERE n.nspname='public' AND c.relname=$1 AND i.indisprimary`, [table]))[0]?.cols;
  const orderBy = pk ? pk.split(',').map(c => `"${c}"`).join(',') : colsOf.map(c => `"${c}"`).join(',');
  const srcCount = (await q<{ n: number }>('src', `SELECT count(*)::int AS n FROM ${table}`))[0].n;
  const tgtCount = (await q<{ n: number }>('tgt', `SELECT count(*)::int AS n FROM ${table}`))[0].n;
  if (srcCount !== tgtCount) { fail(`${table}: row count src=${srcCount} tgt=${tgtCount}`); continue; }
  if (srcCount === 0) { console.log(`OK   ${table.padEnd(32)} empty`); continue; }
  // schema_migrations.applied_at records when each file ran on that system, so it
  // legitimately differs; its integrity lock is the checksum column, compared separately.
  const json = table === 'schema_migrations' ? `(to_jsonb(t) - 'applied_at')` : 'to_jsonb(t)';
  const checksumSql = `SELECT md5(COALESCE(string_agg(md5(${json}::text), '' ORDER BY ${orderBy}), '')) AS h FROM ${table} t`;
  const srcHash = (await q<{ h: string }>('src', checksumSql))[0].h;
  const tgtHash = (await q<{ h: string }>('tgt', checksumSql))[0].h;
  if (srcHash !== tgtHash) fail(`${table}: checksum src=${srcHash} tgt=${tgtHash}`);
  else console.log(`OK   ${table.padEnd(32)} rows=${srcCount} hash=${srcHash.slice(0, 12)}`);
}

const srcMig = JSON.stringify(await q('src', `SELECT version, checksum FROM schema_migrations ORDER BY version`));
const tgtMig = JSON.stringify(await q('tgt', `SELECT version, checksum FROM schema_migrations ORDER BY version`));
if (srcMig !== tgtMig) fail('schema_migrations differ'); else console.log('OK   schema_migrations identical');

console.log('--- business spot checks (source | target) ---');
const spot: Array<[string, string]> = [
  ['tenants', 'SELECT count(*)::int AS v FROM tenants'],
  ['assessment_invites submitted', "SELECT count(*)::int AS v FROM assessment_invites WHERE submitted_at IS NOT NULL"],
  ['audit_events latest', 'SELECT max(created_at)::text AS v FROM audit_events'],
  ['agent_tasks open', "SELECT count(*)::int AS v FROM agent_tasks WHERE state IN ('queued','claimed')"],
];
for (const [label, sql] of spot) {
  const s = (await q('src', sql))[0].v, t = (await q('tgt', sql))[0].v;
  console.log(`${(label + ':').padEnd(30)} ${String(s).padEnd(24)} | ${t}`);
  if (String(s) !== String(t)) fail(`spot check ${label}`);
}

await target.end();
await source.close();
if (failures) { console.log(`VERIFY_FAILED failures=${failures}`); process.exit(1); }
console.log('VERIFY_OK');
