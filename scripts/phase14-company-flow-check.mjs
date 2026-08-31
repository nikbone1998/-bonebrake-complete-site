import fs from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const required=[
  'supabase/migrations/20260831_phase14_allow_audited_prospect_status.sql',
  'supabase/migrations/20260831_phase14_prevent_duplicate_stripe_project_creation.sql',
  'supabase/migrations/20260831_phase14_external_effects_safety_lock.sql',
  'supabase/functions/autopilot-execute/index.ts',
  'supabase/functions/stripe-webhook/index.ts'
];
for(const file of required){try{await fs.access(path.join(root,file))}catch{failures.push(`Missing company-flow file: ${file}`)}}
async function read(file){try{return await fs.readFile(path.join(root,file),'utf8')}catch{return ''}}

const audited=await read(required[0]);
for(const marker of ['prospect_candidates_status_check',"'audited'::text","'promoted'::text"])if(!audited.includes(marker))failures.push(`Audited-prospect migration missing marker: ${marker}`);

const trigger=await read(required[1]);
for(const marker of ['lead_workflow_trigger',"new.status = 'won'","new.next_action","paid_client_onboarding","coalesce(new.next_action,'') <> 'paid_client_onboarding'"])if(!trigger.includes(marker))failures.push(`Stripe/CRM project-dedupe migration missing marker: ${marker}`);

const safety=await read(required[2]);
for(const marker of ['external_effects_locked','phase14_enforce_external_effects_lock','phase14_external_effects_lock_guard','old.external_effects_locked','new.external_effects_locked','autopilot_enabled := false','prospecting_enabled := false','outreach_enabled := false','auto_reply_enabled := false','payments_enabled := false','fulfillment_enabled := false','production_deploy_enabled := false','daily_outreach_cap := 0'])if(!safety.includes(marker))failures.push(`External-effects safety lock missing marker: ${marker}`);

const executor=await read(required[3]);
for(const marker of ["status:'audited'","audit_id:audit.audit_id",'prospect_ready_for_promotion'])if(!executor.includes(marker))failures.push(`Prospect audit executor missing company-flow marker: ${marker}`);

const stripe=await read(required[4]);
for(const marker of ["status: 'won'","next_action: 'paid_client_onboarding'",'start_paid_project_fulfillment','project_creation_failed'])if(!stripe.includes(marker))failures.push(`Stripe webhook missing company-flow marker: ${marker}`);

if(failures.length){console.error(`Phase 14 company-flow checks failed (${failures.length}):`);for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('Phase 14 company-flow checks passed: audited prospect lifecycle, Stripe paid-onboarding project dedupe, and database-level external-effects safety lock verified.');
