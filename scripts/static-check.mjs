import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const required = [
  'index.html',
  'website-audit.html',
  'dashboard.html',
  'phase11.css',
  'site.js',
  'audit-page.js',
  'dashboard.js',
  'privacy.html',
  'terms.html',
  'robots.txt',
  'sitemap.xml',
  'vercel.json',
  'api/health.js',
  'api/audit.js',
  'api/lead.js',
  '.github/workflows/phase11-ci.yml',
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
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  if (pkg.version !== '11.0.0') failures.push(`package.json release must be 11.0.0, found ${pkg.version || 'missing'}`);
} catch (error) {
  failures.push(`package.json is invalid: ${error.message}`);
}

try {
  const index = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  for (const text of ['Bonebrake Web Design','331-203-3717','BonebrakeWebsiteDesign@gmail.com']) {
    if (!index.includes(text)) failures.push(`index.html missing required business identity: ${text}`);
  }
  if (!/<meta\s+name=["']viewport["']/i.test(index)) failures.push('index.html missing viewport metadata');
  if (!/<title>[^<]+<\/title>/i.test(index)) failures.push('index.html missing a document title');
} catch {}

try {
  const site = await fs.readFile(path.join(root, 'site.js'), 'utf8');
  if (!site.includes('/functions/v1/lead-intake')) failures.push('site.js is not wired to first-party persistent lead intake');
  if (!site.includes('form.action')) failures.push('site.js is missing the emergency form provider fallback');
  if (!site.includes('/functions/v1/analytics-track')) failures.push('site.js is not wired to first-party analytics');
} catch {}

try {
  const health = await fs.readFile(path.join(root, 'api/health.js'), 'utf8');
  if (!health.includes("const RELEASE = '11.0.0'")) failures.push('health endpoint does not identify release 11.0.0');
  if (!health.includes('/functions/v1/system-health')) failures.push('health endpoint does not verify the persistent data plane');
  if (/pre-phase8|phase8_complete|frontend_sync_pending/.test(health)) failures.push('health endpoint contains stale Phase 8 release state');
} catch {}

try {
  const workflow = await fs.readFile(path.join(root, '.github/workflows/phase11-ci.yml'), 'utf8');
  if (!/Phase 11 Predeploy/.test(workflow)) failures.push('CI workflow does not identify the Phase 11 release gate');
  if (!/phase11-\*/.test(workflow)) failures.push('CI workflow does not run on Phase 11 branches');
} catch {}

try {
  const dashboard = await fs.readFile(path.join(root, 'dashboard.js'), 'utf8');
  if (!dashboard.toLowerCase().includes('bonebrakewebsitedesign@gmail.com')) failures.push('dashboard owner authorization target is missing');
  if (dashboard.includes('sb_secret_') || dashboard.includes('service_role')) failures.push('dashboard client contains a privileged Supabase key reference');
} catch {}

try {
  const files = ['site.js','audit-page.js','dashboard.js','website-audit.html','dashboard.html'];
  for (const file of files) {
    const source = await fs.readFile(path.join(root, file), 'utf8');
    if (source.includes('sb_secret_') || source.includes('SUPABASE_SERVICE_ROLE_KEY')) failures.push(`${file} contains a privileged credential marker`);
  }
} catch {}

try {
  const security = await fs.readFile(path.join(root, '.well-known/security.txt'), 'utf8');
  if (!/^Contact:\s*mailto:/mi.test(security)) failures.push('security.txt missing mailto contact');
  if (!/^Expires:/mi.test(security)) failures.push('security.txt missing expiry');
} catch {}

if (failures.length) {
  console.error(`Phase 11 predeploy static checks failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Phase 11 static checks passed (${required.length} required files + release, data-plane, and security checks).`);
