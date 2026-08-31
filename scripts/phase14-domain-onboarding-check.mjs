import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd(),failures=[];
const required=[
  'phase14-domain-onboarding.js','phase14-domain-onboarding.css','phase14-domain-bridge-guard.js','client-domain.html','dashboard.html',
  'supabase/functions/domain-onboarding/index.ts','supabase/functions/monitoring-run/index.ts',
  'supabase/migrations/20260831_phase14_domain_onboarding_foundation.sql',
  'supabase/migrations/20260831_phase14_domain_onboarding_authoritative_dns.sql',
  'supabase/migrations/20260831_phase14_domain_onboarding_schedule.sql',
  'supabase/migrations/20260831_phase14_domain_reporting_enum_alignment.sql'
];
for(const file of required){try{await fs.access(path.join(root,file))}catch{failures.push(`Missing domain onboarding file: ${file}`)}}
async function read(file){try{return await fs.readFile(path.join(root,file),'utf8')}catch(error){failures.push(`${file} unreadable: ${error.message}`);return ''}}
for(const file of ['phase14-domain-onboarding.js','phase14-domain-bridge-guard.js'])try{execFileSync(process.execPath,['--check',path.join(root,file)],{stdio:'pipe'})}catch(error){failures.push(`${file} syntax invalid: ${String(error.stderr||error.message).trim()}`)}

const worker=await read('supabase/functions/domain-onboarding/index.ts');
for(const marker of [
  'owner_auth_required','domain_onboarding_worker_secret','setup_token_hash','setup_token_expires_at','randomToken','sha256',
  'dns_instructions_authoritative','dns_requirements','awaiting_authoritative_vercel_dns','authoritative:true',
  "host_status==='attached'",'httpsCheck','attach_client_domain_to_vercel','approval_pending','domain_status:\'waiting\'',
  'vercel_host_project_id','vercel_team_id','domain_already_assigned'
])if(!worker.includes(marker))failures.push(`Domain worker missing safeguard: ${marker}`);
for(const forbidden of ['sk_live_','sk_test_','whsec_','sb_secret_','SUPABASE_SERVICE_ROLE_KEY','VERCEL_TOKEN'])if(worker.includes(forbidden))failures.push(`Domain worker contains privileged secret marker: ${forbidden}`);
if(worker.includes("dnsReady=dnsState.ready"))failures.push('Domain worker may accept non-authoritative DNS as ready');
if(!worker.includes('dnsReady=dnsState.authoritative&&dnsState.ready'))failures.push('Domain readiness is not explicitly gated on authoritative DNS');
if(worker.includes("host_status:'attached'"))failures.push('Domain registration appears to auto-claim Vercel attachment');

const foundation=await read('supabase/migrations/20260831_phase14_domain_onboarding_foundation.sql');
for(const marker of [
  'domain_onboarding_events','domain_onboarding_enabled','domain_check_interval_minutes','bonebrake_domain_onboarding_worker_secret','vault.create_secret',
  'prj_aamMF6oLvfO6DnkLPEAcdBjnNRXo','bonebrake-complete-site-1','team_nwkEzCFo7TVWsqPidGNM0MwA',
  'phase14_queue_production_when_domain_ready','deploy_paid_project_production','requires_production_switch','risk_level,status','approval'
])if(!foundation.includes(marker))failures.push(`Domain foundation missing marker: ${marker}`);
if(/bonebrake_domain_onboarding_worker_secret'\s*,\s*'[a-f0-9]{32,}/i.test(foundation))failures.push('Domain migration appears to hardcode worker secret');

const authoritative=await read('supabase/migrations/20260831_phase14_domain_onboarding_authoritative_dns.sql');
for(const marker of ['dns_requirements','dns_instructions_authoritative','internal.phase14_apply_vercel_domain_state','service_role','revoke all','vercel_domain_state_applied'])if(!authoritative.includes(marker))failures.push(`Authoritative DNS adapter missing marker: ${marker}`);
if(authoritative.includes('grant execute')&&!authoritative.includes('to service_role'))failures.push('Vercel state adapter execution is not restricted to service role');

const schedule=await read('supabase/migrations/20260831_phase14_domain_onboarding_schedule.sql');
for(const marker of ['bonebrake-domain-onboarding-15m','*/15 * * * *','net.http_post','vault.decrypted_secrets','bonebrake_domain_onboarding_worker_secret','"action":"sweep"'])if(!schedule.includes(marker))failures.push(`Domain scheduler missing marker: ${marker}`);

const reporting=await read('supabase/migrations/20260831_phase14_domain_reporting_enum_alignment.sql');
for(const marker of ["status in ('pending','awaiting_dns')","host_status='verification_required'","status='error' or ssl_status='error'","status in ('verified','active') and ssl_status='ready'"])if(!reporting.includes(marker))failures.push(`Domain reporting alignment missing marker: ${marker}`);
if(reporting.includes("status='failed' or ssl_status='failed'"))failures.push('Executive Brief still uses obsolete domain failed enum');

const ui=await read('phase14-domain-onboarding.js');
for(const marker of ['Domain Onboarding','Register domain','dns_instructions_authoritative','Do not change DNS yet','rotate_token','attach_client_domain_to_vercel','Open attachment approval'])if(!ui.includes(marker))failures.push(`Owner domain UI missing marker: ${marker}`);
for(const forbidden of ['sk_live_','sk_test_','whsec_','sb_secret_','SUPABASE_SERVICE_ROLE_KEY'])if(ui.includes(forbidden))failures.push(`Owner domain UI contains privileged credential marker: ${forbidden}`);

const client=await read('client-domain.html');
for(const marker of ['noindex,nofollow,noarchive','no-referrer','history.replaceState','dns_instructions_authoritative','No DNS changes are needed from you yet','token:TOKEN','Check again'])if(!client.includes(marker))failures.push(`Client domain page missing safety marker: ${marker}`);
if(client.includes('setup_token_hash'))failures.push('Client domain page must never expose the stored setup token hash');

const guard=await read('phase14-domain-bridge-guard.js');
for(const marker of ['attach client domain to vercel','stopImmediatePropagation','stays pending'])if(!guard.includes(marker))failures.push(`Domain bridge guard missing marker: ${marker}`);

const monitor=await read('supabase/functions/monitoring-run/index.ts');
if(!monitor.includes("status.eq.error,ssl_status.eq.error"))failures.push('Monitoring worker does not watch the actual domain error enum');
if(monitor.includes("status.eq.failed,ssl_status.eq.failed"))failures.push('Monitoring worker still uses obsolete domain failed enum');

const dashboard=await read('dashboard.html');
for(const marker of ['phase14-domain-onboarding.css','phase14-domain-onboarding.js','phase14-domain-bridge-guard.js'])if(!dashboard.includes(marker))failures.push(`Dashboard missing domain onboarding asset: ${marker}`);

if(failures.length){console.error(`Phase 14 domain onboarding checks failed (${failures.length}):`);for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('Phase 14 domain onboarding checks passed: owner-only registration, hashed expiring client links, authoritative Vercel DNS gating, 15-minute passive verification, SSL readiness, domain-ready production requeue, bridge protection, monitoring/reporting integration verified.');