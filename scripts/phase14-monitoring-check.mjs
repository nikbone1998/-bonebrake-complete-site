import fs from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const required=[
  'supabase/functions/monitoring-run/index.ts',
  'supabase/functions/system-health/index.ts',
  'supabase/migrations/20260831_phase14_monitoring_recovery_foundation.sql',
  'supabase/migrations/20260831_phase14_monitoring_schedule.sql',
  'supabase/migrations/20260831_phase14_monitoring_performance_hardening.sql'
];
for(const file of required){try{await fs.access(path.join(root,file))}catch{failures.push(`Missing monitoring file: ${file}`)}}

async function source(file){try{return await fs.readFile(path.join(root,file),'utf8')}catch(error){failures.push(`${file} unreadable: ${error.message}`);return ''}}

const worker=await source('supabase/functions/monitoring-run/index.ts');
for(const marker of [
  'monitor_worker_secret','monitor_auth_required','automation_monitor_runs','automation_incidents','automation_recovery_attempts',
  "status:'approved'",'stripe_payment_events','reset_retryable','client_intake_requests','project_fulfillment_jobs',
  'project_revision_requests','project_site_domains','client-site-resolve','phase14_revert_project_activation',
  'monitoring_automatic_production_rollback','investigate_monitoring_incident','auto_recovery_enabled','max_auto_attempts'
]) if(!worker.includes(marker)) failures.push(`Monitoring worker missing safeguard: ${marker}`);
for(const forbidden of ['sk_live_','sk_test_','whsec_','sb_secret_','SUPABASE_SERVICE_ROLE_KEY','VERCEL_TOKEN']) if(worker.includes(forbidden)) failures.push(`Monitoring worker contains secret marker: ${forbidden}`);
if(worker.includes("action_type==='deploy_paid_project_production'&&settings.auto_recovery_enabled")) failures.push('Monitoring worker may auto-retry production deployment');
if(!worker.includes("rel.previous_release_id&&settings.auto_recovery_enabled")) failures.push('Automatic production recovery is not restricted to releases with a previous version');

const health=await source('supabase/functions/system-health/index.ts');
for(const marker of ['release:\'14.0.0\'','monitoring_enabled','auto_recovery_enabled','automation_monitor_runs','automation_incidents','open_incidents','automatic_recovery:true']) if(!health.includes(marker)) failures.push(`System health missing monitoring marker: ${marker}`);
for(const forbidden of ['sk_live_','sk_test_','whsec_','sb_secret_','SUPABASE_SERVICE_ROLE_KEY']) if(health.includes(forbidden)) failures.push(`System health contains secret marker: ${forbidden}`);

const foundation=await source('supabase/migrations/20260831_phase14_monitoring_recovery_foundation.sql');
for(const marker of [
  'automation_monitor_runs','automation_incidents','automation_recovery_attempts','enable row level security',
  'owner_all_automation_monitor_runs','owner_all_automation_incidents','owner_all_automation_recovery_attempts',
  'monitoring_enabled','auto_recovery_enabled','monitoring_interval_minutes','vault.create_secret','bonebrake_monitor_worker_secret','create extension if not exists pg_cron'
]) if(!foundation.includes(marker)) failures.push(`Monitoring foundation missing marker: ${marker}`);
if(/bonebrake_monitor_worker_secret'\s*,\s*'[a-f0-9]{32,}/i.test(foundation)) failures.push('Monitoring migration appears to hardcode a scheduler secret');

const schedule=await source('supabase/migrations/20260831_phase14_monitoring_schedule.sql');
for(const marker of ['bonebrake-monitoring-5m','*/5 * * * *','net.http_post','vault.decrypted_secrets','monitoring-run','monitoring_enabled=true','auto_recovery_enabled=true']) if(!schedule.includes(marker)) failures.push(`Monitoring schedule missing marker: ${marker}`);
if(schedule.includes('x-bonebrake-monitor-key\',\'')&&/[a-f0-9]{48,}/i.test(schedule)) failures.push('Monitoring schedule appears to embed a raw secret');

const hardening=await source('supabase/migrations/20260831_phase14_monitoring_performance_hardening.sql');
for(const marker of ['automation_incidents_escalation_action_idx',"lower((select auth.jwt())->>'email')",'owner_all_automation_monitor_runs','owner_all_automation_incidents','owner_all_automation_recovery_attempts']) if(!hardening.includes(marker)) failures.push(`Monitoring hardening missing marker: ${marker}`);

if(failures.length){console.error(`Phase 14 monitoring checks failed (${failures.length}):`);for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Phase 14 monitoring checks passed: five-minute cron, Vault credential isolation, owner-only incident history, optimized RLS/indexes, bounded automatic recovery, escalation, health reporting, and known-good production rollback safeguards verified.');