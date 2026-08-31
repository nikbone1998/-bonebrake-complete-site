import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const OWNER='bonebrakewebsitedesign@gmail.com'
const clean=(v:unknown,max=500)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)
const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const now=()=>new Date().toISOString()
async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST') return Response.json({ok:false,error:'method_not_allowed'},{status:405})
  const auth=req.headers.get('authorization')||'',jwt=auth.startsWith('Bearer ')?auth.slice(7):''
  if(!jwt) return Response.json({ok:false,error:'authentication_required'},{status:401})
  const url=Deno.env.get('SUPABASE_URL'),secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')['default']
  if(!url||!secret) return Response.json({ok:false,error:'server_configuration_error'},{status:500})
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error:userError}=await db.auth.getUser(jwt)
  if(userError||!user||String(user.email||'').toLowerCase()!==OWNER) return Response.json({ok:false,error:'owner_only'},{status:403})
  let body:any;try{body=await req.json()}catch{return Response.json({ok:false,error:'invalid_json'},{status:400})}
  const actionId=clean(body?.action_id,80);if(!uuidRe.test(actionId))return Response.json({ok:false,error:'valid_action_id_required'},{status:400})
  const [{data:settings},{data:action}]=await Promise.all([db.from('automation_settings').select('*').eq('key','global').maybeSingle(),db.from('automation_actions').select('*').eq('id',actionId).maybeSingle()])
  if(!settings||!action)return Response.json({ok:false,error:'action_or_settings_unavailable'},{status:404})
  if(action.status==='completed')return Response.json({ok:true,already_completed:true,result:action.result||null})
  if(action.action_type!=='deploy_paid_project_production'||action.status!=='approved')return Response.json({ok:false,error:'production_action_not_approved'},{status:409})
  if(!settings.autopilot_enabled||!settings.fulfillment_enabled||!settings.production_deploy_enabled)return Response.json({ok:false,error:'production_deployment_disabled'},{status:423})
  const projectId=String(action.entity_id||action.payload?.project_id||''),releaseId=String(action.payload?.release_candidate_id||'')
  if(!uuidRe.test(projectId)||!uuidRe.test(releaseId))return Response.json({ok:false,error:'production_targets_invalid'},{status:400})
  const [{data:project},{data:release}]=await Promise.all([db.from('projects').select('*').eq('id',projectId).maybeSingle(),db.from('project_release_candidates').select('*').eq('id',releaseId).eq('project_id',projectId).maybeSingle()])
  if(!project||project.payment_state!=='paid'||Number(project.paid_amount)<Number(project.agreed_price))return Response.json({ok:false,error:'payment_not_verified'},{status:409})
  if(!release||release.status!=='release_ready'||release.qa_passed!==true||!release.client_approved_at||!release.owner_approved_at)return Response.json({ok:false,error:'release_not_ready'},{status:409})
  const {data:domain}=await db.from('project_site_domains').select('*').eq('project_id',projectId).eq('is_primary',true).in('status',['verified','active']).eq('ssl_status','ready').maybeSingle()
  if(!domain)return Response.json({ok:false,error:'verified_primary_domain_required'},{status:409})
  const {data:artifact}=await db.from('project_generated_artifacts').select('id,status,html,content_sha256').eq('id',release.artifact_id).eq('project_id',projectId).maybeSingle()
  if(!artifact||artifact.status!=='approved'||!artifact.html||await sha256(String(artifact.html))!==artifact.content_sha256)return Response.json({ok:false,error:'artifact_integrity_failed'},{status:409})
  const {data:openRevisions}=await db.from('project_revision_requests').select('id').eq('project_id',projectId).in('status',['pending','approved','processing']).limit(1);if(openRevisions?.length)return Response.json({ok:false,error:'revision_still_open'},{status:409})
  const {data:claimed,error:claimError}=await db.from('automation_actions').update({status:'executing',updated_at:now(),error_message:null}).eq('id',action.id).eq('status','approved').select('id').maybeSingle();if(claimError||!claimed)return Response.json({ok:false,error:'action_already_claimed'},{status:409})
  const fail=async(message:string,rollback=false)=>{const m=clean(message,500);let rollbackResult:any=null;if(rollback){const {data}=await db.rpc('phase14_revert_project_activation',{p_release_id:releaseId,p_reason:m});rollbackResult=data||null}await db.from('automation_actions').update({status:'failed',error_message:m,result:{error:m,rollback:rollbackResult},updated_at:now()}).eq('id',action.id).eq('status','executing');return Response.json({ok:false,error:m,rollback:rollbackResult},{status:500,headers:{'Cache-Control':'no-store'}})}
  const {data:activation,error:activationError}=await db.rpc('phase14_activate_project_release',{p_release_id:releaseId,p_domain_id:domain.id});if(activationError||!activation)return await fail(clean(activationError?.message||'production_activation_failed',500),false)
  let resolvedText='';try{const smoke=await fetch(`${url}/functions/v1/client-site-resolve?host=${encodeURIComponent(domain.hostname)}`,{method:'GET',signal:AbortSignal.timeout(12000)});if(!smoke.ok)return await fail(`production_internal_smoke_http_${smoke.status}`,true);resolvedText=await smoke.text()}catch(error){return await fail(error instanceof Error?`production_internal_smoke:${error.message}`:'production_internal_smoke_failed',true)}
  const resolvedHash=await sha256(resolvedText);if(resolvedHash!==artifact.content_sha256)return await fail('production_internal_smoke_hash_mismatch',true)
  const completedAt=now();await db.from('project_release_candidates').update({deployment_health:{status:'healthy',internal_smoke_passed:true,content_sha256:resolvedHash,checked_at:completedAt},updated_at:completedAt}).eq('id',releaseId).eq('is_active',true)
  await db.from('activity').insert({entity_type:'project',entity_id:projectId,action:'production_smoke_passed',detail:{release_candidate_id:releaseId,domain:domain.hostname,content_sha256:resolvedHash}})
  const result={...activation,production_deployed:true,internal_smoke_passed:true,content_sha256:resolvedHash};await db.from('automation_actions').update({status:'completed',result,executed_at:completedAt,updated_at:completedAt}).eq('id',action.id).eq('status','executing')
  return Response.json({ok:true,status:'completed',result},{headers:{'Cache-Control':'no-store'}})
})
