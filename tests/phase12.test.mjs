import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const read=file=>fs.readFile(new URL(`../${file}`,import.meta.url),'utf8');

test('public inquiry remains persistent-first with an explicit backup route',async()=>{const site=await read('site.js');assert.ok(site.includes('/functions/v1/lead-intake'));assert.ok(site.includes('notifyFallback'));assert.match(site,/securely received/i)});

test('Phase 12 public experience includes signature diagnostic and case-study navigation',async()=>{const js=await read('phase12.js'),work=await read('work.html');assert.ok(js.includes('p12-diagnostic'));assert.ok(js.includes('EXISTING')||js.includes('Typical existing site'));for(const f of ['case-aurelia.html','case-northstar.html','case-oak-stone.html','case-westside-auto-lab.html','case-lakeview-dental.html'])assert.ok(work.includes(f),`work index missing ${f}`);assert.match(work,/concept studies/i)});

test('Northstar no longer ships as the multi-megabyte legacy document',async()=>{const stat=await fs.stat(new URL('../northstar.html',import.meta.url));assert.ok(stat.size<100_000,`northstar.html is ${stat.size} bytes`);const html=await read('northstar.html');assert.match(html,/Fictional HVAC concept/i);assert.match(html,/mobile/i)});

test('audit product rejects fabricated precision and supports privacy-safe saved reports',async()=>{const html=await read('website-audit.html'),js=await read('audit-page.js'),report=await read('audit-report.js');assert.match(html,/does not invent traffic, rankings, conversions, Lighthouse scores, Core Web Vitals/i);assert.ok(js.includes('/functions/v1/audit-run'));assert.ok(js.includes('share_token'));assert.ok(report.includes('/functions/v1/audit-report'));for(const marker of ['requested_by','session_id','lead_id'])assert.equal(report.includes(marker),false,`share report client should not depend on private field ${marker}`)});

test('owner dashboard disables arbitrary signup and remains RLS-oriented',async()=>{const html=await read('dashboard.html'),js=await read('dashboard.js');assert.match(html,/noindex,nofollow,noarchive/i);assert.ok(js.includes('shouldCreateUser:false'));assert.equal(js.includes('shouldCreateUser:true'),false);assert.ok(js.toLowerCase().includes('bonebrakewebsitedesign@gmail.com'));for(const table of ['leads','projects','audits','activity','analytics_events','content_items'])assert.ok(js.includes(`'${table}'`),`dashboard missing ${table}`)});

test('client assets contain no privileged Supabase credentials',async()=>{for(const file of ['site.js','phase12.js','audit-page.js','audit-report.js','dashboard.js','website-audit.html','audit-report.html','dashboard.html']){const source=await read(file);assert.equal(source.includes('sb_secret_'),false,`${file} contains secret-key marker`);assert.equal(source.includes('SUPABASE_SERVICE_ROLE_KEY'),false,`${file} contains service-role marker`)}});

test('SEO discovery includes case studies and audit while excluding private owner surfaces',async()=>{const robots=await read('robots.txt'),sitemap=await read('sitemap.xml');assert.match(robots,/Disallow:\s*\/dashboard\.html/i);for(const path of ['work.html','website-audit.html','case-aurelia.html','case-northstar.html','case-oak-stone.html','case-westside-auto-lab.html','case-lakeview-dental.html'])assert.ok(sitemap.includes(path),`sitemap missing ${path}`);assert.equal(sitemap.includes('dashboard.html'),false);assert.equal(sitemap.includes('audit-report.html'),false)});

test('Phase 12 styles retain focus and reduced-motion support',async()=>{const old=await read('phase11.css'),css=await read('phase12.css');assert.match(old,/:focus-visible/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/p12-diagnostic/);assert.match(css,/p12-work-card/)});
