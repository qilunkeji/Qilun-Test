import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../qilun_talent_system_v1/evidence/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
for (const entry of manifest.files) {
  const bytes = await readFile(new URL(entry.filename, root));
  if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error(`Evidence mismatch: ${entry.filename}`);
  console.log(`PASS SHA-256 ${entry.filename}`);
}
for (const path of ['D:/codex/ai/project-ghrczx.com', '/mnt/d/codex/ai/project-ghrczx.com']) {
  try { await access(path); console.log(`FOUND ${path} (requires separate inspection)`); }
  catch { console.log(`NOT_FOUND ${path}: original JS/JSON not assumed available`); }
}
