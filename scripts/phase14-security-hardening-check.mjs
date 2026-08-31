import fs from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const hardeningMigration='supabase/migrations/20260831_phase14_final_security_hardening.sql';
const authGateMigration='supabase/migrations/20260831_phase14_auth_security_pilot_gate.sql';
const self='scripts/phase14-security-hardening-check.mjs';

async function read(file){try{return await fs.readFile(path.join(root,file),'utf8')}catch{failures.push(`Missing security file: ${file}`);return ''}}
const hardening=await read(hardeningMigration);
const authGate=await read(authGateMigration);

for(const marker of [
  'alter default privileges for role postgres in schema public revoke all privileges on tables from anon, authenticated, service_role',
  'alter default privileges for role postgres in schema public revoke all privileges on functions from public, anon, authenticated, service_role',
  'revoke truncate, references, trigger, maintain on all tables in schema public from anon, authenticated, service_role',
  'revoke all privileges on table public.automation_actions from anon',
  'revoke all privileges on table public.automation_settings from anon',
  'revoke all privileges on table public.pilot_activation_plans from anon',
  'revoke all privileges on table public.stripe_payment_events from anon',
  'grant select on table public.content_items to anon',
  'for all to authenticated',
  'revoke execute on function public.phase14_enforce_external_effects_lock() from public, anon, authenticated',
  'revoke execute on function public.phase14_score_prospect_candidate() from public, anon, authenticated',
  'revoke execute on function public.phase14_pilot_readiness(uuid) from anon'
]) if(!hardening.includes(marker)) failures.push(`Security hardening migration missing marker: ${marker}`);

for(const marker of [
  "jsonb_build_array('auth_security_review_required')",
  'if not p.auth_security_reviewed',
  'revoke execute on function public.phase14_pilot_readiness(uuid) from public,anon',
  'grant execute on function public.phase14_pilot_readiness(uuid) to authenticated,service_role'
]) if(!authGate.includes(marker)) failures.push(`Auth security pilot gate missing marker: ${marker}`);

const criticalFunctions={
  'supabase/functions/stripe-webhook/index.ts':['verifyStripeSignature','stripe-signature','safeEqual','stripe_webhook_signing_secret','invalid_signature'],
  'supabase/functions/autopilot-execute/index.ts':['owner_or_retry_worker_required','retry_context_not_dispatching','retry_engine_worker_secret','db.auth.getUser'],
  'supabase/functions/monitoring-run/index.ts':['monitor_worker_secret','x-bonebrake-monitor-key','monitor_auth_required','db.auth.getUser'],
  'supabase/functions/retry-run/index.ts':['retry_engine_worker_secret','x-bonebrake-retry-key','retry_engine_auth_required','db.auth.getUser'],
  'supabase/functions/pilot-control/index.ts':['owner_auth_required','db.auth.getUser(jwt)',"action==='arm'",'phase14_halt_single_customer_pilot']
};
for(const [file,markers] of Object.entries(criticalFunctions)){
  const src=await read(file);
  for(const marker of markers) if(!src.includes(marker)) failures.push(`${file} missing authentication marker: ${marker}`);
}

const secretPatterns=[
  ['Stripe secret key',/sk_(?:live|test)_[A-Za-z0-9]{12,}/g],
  ['Stripe webhook secret',/whsec_[A-Za-z0-9]{12,}/g],
  ['Supabase secret key',/sb_secret_[A-Za-z0-9_-]{12,}/g],
  ['GitHub classic token',/ghp_[A-Za-z0-9]{20,}/g],
  ['GitHub fine-grained token',/github_pat_[A-Za-z0-9_]{20,}/g],
  ['Slack token',/xox[baprs]-[A-Za-z0-9-]{10,}/g],
  ['Private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g]
];
const sourceExt=new Set(['.js','.mjs','.ts','.tsx','.jsx','.sql','.html','.json','.toml','.yml','.yaml','.md','.txt']);
async function walk(dir){
  const out=[];
  for(const ent of await fs.readdir(dir,{withFileTypes:true})){
    if(['.git','node_modules'].includes(ent.name))continue;
    const full=path.join(dir,ent.name);
    if(ent.isDirectory())out.push(...await walk(full));
    else if(sourceExt.has(path.extname(ent.name).toLowerCase()))out.push(full);
  }
  return out;
}
for(const full of await walk(root)){
  const rel=path.relative(root,full).replaceAll('\\','/');
  if(rel===self)continue;
  const src=await fs.readFile(full,'utf8').catch(()=>null);if(src==null)continue;
  for(const [label,re] of secretPatterns){re.lastIndex=0;if(re.test(src))failures.push(`${label} literal detected in ${rel}`)}
}

if(failures.length){console.error(`Phase 14 security hardening checks failed (${failures.length}):`);for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('Phase 14 security hardening checks passed: least-privilege defaults, anonymous surface reduction, trigger RPC lockdown, Auth pilot gate, critical custom-auth markers, and repository secret-literal scan verified.');
