import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const OWNER='bonebrakewebsitedesign@gmail.com'
const clean=(v:unknown,max=1000)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)
const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const now=()=>new Date().toISOString()
function randomToken(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function sameSecret(a:string,b:string){if(!a||!b)return false;const[x,y]=await Promise.all([sha256(a),sha256(b)]);return x===y}
function validateHtml(html:string){
  const problems:string[]=[]
  if(typeof html!=='string'||html.length<3000||html.length>180000) problems.push('html_size_invalid')
  if(!/^\s*<!doctype html>/i.test(html)) problems.push('doctype_missing')
  for(const marker of ['<html','<head','<body','name="viewport"']) if(!html.toLowerCase().includes(marker.toLowerCase())) problems.push(`missing_${marker.replace(/[^a-z]/gi,'')}`)
  const forbidden:Array<[RegExp,string]>=[
    [/<(?:iframe|object|embed|base|form)\b/i,'forbidden_element'],[/<script[^>]+\bsrc\s*=/i,'external_script'],[/<link\b/i,'external_link_element'],[/<meta[^>]+http-equiv\s*=/i,'meta_http_equiv'],[/https?:\/\//i,'external_url'],[/(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/i,'network_api'],[/navigator\.sendBeacon/i,'network_api'],[/javascript\s*:/i,'javascript_url'],[/document\.cookie/i,'cookie_access'],[/(?:localStorage|sessionStorage)/i,'browser_storage'],[/(?:\beval|\bFunction)\s*\(/i,'dynamic_code']
  ]
  for(const [pattern,label] of forbidden) if(pattern.test(html)) problems.push(label)
  return [...new Set(problems)]
}
function approvedWorkerUrl(value:unknown){
  const raw=clean(value,500)||'https://bwdnorth.com/api/ai-site-builder'
  try{
    const u=new URL(raw)
    const allowedHost=u.hostname==='bwdnorth.com'||u.hostname==='www.bwdnorth.com'||u.hostname.endsWith('.vercel.app')
    if(u.protocol!=='https:'||!allowedHost||u.pathname!=='/api/ai-site-builder') return null
    u.search='';u.hash='';return u.toString().replace(/\/$/,'')
  }catch{return null}
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST') return Response.json({ok:false,error:'method_not_allowed'},{status:405})
  const url=Deno.env.get('SUPABASE_URL'),secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')['default']
  if(!url||!secret) return Response.json({ok:false,error:'server_configuration_error'},{status:500})
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
  let body:any
  try{body=await req.json()}catch{return Response.json({ok:false,error:'invalid_json'},{status:400})}
  const actionId=clean(body?.action_id,80),retryJobId=clean(body?.retry_job_id,80)
  if(!uuidRe.test(actionId)) return Response.json({ok:false,error:'valid_action_id_required'},{status:400})

  const auth=req.headers.get('authorization')||'',jwt=auth.startsWith('Bearer ')?auth.slice(7):''
  const {data:retrySecretRow}=await db.from('integration_secrets').select('secret_value').eq('key','retry_engine_worker_secret').maybeSingle()
  const retryWorker=await sameSecret(req.headers.get('x-bonebrake-retry-key')||'',String(retrySecretRow?.secret_value||''))
  let owner=false
  if(jwt){const{data:{user}}=await db.auth.getUser(jwt);owner=String(user?.email||'').toLowerCase()===OWNER}
  if(!owner&&!retryWorker) return Response.json({ok:false,error:'owner_or_retry_worker_required'},{status:401})

  const [{data:settings},{data:action}]=await Promise.all([
    db.from('automation_settings').select('*').eq('key','global').maybeSingle(),
    db.from('automation_actions').select('*').eq('id',actionId).maybeSingle()
  ])
  if(!settings||!action) return Response.json({ok:false,error:'action_or_settings_unavailable'},{status:404})
  if(retryWorker){
    if(action.action_type!=='generate_paid_project_build'||!uuidRe.test(retryJobId)) return Response.json({ok:false,error:'retry_context_invalid'},{status:403})
    const{data:retryJob}=await db.from('automation_retry_jobs').select('id,status,action_id,action_type').eq('id',retryJobId).eq('action_id',action.id).eq('action_type',action.action_type).eq('status','dispatching').maybeSingle()
    if(!retryJob) return Response.json({ok:false,error:'retry_context_not_dispatching'},{status:403})
  }
  if(action.status==='completed') return Response.json({ok:true,already_completed:true,action_id:action.id,result:action.result||null})
  if(action.action_type!=='generate_paid_project_build'||action.status!=='approved') return Response.json({ok:false,error:'action_not_approved_for_generation'},{status:409})
  if(!settings.autopilot_enabled) return Response.json({ok:false,error:'autopilot_disabled'},{status:423})
  if(!settings.fulfillment_enabled) return Response.json({ok:false,error:'fulfillment_disabled'},{status:423})
  const workerUrl=approvedWorkerUrl(settings.config?.ai_builder_url)
  if(!workerUrl) return Response.json({ok:false,error:'ai_builder_url_invalid'},{status:500})
  const projectId=action.entity_id||action.payload?.project_id,jobId=action.payload?.fulfillment_job_id
  if(!uuidRe.test(String(projectId||''))||!uuidRe.test(String(jobId||''))) return Response.json({ok:false,error:'generation_targets_invalid'},{status:400})

  const [{data:project},{data:job}]=await Promise.all([
    db.from('projects').select('*').eq('id',projectId).maybeSingle(),
    db.from('project_fulfillment_jobs').select('*').eq('id',jobId).eq('project_id',projectId).maybeSingle()
  ])
  if(!project||project.payment_state!=='paid'||Number(project.paid_amount)<Number(project.agreed_price)) return Response.json({ok:false,error:'paid_project_required'},{status:409})
  if(!job||job.status!=='queued'||!job.generation_spec||Object.keys(job.generation_spec).length===0) return Response.json({ok:false,error:'queued_generation_spec_required'},{status:409})
  if(job.generation_spec?.safety?.production_release_authorized!==false||job.generation_spec?.safety?.preview_only!==true) return Response.json({ok:false,error:'preview_only_spec_required'},{status:409})

  const {data:claimed,error:claimError}=await db.from('automation_actions').update({status:'executing',updated_at:now(),error_message:null}).eq('id',action.id).eq('status','approved').select('id').maybeSingle()
  if(claimError||!claimed) return Response.json({ok:false,error:'action_already_claimed'},{status:409})
  const fail=async(message:string,code='generation_failed')=>{
    const m=clean(message,500)
    await db.from('project_fulfillment_jobs').update({status:'failed',failure_code:code,failure_message:m,updated_at:now()}).eq('id',job.id).in('status',['generating','queued'])
    await db.from('generation_worker_tokens').update({status:'cancelled'}).eq('action_id',action.id).eq('status','issued')
    await db.from('automation_actions').update({status:'failed',error_message:m,result:{error:m},updated_at:now()}).eq('id',action.id).eq('status','executing')
    return Response.json({ok:false,error:m,action_id:action.id},{status:500,headers:{'Cache-Control':'no-store'}})
  }

  const {data:started,error:startError}=await db.from('project_fulfillment_jobs').update({status:'generating',started_at:job.started_at||now(),updated_at:now(),failure_code:null,failure_message:null}).eq('id',job.id).eq('status','queued').select('id').maybeSingle()
  if(startError||!started) return await fail('fulfillment_job_claim_failed','job_claim_failed')

  const workerToken=randomToken(),workerHash=await sha256(workerToken),workerExpires=new Date(Date.now()+5*60*1000).toISOString()
  const {error:tokenError}=await db.from('generation_worker_tokens').insert({action_id:action.id,project_id:project.id,fulfillment_job_id:job.id,token_hash:workerHash,status:'issued',expires_at:workerExpires,metadata:{worker_url:workerUrl,preview_only:true}})
  if(tokenError) return await fail('worker_token_issue_failed','worker_authorization_failed')

  let worker:any
  try{
    const response=await fetch(workerUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({worker_token:workerToken,action_id:action.id,fulfillment_job_id:job.id}),signal:AbortSignal.timeout(112000)})
    worker=await response.json().catch(()=>({}))
    if(!response.ok||worker?.ok!==true) return await fail(worker?.error||`ai_worker_${response.status}`,'ai_worker_failed')
  }catch(error){return await fail(error instanceof Error?error.message:'ai_worker_unreachable','ai_worker_failed')}

  const artifact=worker?.artifact||{},html=String(artifact.html||'')
  const problems=validateHtml(html)
  if(problems.length) return await fail(`generated_site_safety_validation_failed:${problems.join(',')}`,'artifact_safety_failed')
  const contentHash=await sha256(html),previewToken=randomToken(),previewHash=await sha256(previewToken),previewExpires=new Date(Date.now()+30*24*60*60*1000).toISOString()
  const {data:versions}=await db.from('project_generated_artifacts').select('version').eq('fulfillment_job_id',job.id).order('version',{ascending:false}).limit(1)
  const version=Math.max(0,Number(versions?.[0]?.version||0))+1
  const qaNotes=Array.isArray(artifact.qa_notes)?artifact.qa_notes.map((x:any)=>clean(x,500)).filter(Boolean).slice(0,12):[]
  const {data:saved,error:saveError}=await db.from('project_generated_artifacts').insert({project_id:project.id,fulfillment_job_id:job.id,source_action_id:action.id,version,status:'review',title:clean(artifact.title,240),summary:clean(artifact.summary,1200),html,content_sha256:contentHash,qa_notes:qaNotes,preview_token_hash:previewHash,preview_expires_at:previewExpires}).select('id').single()
  if(saveError||!saved) return await fail('generated_artifact_persistence_failed','artifact_persistence_failed')
  const previewUrl=`${url}/functions/v1/project-preview?t=${encodeURIComponent(previewToken)}`
  const qaReport={passed:true,preview_only:true,production_release_authorized:false,content_sha256:contentHash,safety_checks:['self_contained','no_external_urls','no_external_scripts','no_network_apis','no_forms','no_browser_storage'],model:clean(artifact.model,100),notes:qaNotes}
  const finishedAt=now()
  const {error:jobUpdateError}=await db.from('project_fulfillment_jobs').update({status:'ready_for_review',preview_url:previewUrl,generated_at:finishedAt,qa_completed_at:finishedAt,qa_report:qaReport,updated_at:finishedAt}).eq('id',job.id).eq('status','generating')
  if(jobUpdateError) return await fail('fulfillment_job_finalize_failed','job_finalize_failed')
  await db.from('project_checklist').update({status:'complete',completed_at:finishedAt,updated_at:finishedAt}).eq('project_id',project.id).eq('item_key','build_generation')
  await db.from('projects').update({current_milestone:'preview_ready',next_action:'review_generated_preview',updated_at:finishedAt}).eq('id',project.id)

  const {data:existingReview}=await db.from('automation_actions').select('id').eq('action_type','review_paid_project_preview').eq('entity_type','project').eq('entity_id',project.id).in('status',['pending','approved','executing']).limit(1)
  let reviewActionId=existingReview?.[0]?.id||null
  if(!reviewActionId){
    const {data:review,error:reviewError}=await db.from('automation_actions').insert({action_type:'review_paid_project_preview',entity_type:'project',entity_id:project.id,title:`Review generated website for ${project.client_name}`,summary:'The autonomous build passed structural and security QA. Review the private preview before any client review or release step.',risk_level:'approval',status:'pending',proposed_by:'ai_build_worker',payload:{project_id:project.id,fulfillment_job_id:job.id,artifact_id:saved.id,preview_url:previewUrl,content_sha256:contentHash,external_effect:'owner_preview_review_only',production_release_authorized:false}}).select('id').single()
    if(reviewError||!review) return await fail('preview_review_action_queue_failed','review_queue_failed');reviewActionId=review.id
  }
  await db.from('activity').insert({entity_type:'project',entity_id:project.id,action:'ai_preview_generated',detail:{fulfillment_job_id:job.id,artifact_id:saved.id,review_action_id:reviewActionId,content_sha256:contentHash}})
  const result={project_id:project.id,fulfillment_job_id:job.id,artifact_id:saved.id,review_action_id:reviewActionId,preview_url:previewUrl,content_sha256:contentHash,job_status:'ready_for_review',production_release_authorized:false}
  await db.from('automation_actions').update({status:'completed',result,executed_at:finishedAt,updated_at:finishedAt}).eq('id',action.id).eq('status','executing')
  return Response.json({ok:true,action_id:action.id,status:'completed',result},{headers:{'Cache-Control':'no-store'}})
})
