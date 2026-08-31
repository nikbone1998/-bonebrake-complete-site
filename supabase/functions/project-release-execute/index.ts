import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const OWNER='bonebrakewebsitedesign@gmail.com'
const clean=(v:unknown,max=1000)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)
const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const now=()=>new Date().toISOString()

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
  if(!['review_paid_project_preview','approve_paid_project_release'].includes(action.action_type)||action.status!=='approved')return Response.json({ok:false,error:'release_action_not_approved'},{status:409})
  if(!settings.autopilot_enabled||!settings.fulfillment_enabled)return Response.json({ok:false,error:'fulfillment_disabled'},{status:423})
  const projectId=String(action.entity_id||action.payload?.project_id||''),jobId=String(action.payload?.fulfillment_job_id||''),artifactId=String(action.payload?.artifact_id||'')
  if(![projectId,jobId,artifactId].every(x=>uuidRe.test(x)))return Response.json({ok:false,error:'release_targets_invalid'},{status:400})
  const [{data:project},{data:job},{data:artifact}]=await Promise.all([db.from('projects').select('*').eq('id',projectId).maybeSingle(),db.from('project_fulfillment_jobs').select('*').eq('id',jobId).eq('project_id',projectId).maybeSingle(),db.from('project_generated_artifacts').select('*').eq('id',artifactId).eq('project_id',projectId).maybeSingle()])
  if(!project||project.payment_state!=='paid'||Number(project.paid_amount)<Number(project.agreed_price))return Response.json({ok:false,error:'payment_not_verified'},{status:409})
  if(!job||job.qa_report?.passed!==true||!['ready_for_review','approved'].includes(job.status))return Response.json({ok:false,error:'qa_not_verified'},{status:409})
  if(!artifact||!['review','approved'].includes(artifact.status))return Response.json({ok:false,error:'artifact_not_reviewable'},{status:409})
  const {data:claimed,error:claimError}=await db.from('automation_actions').update({status:'executing',updated_at:now(),error_message:null}).eq('id',action.id).eq('status','approved').select('id').maybeSingle();if(claimError||!claimed)return Response.json({ok:false,error:'action_already_claimed'},{status:409})
  const fail=async(message:string)=>{const m=clean(message,500);await db.from('automation_actions').update({status:'failed',error_message:m,result:{error:m},updated_at:now()}).eq('id',action.id).eq('status','executing');return Response.json({ok:false,error:m},{status:500,headers:{'Cache-Control':'no-store'}})}

  if(action.action_type==='review_paid_project_preview'){
    const rawPreview=String(job.preview_url||'');let token='';try{const p=new URL(rawPreview);token=p.searchParams.get('t')||''}catch{}
    if(token.length<32)return await fail('private_preview_token_unavailable')
    const reviewedAt=now();const releasePayload={project_id:project.id,fulfillment_job_id:job.id,artifact_id:artifact.id,status:'client_review',qa_passed:true,qa_report:job.qa_report||{},payment_verified_at:reviewedAt,updated_at:reviewedAt,metadata:{preview_version:artifact.version,owner_preview_approved_at:reviewedAt}}
    const {data:candidate,error:candidateError}=await db.from('project_release_candidates').upsert(releasePayload,{onConflict:'project_id,artifact_id'}).select('id').single();if(candidateError||!candidate)return await fail('release_candidate_failed')
    await db.from('project_fulfillment_jobs').update({status:'approved',approved_at:reviewedAt,updated_at:reviewedAt}).eq('id',job.id).eq('status','ready_for_review')
    await db.from('projects').update({status:'review',current_milestone:'client_review',next_action:'await_client_review',updated_at:reviewedAt}).eq('id',project.id)
    const clientReviewUrl=`https://bwdnorth.com/client-review.html?t=${encodeURIComponent(token)}`
    await db.from('activity').insert({entity_type:'project',entity_id:project.id,action:'owner_preview_approved_for_client',detail:{artifact_id:artifact.id,release_candidate_id:candidate.id}})
    const result={project_id:project.id,artifact_id:artifact.id,release_candidate_id:candidate.id,client_review_url:clientReviewUrl,release_status:'client_review',production_deployed:false};await db.from('automation_actions').update({status:'completed',result,executed_at:reviewedAt,updated_at:reviewedAt}).eq('id',action.id).eq('status','executing');return Response.json({ok:true,status:'completed',result},{headers:{'Cache-Control':'no-store'}})
  }

  const releaseCandidateId=String(action.payload?.release_candidate_id||'');if(!uuidRe.test(releaseCandidateId))return await fail('release_candidate_id_required')
  const {data:candidate}=await db.from('project_release_candidates').select('*').eq('id',releaseCandidateId).eq('project_id',project.id).eq('artifact_id',artifact.id).maybeSingle()
  if(!candidate||candidate.status!=='client_approved'||!candidate.client_approved_at||candidate.qa_passed!==true||!candidate.payment_verified_at)return await fail('release_candidate_not_ready')
  const {data:openRevisions}=await db.from('project_revision_requests').select('id').eq('project_id',project.id).in('status',['pending','approved','processing']).limit(1);if(openRevisions?.length)return await fail('revision_still_open')
  const readyAt=now();const {error:releaseError}=await db.from('project_release_candidates').update({status:'release_ready',owner_approved_at:readyAt,release_ready_at:readyAt,updated_at:readyAt,failure_code:null,failure_message:null}).eq('id',candidate.id).eq('status','client_approved');if(releaseError)return await fail('release_readiness_update_failed')
  await db.from('projects').update({status:'launch_ready',current_milestone:'release_ready',next_action:'await_production_deployment',updated_at:readyAt}).eq('id',project.id)
  const {data:productionAction}=await db.from('automation_actions').select('id,status').eq('action_type','deploy_paid_project_production').eq('entity_type','project').eq('entity_id',project.id).in('status',['pending','approved','executing']).order('created_at',{ascending:false}).limit(1).maybeSingle()
  await db.from('activity').insert({entity_type:'project',entity_id:project.id,action:'owner_release_approved',detail:{artifact_id:artifact.id,release_candidate_id:candidate.id,production_action_id:productionAction?.id||null,production_deploy_enabled:!!settings.production_deploy_enabled}})
  const result={project_id:project.id,artifact_id:artifact.id,release_candidate_id:candidate.id,release_status:'release_ready',production_action_id:productionAction?.id||null,production_deploy_enabled:!!settings.production_deploy_enabled,production_deployed:false,production_backend_certification_required:false};await db.from('automation_actions').update({status:'completed',result,executed_at:readyAt,updated_at:readyAt}).eq('id',action.id).eq('status','executing');return Response.json({ok:true,status:'completed',result},{headers:{'Cache-Control':'no-store'}})
})
