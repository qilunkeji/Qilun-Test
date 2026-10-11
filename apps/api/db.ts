import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';

/** Driver-agnostic database surface: PGlite-compatible query/exec/transaction/close. */
export interface Database {
  readonly driver: 'pglite' | 'postgresql';
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  /** PGlite-only: binary dump of the embedded data directory (persistence drills). */
  dumpDataDir?(): Promise<Blob | File>;
}

const isPgUrl = (target?: string): target is string => !!target && (target.startsWith('postgres://') || target.startsWith('postgresql://'));
const rows = <T>(p: Promise<unknown>) => p as unknown as Promise<{ rows: T[] }>;

class PgDatabase implements Database {
  readonly driver = 'postgresql' as const;
  private readonly pool: pg.Pool;
  private readonly maintenanceUrl: string;
  private readonly ephemeralName?: string;
  private constructor(pool: pg.Pool, maintenanceUrl: string, ephemeralName?: string) {
    this.pool = pool; this.maintenanceUrl = maintenanceUrl; this.ephemeralName = ephemeralName;
  }
  static async connect(url: string, opts?: { ephemeral?: boolean }) {
    if (!opts?.ephemeral) return new PgDatabase(new pg.Pool({ connectionString: url, max: 10 }), url);
    const name = `qilun_ephemeral_${randomUUID().replace(/-/g, '')}`;
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    try { await admin.query(`CREATE DATABASE ${name}`); } finally { await admin.end(); }
    const targetUrl = new URL(url); targetUrl.pathname = `/${name}`;
    return new PgDatabase(new pg.Pool({ connectionString: targetUrl.toString(), max: 10 }), url, name);
  }
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
    return rows<T>(params && params.length ? this.pool.query({ text: sql, values: params as never[] }) : this.pool.query(sql));
  }
  exec(sql: string): Promise<unknown> {
    // simple-query protocol: multi-statement migration files run as one unit, matching PGlite.exec
    return this.pool.query(sql);
  }
  async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const txClient: Database = {
      driver: this.driver,
      query: <U = Record<string, unknown>>(sql: string, params?: unknown[]) => rows<U>(params && params.length ? client.query({ text: sql, values: params as never[] }) : client.query(sql)),
      exec: sql => client.query(sql),
      transaction: <U>(inner: (tx: Database) => Promise<U>) => inner(txClient),
      close: () => Promise.resolve(),
    };
    try {
      await client.query('BEGIN');
      const result = await fn(txClient);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async close(): Promise<void> {
    await this.pool.end();
    if (this.ephemeralName) {
      const admin = new pg.Client({ connectionString: this.maintenanceUrl });
      await admin.connect();
      try { await admin.query(`DROP DATABASE IF EXISTS ${this.ephemeralName}`); } finally { await admin.end(); }
    }
  }
}

const wrapPglite = (raw: PGlite | Transaction): Database => ({
  driver: 'pglite',
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => rows<T>(params && params.length ? raw.query(sql, params as never[]) : raw.query(sql)),
  exec: sql => raw.exec(sql),
  // PGlite Transaction exposes nested transactions at runtime; the public type does not.
  transaction: <T>(fn: (tx: Database) => Promise<T>) => (raw as unknown as { transaction<T>(cb: (tx: Transaction) => Promise<T>): Promise<T> }).transaction(async inner => fn(wrapPglite(inner))),
  close: () => (raw as PGlite).close(),
  dumpDataDir: () => (raw as PGlite).dumpDataDir(),
});

/**
 * Resolve the runtime database without applying migrations (tests construct intermediate
 * schema versions by replaying migration files manually):
 * - no argument + DATABASE_URL in the environment → throwaway PostgreSQL database per call
 *   (restores PGlite in-memory isolation semantics; dropped on close)
 * - otherwise → embedded PGlite (in-memory when path is undefined)
 */
export async function openUnmigratedDatabase(path?: string): Promise<Database> {
  const envUrl = process.env.DATABASE_URL;
  if (path === undefined && envUrl) return PgDatabase.connect(envUrl, { ephemeral: true });
  const raw = new PGlite(path);
  await raw.waitReady;
  return wrapPglite(raw);
}

/**
 * Resolve the runtime database (migrations always applied before returning):
 * - explicit `postgres://`/`postgresql://` URL  → shared PostgreSQL pool (dev/production)
 * - no argument + DATABASE_URL in the environment → throwaway PostgreSQL database per call
 * - anything else / no configuration → embedded PGlite (unchanged legacy behaviour)
 */
export async function openDatabase(target?: string): Promise<Database> {
  let db: Database;
  if (isPgUrl(target)) db = await PgDatabase.connect(target);
  else if (target === undefined && process.env.DATABASE_URL) db = await openUnmigratedDatabase(target);
  else db = await openUnmigratedDatabase(target);
  await applyMigrations(db);
  return db;
}

const MIGRATIONS = [[1,'001_foundation.sql'],[2,'002_assessments.sql'],[3,'003_ai.sql'],[4,'004_recruiting.sql'],[5,'005_interviews.sql'],[6,'006_reference_h5.sql'],[7,'007_iam_identities.sql'],[8,'008_assessment_ui_progress.sql'],[9,'009_assessment_profile_timing.sql'],[10,'010_agent_tasks.sql'],[11,'011_project_groups_independent_assessments.sql'],[12,'012_public_assessment_entries.sql'],[13,'013_resume_library.sql'],[14,'014_resume_screen_rounds.sql'],[15,'015_shared_assessment_links.sql']] as const;

/** Applies checksum-locked migrations on any driver; applied files are immutable. */
export async function applyMigrations(db: Database) {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const [version, file] of MIGRATIONS) {
    const sql = await readFile(new URL(`../../infra/migrations/${file}`, import.meta.url), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const prior = await db.query<{ checksum: string }>('SELECT checksum FROM schema_migrations WHERE version=$1', [version]);
    if (prior.rows.length && prior.rows[0].checksum !== checksum) throw new Error('Migration checksum mismatch');
    if (!prior.rows.length) await db.transaction(async tx => {
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', [version, checksum]);
    });
  }
}
