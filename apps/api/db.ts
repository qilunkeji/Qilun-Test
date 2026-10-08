import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export type Database = PGlite;
export async function openDatabase(path?: string) {
  const db = new PGlite(path);
  await db.waitReady;
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const [version,file] of [[1,'001_foundation.sql'],[2,'002_assessments.sql'],[3,'003_ai.sql'],[4,'004_recruiting.sql'],[5,'005_interviews.sql'],[6,'006_reference_h5.sql'],[7,'007_iam_identities.sql'],[8,'008_assessment_ui_progress.sql'],[9,'009_assessment_profile_timing.sql'],[10,'010_agent_tasks.sql'],[11,'011_project_groups_independent_assessments.sql']] as const) {
  const sql = await readFile(new URL(`../../infra/migrations/${file}`, import.meta.url), 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  const prior = await db.query<{checksum:string}>('SELECT checksum FROM schema_migrations WHERE version=$1',[version]);
  if (prior.rows.length && prior.rows[0].checksum !== checksum) throw new Error('Migration checksum mismatch');
  if (!prior.rows.length) await db.transaction(async tx => {
    await tx.exec(sql);
    await tx.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', [version,checksum]);
  });
  }
  return db;
}
