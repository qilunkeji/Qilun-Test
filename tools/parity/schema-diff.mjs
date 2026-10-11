/**
 * Schema parity gate (R1): compares two PostgreSQL databases structurally —
 * tables, columns (name/type/ordinal/nullability/default), primary keys,
 * foreign keys, triggers, and the schema_migrations checksum lock rows.
 *   node tools/parity/schema-diff.mjs --a <url1> --b <url2>
 * Exit 0 only on full structural identity.
 */
import pg from 'pg';

const arg = n => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const a = arg('a'), b = arg('b');
if (!a || !b) { console.error('usage: schema-diff.mjs --a <jdbc-style-pg-url> --b <url>'); process.exit(2); }
function toPg(u) {
  if (!u.startsWith('jdbc:postgresql://')) return u;
  let rest = u.slice('jdbc:postgresql://'.length);
  const qIndex = rest.indexOf('?');
  const params = new URLSearchParams(qIndex >= 0 ? rest.slice(qIndex + 1) : '');
  const hostPart = qIndex >= 0 ? rest.slice(0, qIndex) : rest;
  const slash = hostPart.indexOf('/');
  const host = hostPart.slice(0, slash), db = hostPart.slice(slash + 1);
  const user = params.get('user');
  return `postgres://${user ? user + '@' : ''}${host}/${db}`;
}

const pools = { a: new pg.Pool({ connectionString: toPg(a), max: 2 }), b: new pg.Pool({ connectionString: toPg(b), max: 2 }) };
const q = async (side, sql) => (await pools[side].query(sql)).rows;

const facets = {
  tables: `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
  columns: `SELECT table_name,column_name,ordinal_position,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`,
  primary_keys: `SELECT c.relname AS tbl, string_agg(a.attname, ',' ORDER BY x.ord) AS pk FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS x(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=x.attnum WHERE n.nspname='public' AND i.indisprimary GROUP BY c.relname ORDER BY c.relname`,
  foreign_keys: `SELECT c.relname AS tbl, r.relname AS ref, string_agg(col.attname, ',' ORDER BY ord) AS cols FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class r ON r.oid=k.confrelid CROSS JOIN LATERAL unnest(k.conkey) WITH ORDINALITY AS ck(attnum,ord) JOIN pg_attribute col ON col.attrelid=c.oid AND col.attnum=ck.attnum WHERE k.contype='f' AND n.nspname='public' GROUP BY c.relname,r.relname ORDER BY c.relname,r.relname`,
  triggers: `SELECT c.relname AS tbl, t.tgname, pg_get_triggerdef(t.oid) AS def FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
  migration_lock: `SELECT version,checksum FROM schema_migrations ORDER BY version`,
};

let diffs = 0;
for (const [facet, sql] of Object.entries(facets)) {
  const ra = JSON.stringify(await q('a', sql)), rb = JSON.stringify(await q('b', sql));
  if (ra === rb) console.log(`OK   ${facet}`);
  else { diffs++; console.log(`DIFF ${facet}\n  A: ${ra.slice(0, 500)}\n  B: ${rb.slice(0, 500)}`); }
}
await pools.a.end(); await pools.b.end();
console.log(diffs ? `SCHEMA_PARITY_FAILED (${diffs} facets)` : 'SCHEMA_PARITY_OK');
process.exit(diffs ? 1 : 0);
