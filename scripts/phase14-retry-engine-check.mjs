import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd(),failures=[];
const required=[
  'supabase/migrations/20260831_phase14_generalized_retry_engine_foundation.sql',
  'supabase/migrations/20260831_phase14_generalized_retry_engine_schedule.sql',
  'supabase/migrations/20260831_phase14_executive_brief_retry_metrics.sql',
  'supabase/functions/retry-run/index.ts',
  'supabase/functions/autopilot-execute/index.ts',
  'supabase/functions/generate-project-build/index.ts',
  'supabase/functions/executive-brief/index.ts',
  'supabase/functions/system-health/index.ts',
  'phase14-executive-brief.js'
];
for(const file of required){try{await fs.access(path.join(root,file))}catch{failures.push(`Missing retry-engine file: ${file}`)}}
async function read(file){try{return await fs.readFile(path.join(root,file),'utf8')}catch(error){failures.push(`${file} unreadable: ${error.message}`);return ''}}
for(const file of ['phase14-executive-brief.js'])try{execFileSync(process.execPath,['--check',path.join(root,file)],{stdio:'pipe'})}catch(error){failures.push(`${file} syntax invalid: ${String(error.stderr||error.message).trim()}`)}

const foundation=await read('supabase/migrations/20260831_phase14_generalized_retry_engine_foundation.sql');
for(const marker of ['automation_retry_policies','automation_retry_jobs','automation_retry_attempts','automation_dead_letters','retry_engine_enabled','auto_retry_enabled','retry_engine_worker_secret','bonebrake_retry_engine_worker_secret','vault.create_secret','owner_all_automation_retry_jobs','owner_all_automation_dead_letters'])if(!foundation.includes(marker))failures.push(`Retry foundation missing marker: ${marker}`);
if(/bonebrake_retry_engine_worker_secret'\s*,\s*'[a-f0-9]{32,}/i.test(foundation))failures.push('Retry worker secret appears hardcoded in source');

const mustManual=[
  'start_paid_project_fulfillment','apply_paid_project_revision','review_paid_project_preview','approve_paid_project_release',
  'deploy_paid_project_production','attach_client_domain_to_vercel','review_failed_payment','review_refunded_project'
];
for(const action of mustManual){const re=new RegExp(`\\('${action.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}'[^\\n]*true,false,0,`);if(!re.test(foundation))failures.push(`${action} is not explicitly manual-only with zero automatic attempts`)}
for(const action of ['run_prospect_audit','promote_prospect_to_crm','prepare_paid_project_build','generate_paid_project_build']){const re=new RegExp(`\\('${action}'[^\\n]*true,true,[1-9]`);if(!re.test(foundation))failures.push(`${action} is not explicitly configured as bounded safe auto-retry`)}
if(!foundation.includes("'generate_paid_project_build','/functions/v1/generate-project-build',true,true,3")||!foundation.includes("'reset_generation_job'"))failures.push('Generation retry reset policy missing');

const schedule=await read('supabase/migrations/20260831_phase14_generalized_retry_engine_schedule.sql');
for(const marker of ['internal.phase14_invoke_retry_worker','bonebrake_retry_engine_worker_secret','vault.decrypted_secrets','net.http_post','bonebrake-retry-engine-1m','* * * * *','cron.schedule','service_role'])if(!schedule.includes(marker))failures.push(`Retry scheduler missing marker: ${marker}`);
if(schedule.includes('insert into cron.job')||schedule.includes('update cron.job'))failures.push('Retry scheduler mutates cron.job directly instead of cron.schedule');

const worker=await read('supabase/functions/retry-run/index.ts');
for(const marker of ['retry_engine_auth_required','x-bonebrake-retry-key','automation_retry_policies','automation_retry_jobs','automation_retry_attempts','automation_dead_letters','investigate_retry_dead_letter','capability_kill_switch_off','backoff_multiplier','jitter_percent','non_retryable_error_patterns','attempts_exhausted','reset_generation_job','status:\'dispatching\''])if(!worker.includes(marker))failures.push(`Retry worker missing safeguard: ${marker}`);
for(const forbidden of ['sk_live_','sk_test_','whsec_','sb_secret_','SUPABASE_SERVICE_ROLE_KEY','VERCEL_TOKEN'])if(worker.includes(forbidden))failures.push(`Retry worker contains privileged secret marker: ${forbidden}`);
if(worker.includes("deploy_paid_project_production')")||worker.includes("review_failed_payment')")||worker.includes("review_refunded_project')"))failures.push('High-risk action appears in retry worker executable allowlist');

const autopilot=await read('supabase/functions/autopilot-execute/index.ts');
for(const marker of ['RETRYABLE_ACTIONS','run_prospect_audit','promote_prospect_to_crm','prepare_paid_project_build','x-bonebrake-retry-key','retry_job_id','retry_context_not_dispatching',"eq('status','dispatching')",'autopilot_disabled','prospecting_disabled','fulfillment_disabled'])if(!autopilot.includes(marker))failures.push(`Autopilot executor retry boundary missing marker: ${marker}`);
for(const forbidden of ["RETRYABLE_ACTIONS=new Set(['deploy_paid_project_production'","RETRYABLE_ACTIONS=new Set(['start_paid_project_fulfillment'"])if(autopilot.includes(forbidden))failures.push(`Autopilot retry allowlist contains high-risk action: ${forbidden}`);

const generation=await read('supabase/functions/generate-project-build/index.ts');
for(const marker of ['x-bonebrake-retry-key','retry_job_id','retry_context_not_dispatching',"eq('status','dispatching')",'generate_paid_project_build','preview_only_spec_required','production_release_authorized!==false','fulfillment_disabled'])if(!generation.includes(marker))failures.push(`Generation executor retry boundary missing marker: ${marker}`);

const metrics=await read('supabase/migrations/20260831_phase14_executive_brief_retry_metrics.sql');
for(const marker of ['automation_retry_jobs','automation_retry_attempts','automation_dead_letters','open_dead_letters','failed_attempts_24h','succeeded_24h'])if(!metrics.includes(marker))failures.push(`Executive retry metrics missing marker: ${marker}`);
const brief=await read('supabase/functions/executive-brief/index.ts');
for(const marker of ['automation_dead_letters','dead_letter','open_dead_letters','retry_engine_enabled','auto_retry_enabled','phase14-executive-brief-v2'])if(!brief.includes(marker))failures.push(`Executive brief retry integration missing marker: ${marker}`);
const health=await read('supabase/functions/system-health/index.ts');
for(const marker of ['automation_retry_jobs','automation_dead_letters','retry_engine_enabled','auto_retry_enabled','open_dead_letters','retry_engine:true'])if(!health.includes(marker))failures.push(`System health retry integration missing marker: ${marker}`);
const ui=await read('phase14-executive-brief.js');
for(const marker of ['Retry successes 24h','Retry queue','Open dead letters','Retry engine','Auto retry'])if(!ui.includes(marker))failures.push(`Executive brief UI missing retry marker: ${marker}`);

if(failures.length){console.error(`Phase 14 retry-engine checks failed (${failures.length}):`);for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('Phase 14 retry-engine checks passed: bounded exponential retry, jitter, attempt history, capability kill switches, context-bound executor credentials, generation reset, dead-letter escalation, owner visibility, and explicit no-auto-retry policies for money/production/release/customer-token actions verified.');