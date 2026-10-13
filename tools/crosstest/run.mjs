/**
 * Cross-language crypto regression (R0): proves the Java rewrite can decrypt
 * legacy AES-256-GCM ciphertexts and verify legacy scrypt password hashes
 * byte-exactly, and that both directions reject tenant-AAD tampering.
 *
 *   node --experimental-strip-types tools/crosstest/run.mjs [--jdk <jdk-bin-dir>]
 *
 * Steps: fresh vectors from the project's own TS crypto module -> javac/java
 * (JCA AES-GCM + Bouncy Castle scrypt, N=16384 r=8 p=1, salt = hex-string
 * UTF-8 bytes exactly as Node uses it) -> reverse direction back through TS.
 * Bouncy Castle jar is downloaded on first run (or reused); it is not committed.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
process.chdir(resolve(here, '../..'));
const JDK = process.argv.includes('--jdk') ? process.argv[process.argv.indexOf('--jdk') + 1] : '';
const javac = JDK ? join(JDK, 'javac') : 'javac', java = JDK ? join(JDK, 'java') : 'java';
const JAR = join(here, 'bcprov.jar');
const BC_URLS = [
  'https://repo1.maven.org/maven2/org/bouncycastle/bcprov-jdk18on/1.78.1/bcprov-jdk18on-1.78.1.jar',
  'https://maven.aliyun.com/repository/public/org/bouncycastle/bcprov-jdk18on/1.78.1/bcprov-jdk18on-1.78.1.jar',
];

if (!existsSync(JAR)) {
  process.env.HTTPS_PROXY = process.env.HTTP_PROXY = process.env.https_proxy = process.env.http_proxy = '';
  for (const url of BC_URLS) {
    const r = spawnSync('curl', ['-sL', '--noproxy', '*', '--max-time', '120', '-o', JAR, url], { encoding: 'utf8' });
    if (r.status === 0 && existsSync(JAR) && readFileSync(JAR).length > 1_000_000) break;
    if (existsSync(JAR)) unlinkSync(JAR);
  }
  if (!existsSync(JAR)) { console.error('CROSSTEST_FAILED: cannot download bouncycastle'); process.exit(2); }
}

// 1) fresh vectors from the project's own crypto implementation
const { encryptContact, decryptContact, hashPassword } = await import('@qilun/security/index.ts');
const { randomBytes } = await import('node:crypto');
const key = randomBytes(32), tenant = '995f00ab-0510-4b30-9b7c-19a57a7494ee';
const plaintext = '张三 13800000000 1990-06-15 —— 中文明文跨语言回归 ✅';
const password = 'QiLun#跨语言$crypt2026';
const vectors = {
  key_hex: key.toString('hex'), tenant, plaintext,
  ciphertext: encryptContact(plaintext, key, tenant),
  password, saved_hash: await hashPassword(password),
};
writeFileSync(join(here, 'vectors.json'), JSON.stringify(vectors, null, 2));

// 2) Java side: TS->Java decrypt, Java->TS vector, scrypt verify
const compile = spawnSync(javac, ['-cp', JAR, 'CrossTest.java'], { cwd: here, encoding: 'utf8' });
if (compile.status !== 0) { console.error('CROSSTEST_FAILED javac:', compile.stderr); process.exit(2); }
const run = spawnSync(java, ['-cp', `${here}${join(';')}${here}/bcprov.jar`.replace(/\\/g, '/'), 'CrossTest', 'vectors.json'], { cwd: here, encoding: 'utf8' });
const out = run.stdout || '';
console.log(out.trim());
if (run.status !== 0 || !out.includes('TS->Java AES-GCM decrypt:   PASS') || !out.includes('scrypt(SHA256 hex compare): PASS')) {
  console.error('CROSSTEST_FAILED java stage', run.stderr); process.exit(1);
}

// 3) reverse direction: TS decrypts the Java-produced ciphertext, AAD must reject
const javaCiphertext = out.split('Java->TS direction vector:')[1]?.trim().split(/\s+/)[0];
const decrypted = decryptContact(javaCiphertext, key, tenant);
console.log('Java->TS AES-GCM decrypt:', decrypted === plaintext ? 'PASS' : 'FAIL');
let tampered = false;
try { decryptContact(javaCiphertext, key, '00000000-0000-0000-0000-000000000000'); } catch { tampered = true; }
console.log('wrong-tenant AAD rejected:', tampered ? 'PASS' : 'FAIL');
const ok = decrypted === plaintext && tampered;
console.log(ok ? 'CROSSTEST_OK' : 'CROSSTEST_FAILED');
process.exit(ok ? 0 : 1);
