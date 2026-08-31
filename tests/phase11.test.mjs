import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = file => fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('public site routes inquiries through persistent first-party intake before backup delivery', async () => {
  const site = await read('site.js');
  const firstParty = site.indexOf('/functions/v1/lead-intake');
  const backup = site.indexOf('notifyFallback');
  assert.ok(firstParty >= 0, 'missing first-party lead endpoint');
  assert.ok(backup >= 0, 'missing provider fallback');
  assert.ok(site.includes('persisted') || site.includes('securely received'));
});

test('website audit explicitly rejects fabricated metrics and uses saved audit service', async () => {
  const html = await read('website-audit.html');
  const js = await read('audit-page.js');
  assert.match(html, /No fake scores/i);
  assert.match(html, /does not invent rankings, traffic, conversions, Lighthouse scores, Core Web Vitals/i);
  assert.ok(js.includes('/functions/v1/audit-run'));
  assert.ok(js.includes('comparisonPanel'));
});

test('owner dashboard is noindex and connected to authenticated operational records', async () => {
  const html = await read('dashboard.html');
  const js = await read('dashboard.js');
  assert.match(html, /noindex,nofollow,noarchive/i);
  assert.ok(js.includes('signInWithOtp'));
  for (const table of ['leads','projects','audits','activity','analytics_events','content_items']) {
    assert.ok(js.includes(`'${table}'`), `dashboard missing ${table} data access`);
  }
});

test('client assets never contain privileged Supabase credentials', async () => {
  for (const file of ['site.js','audit-page.js','dashboard.js','website-audit.html','dashboard.html']) {
    const source = await read(file);
    assert.equal(source.includes('sb_secret_'), false, `${file} contains a secret-key marker`);
    assert.equal(source.includes('SUPABASE_SERVICE_ROLE_KEY'), false, `${file} contains service-role marker`);
  }
});

test('SEO discovery includes the public audit but excludes owner dashboard', async () => {
  const robots = await read('robots.txt');
  const sitemap = await read('sitemap.xml');
  assert.match(robots, /Disallow:\s*\/dashboard\.html/i);
  assert.match(sitemap, /website-audit\.html/);
  assert.equal(sitemap.includes('dashboard.html'), false);
});

test('Phase 11 styles include focus and reduced-motion support', async () => {
  const css = await read('phase11.css');
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /p11-mobile-action/);
});
