import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const MAX_INCLUDED_CLIENT_REVISION_ROUNDS=2
const OPEN_REVISION_STATES=['pending','approved','processing']
const COUNTED_REVISION_STATES=['pending','approved','processing','applied']
const clean=(v:unknown,max=1000)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)
const now=()=>new Date().toISOString()
async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
function cors(req:Request){const origin=req.headers.get('origin')||'';const allowed=origin==='https://bwdnorth.com'||origin==='https://www.bwdnorth.com'||(/^https:\/\/[a-z0-9-]+(?:-[a-z0-9-]+)*\.vercel\.app$/i.test(origin));return {'Access-Control-Allow-Origin':allowed?origin:'https://bwdnorth.com','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'}}

Deno.serve(async(req:Request)=>{
  const headers=cors(req)
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers})
  if(req.method!=='POST') return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers})
  const url=Deno.env.get('SUPABASE_URL'),secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')['default']
  if(!url||!secret) return Response.json({ok:false,error:'server_configuration_error'},{status:500,headers})
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
  let body:any
  try{body=await req.json()}catch{return Response.json({ok:false,error:'invalid_json'},{status:400,headers})}
  const token=clean(body?.token,180),action=clean(body?.action,40)||'read'
  if(token.length<32||token.length>120||!['read','request_revision','approve'].includes(action)) return Response.json({ok:false,error:'invalid_review_request'},{status:404,headers})
  const tokenHash=await sha256(token)
  const {data:artifact}=await db.from('project_generated_artifacts').select('*').eq('preview_token_hash',tokenHash).maybeSingle()
  if(!artifact||!['generated','review','approved'].includes(artifact.status)) return Response.json({ok:false,error:'review_unavailable'},{status:404,headers})
  if(new Date(artifact.preview_expires_at).getTime()<Date.now()) return Response.json({ok:false,error:'review_expired'},{status:410,headers})
  const [{data:project},{data:job}]=await Promise.all([db.from('projects').select('*').eq('id',artifact.project_id).maybeSingle(),db.from('project_fulfillment_jobs').select('*').eq('id',artifact.fulfillment_job_id).maybeSingle()])
  if(!project||!job||project.status==='cancelled'||project.payment_state==='refunded') return Response.json({ok:false,error:'project_unavailable'},{status:410,headers})
  const [{data:release},{data:projectRevisions}]=await Promise.all([db.from('project_release_candidates').select('*').eq('project_id',project.id).eq('artifact_id',artifact.id).maybeSingle(),db.from('project_revision_requests').select('id,created_at,status,request_text,submitted_by,artifact_id,metadata').eq('project_id',project.id).order('created_at',{ascending:true}).limit(50)])
  const revisions=projectRevisions||[]
  const clientRounds=revisions.filter((r:any)=>r.submitted_by==='client'&&COUNTED_REVISION_STATES.includes(r.status))
  const openRevisions=revisions.filter((r:any)=>OPEN_REVISION_STATES.includes(r.status))
  const usedRounds=clientRounds.length,remainingRounds=Math.max(0,MAX_INCLUDED_CLIENT_REVISION_ROUNDS-usedRounds)
  const revisionPolicy={included_rounds:MAX_INCLUDED_CLIENT_REVISION_ROUNDS,used_rounds:usedRounds,remaining_rounds:remainingRounds,open_round:openRevisions.length>0,feedback_mode:'consolidated'}
  const previewUrl=`${url}/functions/v1/project-preview?t=${encodeURIComponent(token)}`
  if(action==='read') return Response.json({ok:true,project:{client_name:project.client_name,project_type:project.project_type},artifact:{id:artifact.id,version:artifact.version,title:artifact.title,summary:artifact.summary,status:artifact.status},preview_url:previewUrl,qa:{passed:job.qa_report?.passed===true,report:job.qa_report||{}},release_status:release?.status||null,revisions,revision_policy:revisionPolicy},{headers})

  if(action==='request_revision'){
    const requestText=clean(body?.request_text,12000)
    if(!requestText) return Response.json({ok:false,error:'revision_text_required'},{status:422,headers})
    if(release?.status==='deployed') return Response.json({ok:false,error:'project_already_deployed'},{status:409,headers})
    if(openRevisions.length) return Response.json({ok:false,error:'revision_pending',revision_policy:revisionPolicy},{status:409,headers})
    if(usedRounds>=MAX_INCLUDED_CLIENT_REVISION_ROUNDS) return Response.json({ok:false,error:'revision_limit_reached',revision_policy:revisionPolicy},{status:409,headers})
    const roundNumber=usedRounds+1
    const {data:revision,error:revisionError}=await db.from('project_revision_requests').insert({project_id:project.id,fulfillment_job_id:job.id,artifact_id:artifact.id,submitted_by:'client',request_text:requestText,status:'pending',metadata:{source:'private_review',revision_round:roundNumber,included_revision_limit:MAX_INCLUDED_CLIENT_REVISION_ROUNDS,feedback_mode:'consolidated'}}).select('id').single()
    if(revisionError||!revision) return Response.json({ok:false,error:'revision_request_failed'},{status:500,headers})
    await db.from('projects').update({revision_status:'client_review',current_milestone:'revision_requested',next_action:'apply_client_revision',updated_at:now()}).eq('id',project.id)
    const {data:existing}=await db.from('automation_actions').select('id').eq('action_type','apply_paid_project_revision').eq('entity_type','project').eq('entity_id',project.id).in('status',['pending','approved','executing']).limit(1)
    let actionId=existing?.[0]?.id||null
    if(!actionId){const {data:queued}=await db.from('automation_actions').insert({action_type:'apply_paid_project_revision',entity_type:'project',entity_id:project.id,title:`Apply client revision round ${roundNumber} for ${project.client_name}`,summary:`Client submitted consolidated revision round ${roundNumber} of ${MAX_INCLUDED_CLIENT_REVISION_ROUNDS}. Generate a new preview version and rerun QA; production remains blocked.`,risk_level:'approval',status:'pending',proposed_by:'client_review',payload:{project_id:project.id,fulfillment_job_id:job.id,artifact_id:artifact.id,revision_id:revision.id,revision_round:roundNumber,included_revision_limit:MAX_INCLUDED_CLIENT_REVISION_ROUNDS,external_effect:'preview_revision_only',production_release_authorized:false}}).select('id').single();actionId=queued?.id||null}
    await db.from('activity').insert({entity_type:'project',entity_id:project.id,action:'client_revision_requested',detail:{revision_id:revision.id,artifact_id:artifact.id,automation_action_id:actionId,revision_round:roundNumber,included_revision_limit:MAX_INCLUDED_CLIENT_REVISION_ROUNDS}})
    return Response.json({ok:true,revision_id:revision.id,action_id:actionId,status:'pending_owner_approval',revision_policy:{...revisionPolicy,used_rounds:roundNumber,remaining_rounds:MAX_INCLUDED_CLIENT_REVISION_ROUNDS-roundNumber,open_round:true}},{headers})
  }

  if(openRevisions.length) return Response.json({ok:false,error:'revision_pending',revision_policy:revisionPolicy},{status:409,headers})
  if(job.qa_report?.passed!==true) return Response.json({ok:false,error:'qa_not_passed'},{status:409,headers})
  if(project.payment_state!=='paid'||Number(project.paid_amount)<Number(project.agreed_price)) return Response.json({ok:false,error:'payment_not_verified'},{status:409,headers})
  const approvedAt=now()
  const releasePayload={project_id:project.id,fulfillment_job_id:job.id,artifact_id:artifact.id,status:'client_approved',qa_passed:true,qa_report:job.qa_report||{},payment_verified_at:approvedAt,client_approved_at:approvedAt,updated_at:approvedAt,metadata:{preview_version:artifact.version,revision_rounds_used:usedRounds,included_revision_limit:MAX_INCLUDED_CLIENT_REVISION_ROUNDS}}
  const {data:candidate,error:releaseError}=await db.from('project_release_candidates').upsert(releasePayload,{onConflict:'project_id,artifact_id'}).select('id,status').single()
  if(releaseError||!candidate) return Response.json({ok:false,error:'release_candidate_failed'},{status:500,headers})
  await db.from('project_generated_artifacts').update({status:'approved',approved_at:approvedAt,rejected_at:null,updated_at:approvedAt}).eq('id',artifact.id)
  await db.from('projects').update({revision_status:'approved',status:'review',current_milestone:'client_approved',next_action:'owner_release_approval',updated_at:approvedAt}).eq('id',project.id)
  const {data:existingReleaseAction}=await db.from('automation_actions').select('id').eq('action_type','approve_paid_project_release').eq('entity_type','project').eq('entity_id',project.id).in('status',['pending','approved','executing']).limit(1)
  let releaseActionId=existingReleaseAction?.[0]?.id||null
  if(!releaseActionId){const {data:queued}=await db.from('automation_actions').insert({action_type:'approve_paid_project_release',entity_type:'project',entity_id:project.id,title:`Approve production release for ${project.client_name}`,summary:'Client approved the QA-passed preview and payment is verified. Owner approval is still required before the release can become deployment-ready.',risk_level:'approval',status:'pending',proposed_by:'client_review',payload:{project_id:project.id,fulfillment_job_id:job.id,artifact_id:artifact.id,release_candidate_id:candidate.id,external_effect:'mark_release_ready_only',production_deploy_requires_separate_switch:true}}).select('id').single();releaseActionId=queued?.id||null}
  await db.from('activity').insert({entity_type:'project',entity_id:project.id,action:'client_preview_approved',detail:{artifact_id:artifact.id,release_candidate_id:candidate.id,release_action_id:releaseActionId,revision_rounds_used:usedRounds}})
  return Response.json({ok:true,approved:true,release_candidate_id:candidate.id,owner_action_id:releaseActionId,production_deployed:false,revision_policy:revisionPolicy},{headers})
})
