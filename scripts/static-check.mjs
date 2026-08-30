import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const required = [
  'index.html',
  'privacy.html',
  'terms.html',
  'vercel.json',
  'api/health.js',
  'api/audit.js',
  'api/lead.js',
  '.well-known/security.txt',
  'OPERATIONS.md'
];

const failures = [];
for (const file of required) {
  try { await fs.access(path.join(root, file)); }
  catch { failures.push(`Missing required production file: ${file}`); }
}

let vercel = {};
try {
  vercel = JSON.parse(await fs.readFile(path.join(root, 'vercel.json'), 'utf8'));
} catch (error) {
  failures.push(`vercel.json is not valid JSON: ${error.message}`);
}

const globalHeaders = vercel?.headers?.find?.(entry => entry.source === '/(.*)')?.headers || [];
const headerNames = new Set(globalHeaders.map(item => String(item.key || '').toLowerCase()));
for (const header of ['x-content-type-options','x-frame-options','referrer-policy','permissions-policy','strict-transport-security']) {
  if (!headerNames.has(header)) failures.push(`Missing security header in vercel.json: ${header}`);
}

try {
  const index = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  const mustContain = [
    'Bonebrake Web Design',
    '331-203-3717',
    'BonebrakeWebsiteDesign@gmail.com'
  ];
  for (const text of mustContain) if (!index.includes(text)) failures.push(`index.html missing required business identity: ${text}`);
  if (!/<meta\s+name=["']viewport["']/i.test(index)) failures.push('index.html missing viewport metadata');
  if (!/<title>[^<]+<\/title>/i.test(index)) failures.push('index.html missing a document title');
} catch {}

try {
  const security = await fs.readFile(path.join(root, '.well-known/security.txt'), 'utf8');
  if (!/^Contact:\s*mailto:/mi.test(security)) failures.push('security.txt missing mailto contact');
  if (!/^Expires:/mi.test(security)) failures.push('security.txt missing expiry');
} catch {}

if (failures.length) {
  console.error(`Phase 8 predeploy static checks failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Phase 8 static checks passed (${required.length} required files + security baseline).`);
