import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const read=file=>fs.readFile(new URL(`../${file}`,import.meta.url),'utf8');
const exists=async file=>{try{await fs.access(new URL(`../${file}`,import.meta.url));return true}catch{return false}};

test('Phase 14 release identity is coherent',async()=>{const pkg=JSON.parse(await read('package.json')),health=await read('api/health.js'),workflow=await read('.github/workflows/phase14-ci.yml');assert.equal(pkg.version,'14.0.0');assert.match(health,/RELEASE = '14\.0\.0'/);assert.match(health,/phase14-six-figure-certification/);assert.match(workflow,/Phase 14 Certification Gate/);assert.match(workflow,/phase14-\*/)});

test('temporary bootstrap and stale release workflows cannot ship',async()=>{assert.equal(await exists('api/phase13-owner-bootstrap.js'),false);assert.equal(await exists('.github/workflows/phase12-ci.yml'),false);assert.equal(await exists('.github/workflows/phase13-ci.yml'),false)});

test('owner authentication remains fixed-owner and non-signup',async()=>{const dashboard=await read('dashboard.js');assert.match(dashboard,/bonebrakewebsitedesign@gmail\.com/i);assert.ok(dashboard.includes('shouldCreateUser:false'));assert.equal(dashboard.includes('shouldCreateUser:true'),false)});

test('private operational surfaces are not discoverable',async()=>{const robots=await read('robots.txt'),sitemap=await read('sitemap.xml');for(const path of ['dashboard.html','proposal.html','audit-report.html']){assert.match(robots,new RegExp(`Disallow:\\s*\\/${path.replace('.','\\.')}`,'i'));assert.equal(sitemap.includes(path),false)}});

test('certification keeps performance budgets on largest custom assets',async()=>{const budgets={'northstar.html':100_000,'phase13.css':20_000,'phase13-dashboard.js':35_000,'proposal.html':20_000,'proposal.js':20_000};for(const [file,max] of Object.entries(budgets)){const stat=await fs.stat(new URL(`../${file}`,import.meta.url));assert.ok(stat.size<max,`${file} exceeds ${max} byte budget (${stat.size})`)}});

test('health exposes commit traceability and certification state',async()=>{const health=await read('api/health.js');assert.ok(health.includes('VERCEL_GIT_COMMIT_SHA'));assert.ok(health.includes('certification'));assert.ok(health.includes('owner_identity_bootstrapped'));assert.ok(health.includes('domain_and_browser_checks_required'))});
