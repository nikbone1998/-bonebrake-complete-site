import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const failures=[];
const required=[
  'client-intake.html',
  'client-review.html',
  'api/ai-site-builder.js',
  'supabase/functions/client-intake/index.ts',
  'supabase/functions/generation-authorize/index.ts',
  'supabase/functions/generate-project-build/index.ts',
  'supabase/functions/project-preview/index.ts',
  'supabase/functions/project-review/index.ts',
  'supabase/functions/apply-project-revision/index.ts',
  'supabase/functions/project-release-execute/index.ts',
  'supabase/migrations/20260831_phase14_paid_fulfillment_foundation.sql',
  'supabase/migrations/20260831_phase14_ai_build_worker_foundation.sql',
  'supabase/migrations/20260831_phase14_project_review_revision_release.sql'
];
for(const file of required){try{await fs.access(path.join(root,file))}catch{failures.push(`Missing fulfillment/release file: ${file}`)}}

for(const js of ['api/ai-site-builder.js','phase14-autopilot.js']){
  try{execFileSync(process.execPath,['--check',path.join(root,js)],{stdio:'pipe'})}
  catch(error){failures.push(`${js} syntax invalid: ${String(error.stderr||error.message).trim()}`)}
}

async function requireMarkers(file,markers,label=file){
  try{const source=await fs.readFile(path.join(root,file),'utf8');for(const marker of markers)if(!source.includes(marker))failures.push(`${label} missing safeguard: ${marker}`);return source}
  catch(error){failures.push(`${label} unreadable: ${error.message}`);return ''}
}

const ui=await requireMarkers('phase14-autopilot.js',[
  'generate-project-build','apply-project-revision','project-release-execute',
  'generate_paid_project_build','apply_paid_project_revision','review_paid_project_preview','approve_paid_project_release',
  'settings?.fulfillment_enabled','STOP ALL AUTOMATION'
],'Autopilot routing');
for(const forbidden of ['sb_secret_','SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY','service_role'])if(ui.includes(forbidden))failures.push(`Autopilot client exposes privileged marker: ${forbidden}`);

const worker=await requireMarkers('api/ai-site-builder.js',[
  "MODEL='openai/gpt-5.6-sol'",'VERCEL_OIDC_TOKEN','mode===\'revision\'','qualityChecks','repair_attempted',
  'generated_site_failed_safety_validation','generated_site_failed_quality_validation','production_release_authorized:false'
],'AI builder');
for(const forbidden of ['sk_live_','sk_test_','sb_secret_','SUPABASE_SECRET_KEYS'])if(worker.includes(forbidden))failures.push(`AI builder contains secret credential material: ${forbidden}`);

await requireMarkers('supabase/functions/generation-authorize/index.ts',[
  'generation_worker_tokens','worker_authorization_already_claimed','apply_paid_project_revision','mode===\'revision\'',
  'base_artifact','paid_project_required','production_release_authorized:false'
],'Generation authorization');

await requireMarkers('supabase/functions/generate-project-build/index.ts',[
  'preview_only_spec_required','generation_worker_tokens','project_generated_artifacts','review_paid_project_preview',
  'production_release_authorized:false'
],'Generation executor');

await requireMarkers('supabase/functions/project-review/index.ts',[
  "['read','request_revision','approve']",'project_revision_requests','apply_paid_project_revision','qa_not_passed',
  'payment_not_verified','approve_paid_project_release','production_deployed:false'
],'Client review API');

await requireMarkers('supabase/functions/apply-project-revision/index.ts',[
  'apply_paid_project_revision','mode:\'revision\'','status:\'archived\'','applied_artifact_id','quality_checks?.passed',
  'review_paid_project_preview','production_release_authorized:false'
],'Revision executor');

await requireMarkers('supabase/functions/project-release-execute/index.ts',[
  'review_paid_project_preview','approve_paid_project_release','client_approved','owner_approved_at','release_ready',
  'payment_not_verified','qa_not_verified','revision_still_open','production_deployed:false'
],'Release executor');

const reviewPage=await requireMarkers('client-review.html',['noindex,nofollow,noarchive','no-referrer','Request changes','Approve this website','project-review'],'Client review page');
if(/sk_(?:live|test)_|sb_secret_/i.test(reviewPage))failures.push('Client review page contains secret-looking credential material');

await requireMarkers('client-intake.html',['noindex,nofollow,noarchive','no-referrer','client-intake'],'Client intake page');
await requireMarkers('supabase/functions/project-preview/index.ts',["frame-ancestors https://bwdnorth.com https://www.bwdnorth.com https://*.vercel.app","connect-src 'none'","form-action 'none'"],'Preview sandbox');

const releaseMigration=await requireMarkers('supabase/migrations/20260831_phase14_project_review_revision_release.sql',[
  'project_revision_requests','project_release_candidates','enable row level security','revoke all on public.project_revision_requests from anon',
  'revoke all on public.project_release_candidates from anon','owner_all_project_revision_requests','owner_all_project_release_candidates',
  "status in ('draft','client_review','client_approved','owner_approved','release_ready','deploying','deployed','blocked','failed','cancelled')"
],'Review/release migration');
if(/security\s+definer/i.test(releaseMigration))failures.push('Review/release migration unexpectedly uses SECURITY DEFINER');

if(failures.length){console.error(`Phase 14 fulfillment/release checks failed (${failures.length}):`);for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log(`Phase 14 fulfillment/release checks passed (${required.length} required files + client intake, AI generation, self-healing QA, revision immutability, client approval, owner release, RLS, credential, and production-separation safeguards).`);
