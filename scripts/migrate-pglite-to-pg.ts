/**
 * One-shot data migration: embedded PGlite data directory → PostgreSQL.
 * Rehearsal tool for the enterprise-architecture cutover; run with:
 *   node --experimental-strip-types scripts/migrate-pglite-to-pg.ts \
 *     --source <path-to-pglite-data-dir> --target <postgres-url> [--recreate]
 * Behaviour:
 *   - source is never written (read-only queries only)
 *   - with --recreate the target database is dropped and recreated first
 *   - schema on target comes exclusively from infra/migrations (checksum-locked),
 *     then every public table except schema_migrations is copied verbatim
 *   - schema_migrations is compared, not copied; a mismatch aborts
 */
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { applyMigrations, type Database } from '../apps/api/db.ts';

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const sourceDir = flag('source'), targetUrl = flag('target'), recreate = args.includes('--recreate');
if (!sourceDir || !targetUrl) { console.error('usage: migrate-pglite-to-pg.ts --source <pglite-dir> --target <postgres-url> [--recreate]'); process.exit(2); }

const adminUrl = new URL(targetUrl); const dbName = adminUrl.pathname.replace(/^\//, '');
if (!dbName) { console.error('target URL must include a database name'); process.exit(2); }
adminUrl.pathname = '/postgres';

const source = new PGlite(sourceDir);
await source.waitReady;
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
if (recreate) {
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${dbName}`);
}
await admin.end();

const targetUrlDb = new URL(targetUrl); targetUrlDb.pathname = `/${dbName}`;
const target = new pg.Pool({ connectionString: targetUrlDb.toString(), max: 4 });
const asDatabase = (queryFn: Database['query'], execFn: Database['exec'], txnClient?: pg.PoolClient): Database => ({
  driver: 'postgresql',
  query: queryFn,
  exec: execFn,
  transaction: async fn => {
    const client = txnClient ?? await target.connect();
    const wrapped = asDatabase(
      (sql, params) => client.query({ text: sql, values: params as never[] }) as never,
      sql => client.query(sql) as never,
      client,
    );
    if (txnClient) return fn(wrapped);
    try {
      await client.query('BEGIN');
      const out = await fn(wrapped);
      await client.query('COMMIT');
      return out;
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  },
  close: () => Promise.resolve(),
});
const poolDatabase = asDatabase(
  (sql, params) => target.query({ text: sql, values: params as never[] }) as never,
  sql => target.query(sql) as never,
);
await applyMigrations(poolDatabase);

const allTables = (await source.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename`)).rows.map(r => r.tablename);
// copy in foreign-key dependency order (referenced tables first); self-references ignored
const fk = (await source.query<{ src: string; ref: string }>(`
  SELECT c.relname AS src, r.relname AS ref FROM pg_constraint k
  JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_class r ON r.oid=k.confrelid
  WHERE k.contype='f' AND n.nspname='public'`)).rows;
const deps = new Map<string, Set<string>>(allTables.map(t => [t, new Set(fk.filter(e => e.src === t && e.ref !== t && allTables.includes(e.ref)).map(e => e.ref))]));
const tables: string[] = [];
while (tables.length < allTables.length) {
  const ready = allTables.filter(t => !tables.includes(t) && [...deps.get(t)!].every(d => tables.includes(d)));
  if (!ready.length) throw new Error(`circular or unresolvable FK graph among: ${allTables.filter(t => !tables.includes(t)).join(', ')}`);
  tables.push(...ready);
}
let totalRows = 0;
for (const table of tables) {
  const cols = (await source.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table])).rows.map(r => r.column_name);
  const srcCount = (await source.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
  if (srcCount === 0) { console.log(`${table.padEnd(32)} 0 rows (skip)`); continue; }
  const payload = (await source.query<{ data: unknown }>(`SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) AS data FROM ${table} t`)).rows[0].data;
  const colList = cols.map(c => `"${c}"`).join(',');
  const inserted = await target.query(`WITH rows AS (SELECT * FROM jsonb_populate_recordset(null::${table}, $1::jsonb)) INSERT INTO ${table} (${colList}) SELECT ${colList} FROM rows RETURNING 1`, [JSON.stringify(payload)]);
  if (inserted.rowCount !== srcCount) throw new Error(`row count mismatch on ${table}: source ${srcCount}, inserted ${inserted.rowCount}`);
  totalRows += srcCount;
  console.log(`${table.padEnd(32)} ${srcCount} rows copied`);
}

const srcMig = (await source.query(`SELECT version, checksum FROM schema_migrations ORDER BY version`)).rows;
const tgtMig = (await target.query(`SELECT version, checksum FROM schema_migrations ORDER BY version`)).rows;
if (JSON.stringify(srcMig) !== JSON.stringify(tgtMig)) throw new Error(`schema_migrations mismatch: source ${JSON.stringify(srcMig)} target ${JSON.stringify(tgtMig)}`);
console.log(`schema_migrations verified: ${tgtMig.length} entries identical`);
console.log(`MIGRATION_OK tables=${tables.length} rows=${totalRows} run=${randomUUID()}`);
await target.end();
await source.close();
