import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const req=['autopilot-control-center.html','autopilot-control-center.css','autopilot-control-center.js','autopilot-control-center-safety.js','sales-previews/outreach-sample-archive.js','supabase/migrations/20260901_phase14_autopilot_control_center.sql'];
for(const f of req)if(!fs.existsSync(f))throw new Error(`missing ${f}`);
const html=fs.readFileSync('autopilot-control-center.html','utf8'),js=fs.readFileSync('autopilot-control-center.js','utf8'),safety=fs.readFileSync('autopilot-control-center-safety.js','utf8'),css=fs.readFileSync('autopilot-control-center.css','utf8'),sql=fs.readFileSync('supabase/migrations/20260901_phase14_autopilot_control_center.sql','utf8'),archive=fs.readFileSync('sales-previews/outreach-sample-archive.js','utf8');
for(const token of ['AUTOPILOT STATUS','HOURLY AUTOMATION','FULL WEBSITE PREVIEW CENTER','COMMAND CHATGPT','CEO MODE'])if(!(html+js).includes(token))throw new Error(`control center missing ${token}`);
for(const token of ['prospect_candidates','autopilot_control_runs','prospect_design_versions','prospect_outreach_events','control_center_commands','external_effects_locked'])if(!js.includes(token))throw new Error(`control center JS missing ${token}`);
for(const token of ['Scoped scheduler vs. backend switches','external_effects_locked','backend Outreach switch remains OFF','Production Deployment'])if(!safety.includes(token))throw new Error(`control center safety overlay missing ${token}`);
for(const token of ['autopilot_control_runs','prospect_design_versions','prospect_outreach_events','control_center_commands','enable row level security','revoke all'])if(!sql.toLowerCase().includes(token.toLowerCase()))throw new Error(`control center migration missing ${token}`);
if(!css.includes('env(safe-area-inset-bottom)'))throw new Error('mobile safe-area handling missing');
if(!archive.includes('embedded:atoz-outreach-v1'))throw new Error('outreach sample archive missing');
if(/sb_secret_|SUPABASE_SERVICE_ROLE_KEY|service_role|sk_live_|ghp_/i.test(html+js+safety+css+archive))throw new Error('privileged credential marker found in client assets');
if(!js.includes("window.open('https://chatgpt.com/'"))throw new Error('ChatGPT handoff missing');
if(!js.includes('preview_path')||!js.includes('data-device'))throw new Error('interactive website preview controls missing');
for(const file of ['autopilot-control-center.js','autopilot-control-center-safety.js','sales-previews/outreach-sample-archive.js']){const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(syntax.status!==0)throw new Error(`${file} syntax failed: ${syntax.stderr}`)}
console.log('Phase 14 Autopilot Control Center checks passed');
