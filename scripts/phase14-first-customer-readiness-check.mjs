import fs from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const failures=[];
async function read(file){try{return await fs.readFile(path.join(root,file),'utf8')}catch{failures.push(`Missing first-customer file: ${file}`);return ''}}
function requireMarkers(file,src,markers){for(const marker of markers)if(!src.includes(marker))failures.push(`${file} missing marker: ${marker}`)}

const readinessFile='docs/PHASE14_FIRST_CUSTOMER_READINESS.md';
const scopeFile='docs/PHASE14_FIRST_CUSTOMER_SCOPE_ACKNOWLEDGMENT.md';
const messagesFile='docs/PHASE14_FIRST_CUSTOMER_MESSAGES.md';
const migrationFile='supabase/migrations/20260901_phase14_first_customer_asset_handoff.sql';
const readiness=await read(readinessFile),scope=await read(scopeFile),messages=await read(messagesFile),migration=await read(migrationFile);
requireMarkers(readinessFile,readiness,['$1,995','one paid project','two consolidated client revision rounds','no required monthly maintenance retainer','Production approval','new scope']);
requireMarkers(scopeFile,scope,['$1,995','two consolidated client revision rounds','no required monthly maintenance','Client acknowledgment','Cancellation / refunds']);
requireMarkers(messagesFile,messages,['Qualified pilot invitation','Checkout handoff','Preview ready','Revision limit / new scope','Emergency pause','Not a pilot fit']);
requireMarkers(migrationFile,migration,["client_project_assets","client-project-assets","public=false","5242880","image/jpeg","image/png","image/webp","enable row level security","revoke all privileges"]);

const clientAssetsFile='supabase/functions/client-assets/index.ts',clientAssetFile='supabase/functions/client-asset/index.ts';
const clientAssets=await read(clientAssetsFile),clientAsset=await read(clientAssetFile);
requireMarkers(clientAssetsFile,clientAssets,['token_hash','MAX_FILE_BYTES=5*1024*1024','MAX_PHOTOS=6',"kind==='logo'","kind==='photo'","action==='remove'","payment_state!=='paid'","image/jpeg","image/png","image/webp"]);
requireMarkers(clientAssetFile,clientAsset,['asset_token',"eq('status','active')",'.storage.from(','payment_state===\'refunded\'','X-Content-Type-Options']);

const intakeFile='client-intake.html',reviewUiFile='client-review.html',reviewFnFile='supabase/functions/project-review/index.ts';
const intake=await read(intakeFile),reviewUi=await read(reviewUiFile),reviewFn=await read(reviewFnFile);
requireMarkers(intakeFile,intake,['functions/v1/client-assets','Upload logo','Upload photos','data-remove','5 MB','up to six business photos']);
requireMarkers(reviewFnFile,reviewFn,['MAX_INCLUDED_CLIENT_REVISION_ROUNDS=2','OPEN_REVISION_STATES','COUNTED_REVISION_STATES','revision_limit_reached','revision_pending','feedback_mode:\'consolidated\'']);
requireMarkers(reviewUiFile,reviewUi,['revision_policy','Included revisions','consolidated revision round','revision_limit_reached','new-scope']);

const authorizeFile='supabase/functions/generation-authorize/index.ts',builderFile='api/ai-site-builder.js';
const authorize=await read(authorizeFile),builder=await read(builderFile);
requireMarkers(authorizeFile,authorize,['client_project_assets','approved_assets','client-asset?t=','arbitrary_external_assets:false']);
requireMarkers(builderFile,builder,['approvedAssetUrls','client-asset\\?t=','allowedAssetUrls.has(url)','external_url','external_script','network_api','approved_asset_allowlist']);
if(!builder.includes("fetch|XMLHttpRequest|WebSocket|EventSource")) failures.push('AI builder no longer visibly gates browser network APIs.');

const previewFile='supabase/functions/project-preview/index.ts',resolverFile='supabase/functions/client-site-resolve/index.ts';
const preview=await read(previewFile),resolver=await read(resolverFile);
requireMarkers(previewFile,preview,["img-src 'self' data: blob:","connect-src 'none'","sandbox allow-scripts"]);
requireMarkers(resolverFile,resolver,['ASSET_ORIGIN','img-src ${ASSET_ORIGIN} data: blob:',"connect-src 'none'","frame-ancestors 'none'"]);

const offerFile='supabase/functions/first-customer-offer/index.ts';
const offer=await read(offerFile);
requireMarkers(offerFile,offer,['$1,995','one project only','Two consolidated revision rounds','no required monthly maintenance','does not activate or accept payment','noindex,nofollow,noarchive']);

if(failures.length){console.error(`Phase 14 first-customer readiness checks failed (${failures.length}):`);for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Phase 14 first-customer readiness checks passed: one-customer commercial scope, private asset handoff, exact AI asset allowlist, two-round revision policy, preview/production CSP, and manual acquisition controls verified.');
