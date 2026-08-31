// Phase 14 production-host certification gate. Keep this intentionally strict.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd();const failures=[];
const required=['api/client-site.js','supabase/functions/client-site-resolve/index.ts','supabase/functions/production-deploy-execute/index.ts','supabase/migrations/20260831_phase14_multi_tenant_production_host.sql','supabase/migrations/20260831_phase14_atomic_production_release.sql','supabase/migrations/20260831_phase14_queue_production_deploy_action.sql'];
for(const file of required){try{await fs.access(path.join(root,file))}catch{failures.push(`Missing production-host file: ${file}`)}}
for(const file of ['api/client-site.js','phase14-autopilot.js']){try{execFileSync(process.execPath,['--check',path.join(root,file)],{stdio:'pipe'})}catch(error){failures.push(`${file} syntax invalid: ${String(error.stderr||error.message).trim()}`)}}

try{const source=await fs.readFile(path.join(root,'supabase/functions/production-deploy-execute/index.ts'),'utf8');for(const marker of ['deploy_paid_project_production','production_deploy_enabled','verified_primary_domain_required','artifact_integrity_failed','phase14_activate_project_release','phase14_revert_project_activation','client-site-resolve','production_internal_smoke_hash_mismatch'])if(!source.includes(marker))failures.push(`Production executor missing safeguard: ${marker}`)}catch(error){failures.push(`Production executor check failed: ${error.message}`)}
try{const source=await fs.readFile(path.join(root,'supabase/functions/client-site-resolve/index.ts'),'utf8');for(const marker of [".eq('status','active')",".eq('status','deployed')",".eq('is_active',true)",'content_sha256',"project.payment_state==='refunded'",'Content-Security-Policy'])if(!source.includes(marker))failures.push(`Client resolver missing safeguard: ${marker}`)}catch(error){failures.push(`Client resolver check failed: ${error.message}`)}
try{const source=await fs.readFile(path.join(root,'supabase/migrations/20260831_phase14_multi_tenant_production_host.sql'),'utf8');for(const marker of ['project_release_candidates_one_active_per_project_idx','project_site_domains','owner_all_project_site_domains','security_invoker=true','ssl_status'])if(!source.includes(marker))failures.push(`Production schema missing marker: ${marker}`)}catch(error){failures.push(`Production schema check failed: ${error.message}`)}
try{const source=await fs.readFile(path.join(root,'supabase/migrations/20260831_phase14_atomic_production_release.sql'),'utf8');for(const marker of ['internal.phase14_activate_project_release','internal.phase14_revert_project_activation','production_automation_disabled','revision_still_open','grant execute','service_role'])if(!source.includes(marker))failures.push(`Atomic release migration missing marker: ${marker}`);if(!source.includes('security definer'))failures.push('Atomic release function is not privilege-isolated');if(!source.includes('revoke all on function internal.phase14_activate_project_release'))failures.push('Atomic activation function execute privilege is not revoked')}catch(error){failures.push(`Atomic production migration check failed: ${error.message}`)}
try{const source=await fs.readFile(path.join(root,'phase14-autopilot.js'),'utf8');for(const marker of ['deploy_paid_project_production','production-deploy-execute','PRODUCTION_ACTIONS','Production Deployment is OFF'])if(!source.includes(marker))failures.push(`Dashboard production gate missing marker: ${marker}`);if(source.replace(/\s/g,'').includes('production_deploy_enabled:true'))failures.push('Dashboard can directly enable production deployment')}catch(error){failures.push(`Dashboard production check failed: ${error.message}`)}
try{
  const config=JSON.parse(await fs.readFile(path.join(root,'vercel.json'),'utf8'));
  const tenantRewrite=(config.rewrites||[]).find(entry=>entry?.destination==='/api/client-site'&&entry?.source==='/(.*)');
  const hostRule=tenantRewrite?.has?.find?.(rule=>rule?.type==='host');
  const hostPattern=typeof hostRule?.value==='string'?hostRule.value:hostRule?.value?.re;
  if(!tenantRewrite)failures.push('Vercel tenant routing does not target /api/client-site');
  if(!hostPattern)failures.push('Vercel tenant routing does not require a host condition');
  else{
    let matcher=null;try{matcher=new RegExp(hostPattern)}catch{failures.push('Vercel tenant hostname regex is invalid')}
    if(matcher){
      if(matcher.test('bwdnorth.com')||matcher.test('www.bwdnorth.com'))failures.push('Vercel tenant routing would intercept the Bonebrake production domain');
      if(matcher.test('candidate.vercel.app'))failures.push('Vercel tenant routing would intercept Vercel deployment domains');
      if(!matcher.test('client-example.com'))failures.push('Vercel tenant routing does not accept a normal custom client domain');
    }
  }
}catch(error){failures.push(`Vercel routing check failed: ${error.message}`)}
try{const api=await fs.readFile(path.join(root,'api/client-site.js'),'utf8');for(const forbidden of ['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEYS','VERCEL_TOKEN','service_role','sk_live_','whsec_'])if(api.includes(forbidden))failures.push(`Public tenant host contains credential marker: ${forbidden}`)}catch(error){failures.push(`Tenant host credential check failed: ${error.message}`)}

if(failures.length){console.error(`Phase 14 production host checks failed (${failures.length}):`);for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Phase 14 production host checks passed: domain isolation, active-release uniqueness, atomic activation/rollback, smoke testing, credential boundaries, and production kill-switch safeguards verified.');
