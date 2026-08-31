import fs from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const migration='supabase/migrations/20260831_phase14_pilot_activation_package.sql';
const acl='supabase/migrations/20260831_phase14_pilot_rpc_acl_hardening.sql';
const checkout='supabase/migrations/20260831_phase14_pilot_checkout_binding.sql';
const control='supabase/functions/pilot-control/index.ts';
const ui='phase14-pilot-control.js';
const css='phase14-pilot-control.css';
const loader='phase14-domain-bridge-guard.js';
const approvalBridge='phase14-pilot-approval-executor.js';
async function read(file){try{return await fs.readFile(path.join(root,file),'utf8')}catch{failures.push(`Missing pilot file: ${file}`);return ''}}
const sql=await read(migration);
const aclSql=await read(acl);
const checkoutSql=await read(checkout);
const api=await read(control);
const uiJs=await read(ui);
const uiCss=await read(css);
const loaderJs=await read(loader);
const approvalJs=await read(approvalBridge);

for(const marker of [
  'pilot_activation_plans','pilot_activation_events','max_paid_projects = 1','max_concurrent_projects = 1',
  'allow_prospecting = false','allow_outreach = false','allow_auto_reply = false','allow_automatic_production = false',
  'phase14_enforce_pilot_scope','production_deploy_enabled:=false','daily_outreach_cap:=0',
  'new.pilot_mode_enabled:=false','new.pilot_active_plan_id:=null',
  'phase14_claim_pilot_checkout','pilot_capacity_reached','payments_enabled=false',
  'phase14_bind_pilot_project','phase14_activate_single_customer_pilot','approved_pilot_activation_action_required',
  "a.action_type<>'activate_single_customer_pilot'",'phase14_halt_single_customer_pilot','external_effects_locked=true',
  'ai_runtime_post_not_certified','single_customer_checkout_not_ready'
]) if(!sql.includes(marker)) failures.push(`Pilot migration missing safety marker: ${marker}`);

for(const marker of [
  'phase14_claim_pilot_checkout(uuid,text) from public,anon,authenticated',
  'phase14_bind_pilot_project(uuid,text,uuid) from public,anon,authenticated',
  'phase14_activate_single_customer_pilot(uuid,uuid) from public,anon,authenticated',
  'phase14_halt_single_customer_pilot(uuid,text) from public,anon,authenticated',
  'phase14_claim_pilot_checkout(uuid,text) to service_role',
  'phase14_bind_pilot_project(uuid,text,uuid) to service_role'
]) if(!aclSql.includes(marker)) failures.push(`Pilot RPC ACL hardening missing marker: ${marker}`);

for(const marker of [
  'phase14_enforce_pilot_checkout_session','pilot_active_plan_required','pilot_payment_link_not_authorized',
  'pilot_package_not_authorized','first_paid_project_claimed','pilot_capacity_reached',
  'claimed_checkout_session_id=new.stripe_checkout_session_id','claimed_project_id=new.project_id',
  'payments_enabled=false','phase14_pilot_checkout_session_guard'
]) if(!checkoutSql.includes(marker)) failures.push(`Pilot checkout binding missing safety marker: ${marker}`);

for(const marker of [
  "const OWNER='bonebrakewebsitedesign@gmail.com'",'db.auth.getUser(jwt)','allowedChecks',
  "action==='arm'",'pilot_not_ready','activate_single_customer_pilot','max_paid_projects:1','max_concurrent_projects:1',
  'phase14_activate_single_customer_pilot','phase14_halt_single_customer_pilot',
  "external_effect:'enable_single_customer_payments_and_fulfillment'"
]) if(!api.includes(marker)) failures.push(`Pilot control missing safety marker: ${marker}`);

for(const marker of [
  "const CONTROL=`${SB}/functions/v1/pilot-control`",'ARM FIRST-CUSTOMER PILOT','EMERGENCY HALT PILOT',
  "readiness?.ready!==true",'activate_single_customer_pilot','interceptActivationApproval',
  "callControl('activate'",'Prospecting, Outreach, Auto Reply and Production remain OFF',
  "data-pilot-control=\"execute\"",'phase14-pilot-control.css'
]) if(!uiJs.includes(marker)) failures.push(`Pilot dashboard missing safety marker: ${marker}`);

for(const marker of ['p14-pilot-hero','p14-pilot-check','p14-pilot-arm','p14-pilot-halt']) if(!uiCss.includes(marker)) failures.push(`Pilot dashboard CSS missing marker: ${marker}`);
for(const marker of ["actionType.includes('activate single customer pilot')","event.stopImmediatePropagation()","import('./phase14-pilot-approval-executor.js')","import('./phase14-pilot-control.js')"]) if(!loaderJs.includes(marker)) failures.push(`Pilot dashboard loader/approval guard missing marker: ${marker}`);
for(const marker of ["export async function approvePilotAction","action.action_type!=='activate_single_customer_pilot'","status:'approved'","action:'activate'",'Customer capacity: exactly 1','Prospecting, Outreach, Auto Reply and Production remain OFF']) if(!approvalJs.includes(marker)) failures.push(`Pilot approval bridge missing safety marker: ${marker}`);

if(sql.includes('max_paid_projects smallint not null default 0')) failures.push('Pilot paid-project cap cannot default above/below exactly one.');
if(api.includes("single_customer_checkout_ready:true")) failures.push('Pilot control must not hard-code checkout readiness true.');
if(api.includes("ai_runtime_certified:true")) failures.push('Pilot control must not hard-code AI runtime certification true.');
if(uiJs.includes("prospecting_enabled:true")||uiJs.includes("outreach_enabled:true")||uiJs.includes("production_deploy_enabled:true")) failures.push('Pilot dashboard must never directly enable restricted capabilities.');
if(approvalJs.includes("prospecting_enabled:true")||approvalJs.includes("outreach_enabled:true")||approvalJs.includes("production_deploy_enabled:true")) failures.push('Pilot approval bridge must never directly enable restricted capabilities.');

if(failures.length){console.error(`Phase 14 pilot activation checks failed (${failures.length}):`);for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('Phase 14 pilot activation checks passed: one-customer caps, external-effects lock, service-only pilot RPCs, single-use checkout binding, owner readiness UI, synchronous dedicated activation routing, and emergency halt contracts verified.');
