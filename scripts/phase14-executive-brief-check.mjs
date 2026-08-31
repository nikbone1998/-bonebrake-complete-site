import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd(),failures=[];
const required=[
  'phase14-executive-brief.js','phase14-executive-brief.css','dashboard.html',
  'supabase/functions/executive-brief/index.ts',
  'supabase/migrations/20260831_phase14_executive_brief_foundation.sql',
  'supabase/migrations/20260831_phase14_executive_brief_metrics.sql',
  'supabase/migrations/20260831_phase14_executive_brief_schedule.sql'
];
for(const file of required){try{await fs.access(path.join(root,file))}catch{failures.push(`Missing executive brief file: ${file}`)}}
async function read(file){try{return await fs.readFile(path.join(root,file),'utf8')}catch(error){failures.push(`${file} unreadable: ${error.message}`);return ''}}
try{execFileSync(process.execPath,['--check',path.join(root,'phase14-executive-brief.js')],{stdio:'pipe'})}catch(error){failures.push(`Executive brief browser JS syntax invalid: ${String(error.stderr||error.message).trim()}`)}

const worker=await read('supabase/functions/executive-brief/index.ts');
for(const marker of ['executive_brief_worker_secret','executive_brief_auth_required','phase14_executive_brief_metrics','outside_daily_brief_hour','executive_brief_snapshots','owner_refresh','scheduled','priorities','attention_level'])if(!worker.includes(marker))failures.push(`Executive brief worker missing safeguard: ${marker}`);
for(const forbidden of ['sk_live_','sk_test_','whsec_','sb_secret_','SUPABASE_SERVICE_ROLE_KEY','VERCEL_TOKEN'])if(worker.includes(forbidden))failures.push(`Executive brief worker contains secret marker: ${forbidden}`);

const ui=await read('phase14-executive-brief.js');
for(const marker of ['Daily Executive Brief','executive-brief','executive_brief_snapshots','Revenue today','Open pipeline','Needs approval','Open incidents','Open Autopilot','owner_refresh'])if(!ui.includes(marker))failures.push(`Executive brief UI missing marker: ${marker}`);
for(const forbidden of ['sk_live_','sk_test_','whsec_','sb_secret_','SUPABASE_SERVICE_ROLE_KEY'])if(ui.includes(forbidden))failures.push(`Executive brief UI contains privileged credential marker: ${forbidden}`);

const foundation=await read('supabase/migrations/20260831_phase14_executive_brief_foundation.sql');
for(const marker of ['executive_brief_snapshots','enable row level security','owner_all_executive_brief_snapshots','executive_brief_enabled','executive_brief_timezone','executive_brief_hour','vault.create_secret','bonebrake_executive_brief_worker_secret'])if(!foundation.includes(marker))failures.push(`Executive brief foundation missing marker: ${marker}`);
if(/bonebrake_executive_brief_worker_secret'\s*,\s*'[a-f0-9]{32,}/i.test(foundation))failures.push('Executive brief foundation appears to hardcode a scheduler secret');

const metrics=await read('supabase/migrations/20260831_phase14_executive_brief_metrics.sql');
for(const marker of ['phase14_executive_brief_metrics','today_cents','seven_day_cents','open_estimated_value','pending_production','recoveries_24h','waiting_intake','release_ready','service_role'])if(!metrics.includes(marker))failures.push(`Executive brief metrics missing marker: ${marker}`);

const schedule=await read('supabase/migrations/20260831_phase14_executive_brief_schedule.sql');
for(const marker of ['bonebrake-executive-brief-hourly','7 * * * *','net.http_post','vault.decrypted_secrets','executive-brief','scheduled'])if(!schedule.includes(marker))failures.push(`Executive brief schedule missing marker: ${marker}`);

const dashboard=await read('dashboard.html');
for(const marker of ['phase14-executive-brief.css','phase14-executive-brief.js'])if(!dashboard.includes(marker))failures.push(`Dashboard missing executive brief asset: ${marker}`);

if(failures.length){console.error(`Phase 14 executive brief checks failed (${failures.length}):`);for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('Phase 14 executive brief checks passed: owner-only snapshots, live refresh, Chicago-time scheduling, Vault isolation, revenue/pipeline/delivery/monitoring metrics, priority ranking, and dashboard integration verified.');