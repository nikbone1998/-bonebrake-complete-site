import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const OWNER='bonebrakewebsitedesign@gmail.com'
const clean=(v:unknown,max=500)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)
const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const now=()=>new Date().toISOString()

function randomToken(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST') return Response.json({ok:false,error:'method_not_allowed'},{status:405})
  const auth=req.headers.get('authorization')||''
  const token=auth.startsWith('Bearer ')?auth.slice(7):''
  if(!token) return Response.json({ok:false,error:'authentication_required'},{status:401})

  const url=Deno.env.get('SUPABASE_URL')
  const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')['default']
  const publishable=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}')['default']
  if(!url||!secret||!publishable) return Response.json({ok:false,error:'server_configuration_error'},{status:500})
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error:userError}=await db.auth.getUser(token)
  if(userError||!user||String(user.email||'').toLowerCase()!==OWNER) return Response.json({ok:false,error:'owner_only'},{status:403})

  let body:Record<string,unknown>
  try{body=await req.json()}catch{return Response.json({ok:false,error:'invalid_json'},{status:400})}
  const actionId=clean(body.action_id,80)
  if(!uuidRe.test(actionId)) return Response.json({ok:false,error:'valid_action_id_required'},{status:400})

  const [{data:settings,error:settingsError},{data:action,error:actionError}]=await Promise.all([
    db.from('automation_settings').select('*').eq('key','global').single(),
    db.from('automation_actions').select('*').eq('id',actionId).single()
  ])
  if(settingsError||actionError||!action) return Response.json({ok:false,error:'action_or_settings_unavailable'},{status:404})
  if(action.status==='completed') return Response.json({ok:true,already_completed:true,action_id:action.id,result:action.result||null})
  if(action.status!=='approved') return Response.json({ok:false,error:'action_not_approved',status:action.status},{status:409})
  if(!settings.autopilot_enabled) return Response.json({ok:false,error:'autopilot_disabled'},{status:423})
  if(['run_prospect_audit','promote_prospect_to_crm'].includes(action.action_type)&&!settings.prospecting_enabled) return Response.json({ok:false,error:'prospecting_disabled'},{status:423})
  if(['start_paid_project_fulfillment','prepare_paid_project_build'].includes(action.action_type)&&!settings.fulfillment_enabled) return Response.json({ok:false,error:'fulfillment_disabled'},{status:423})

  const {data:claimed,error:claimError}=await db.from('automation_actions').update({status:'executing',updated_at:now(),error_message:null}).eq('id',action.id).eq('status','approved').select('*').maybeSingle()
  if(claimError||!claimed) return Response.json({ok:false,error:'action_already_claimed'},{status:409})

  const complete=async(result:Record<string,unknown>)=>{
    await db.from('automation_actions').update({status:'completed',result,executed_at:now(),updated_at:now()}).eq('id',claimed.id).eq('status','executing')
    return Response.json({ok:true,action_id:claimed.id,status:'completed',result},{headers:{'Cache-Control':'no-store'}})
  }

  try{
    if(claimed.action_type==='run_prospect_audit'){
      const candidateId=claimed.entity_id||claimed.payload?.candidate_id
      if(!candidateId) throw new Error('candidate_id_missing')
      const {data:candidate,error:candidateError}=await db.from('prospect_candidates').select('*').eq('id',candidateId).single()
      if(candidateError||!candidate) throw new Error('prospect_not_found')
      if(!['A','B'].includes(candidate.qualification_tier)) throw new Error('prospect_not_qualified')
      if(!candidate.website) throw new Error('prospect_website_missing')
      const auditRes=await fetch(`${url}/functions/v1/audit-run`,{method:'POST',headers:{'Content-Type':'application/json','apikey':publishable},body:JSON.stringify({url:candidate.website,requested_by:OWNER,source:'autopilot',medium:'prospect_audit'})})
      const audit=await auditRes.json().catch(()=>({}))
      if(!auditRes.ok||audit?.ok!==true||!audit?.audit_id) throw new Error(clean(audit?.error||'audit_failed',160))
      await db.from('prospect_candidates').update({audit_id:audit.audit_id,status:'audited',last_checked_at:now(),updated_at:now()}).eq('id',candidate.id)
      let promotionQueued=false
      const {data:ready}=await db.from('prospect_ready_for_promotion').select('*').eq('candidate_id',candidate.id).maybeSingle()
      if(ready){
        const {data:existing}=await db.from('automation_actions').select('id').eq('action_type','promote_prospect_to_crm').eq('entity_type','prospect_candidate').eq('entity_id',candidate.id).in('status',['pending','approved']).limit(1)
        if(!existing?.length){
          const {error:qError}=await db.from('automation_actions').insert({action_type:'promote_prospect_to_crm',entity_type:'prospect_candidate',entity_id:candidate.id,title:`Promote ${candidate.company_name} to sales lead`,summary:`Audit passed · combined score ${ready.combined_score} · Tier ${candidate.qualification_tier}`,risk_level:'approval',status:'pending',proposed_by:'autopilot_executor',payload:{candidate_id:candidate.id,company_name:candidate.company_name,website:candidate.website,contact_name:candidate.contact_name,email:candidate.email,phone:candidate.phone,source_system:candidate.source_system,discovery_score:candidate.discovery_score,audit_opportunity_score:ready.audit_opportunity_score,combined_score:ready.combined_score,qualification_tier:candidate.qualification_tier,external_effect:'crm_promotion_only'}})
          promotionQueued=!qError
        }
      }
      return await complete({audit_id:audit.audit_id,opportunity_score:audit?.heuristic?.opportunity_score??audit?.summary?.opportunity_score??null,promotion_queued:promotionQueued})
    }

    if(claimed.action_type==='promote_prospect_to_crm'){
      const candidateId=claimed.entity_id||claimed.payload?.candidate_id
      if(!candidateId) throw new Error('candidate_id_missing')
      const {data:ready,error:readyError}=await db.from('prospect_ready_for_promotion').select('*').eq('candidate_id',candidateId).single()
      if(readyError||!ready) throw new Error('prospect_no_longer_ready_for_promotion')
      const email=String(ready.email||'').toLowerCase()
      if(!email.includes('@')) throw new Error('valid_email_required')
      const {data:candidate,error:candidateError}=await db.from('prospect_candidates').select('*').eq('id',candidateId).single()
      if(candidateError||!candidate) throw new Error('prospect_not_found')
      let leadId:string|null=candidate.lead_id||null
      if(!leadId){const {data:existing}=await db.from('leads').select('id').eq('email',email).order('created_at',{ascending:true}).limit(1).maybeSingle();leadId=existing?.id||null}
      if(!leadId){
        const combined=Number(ready.combined_score||0),crmQualification=candidate.qualification_tier==='A'?'high':'medium'
        const {data:lead,error:leadError}=await db.from('leads').insert({name:candidate.contact_name||candidate.company_name,email,phone:candidate.phone||null,company:candidate.company_name,website:candidate.website||null,source:`prospecting:${candidate.source_system}`,status:'qualified',priority:combined>=80?'high':'normal',estimated_value:0,opportunity_score:combined,qualification:crmQualification,next_action:'prepare_preview',notes:`Promoted after owner-approved prospect qualification and completed website audit. Prospect tier ${candidate.qualification_tier}.`}).select('id').single()
        if(leadError||!lead) throw new Error('lead_persistence_failed');leadId=lead.id
      }
      await db.from('prospect_candidates').update({lead_id:leadId,promoted_at:now(),status:'promoted',updated_at:now()}).eq('id',candidate.id)
      if(candidate.audit_id) await db.from('audits').update({lead_id:leadId}).eq('id',candidate.audit_id).is('lead_id',null)
      await db.from('activity').insert({entity_type:'lead',entity_id:leadId,action:'prospect_promoted',detail:{candidate_id:candidate.id,combined_score:ready.combined_score,tier:candidate.qualification_tier}})
      return await complete({lead_id:leadId,combined_score:ready.combined_score,qualification_tier:candidate.qualification_tier})
    }

    if(claimed.action_type==='start_paid_project_fulfillment'){
      const projectId=claimed.entity_id||claimed.payload?.project_id
      if(!projectId||!uuidRe.test(String(projectId))) throw new Error('valid_project_id_required')
      const {data:project,error:projectError}=await db.from('projects').select('*').eq('id',projectId).single()
      if(projectError||!project) throw new Error('project_not_found')
      if(project.status==='cancelled') throw new Error('project_cancelled')
      if(project.payment_state!=='paid') throw new Error('project_not_fully_paid')
      if(Number(project.paid_amount)<Number(project.agreed_price)) throw new Error('project_paid_amount_below_agreed_price')
      const {data:lead}=project.lead_id?await db.from('leads').select('*').eq('id',project.lead_id).maybeSingle():{data:null}
      const email=clean(lead?.email,254).toLowerCase()||null

      let intake:any=null
      const {data:existingIntake}=await db.from('client_intake_requests').select('*').eq('project_id',project.id).in('status',['pending','sent','submitted']).order('created_at',{ascending:false}).limit(1).maybeSingle()
      intake=existingIntake||null
      if(!intake){
        const placeholderHash=await sha256(`pending:${crypto.randomUUID()}`)
        const {data:newIntake,error:intakeError}=await db.from('client_intake_requests').insert({project_id:project.id,lead_id:project.lead_id||null,client_email:email,token_hash:placeholderHash,status:'pending',expires_at:new Date(Date.now()+7*24*60*60*1000).toISOString(),metadata:{source:'autopilot_executor',package_key:project.project_type||null,delivery_issued:false}}).select('*').single()
        if(intakeError||!newIntake) throw new Error('intake_request_creation_failed');intake=newIntake
      }

      let job:any=null
      const {data:existingJob}=await db.from('project_fulfillment_jobs').select('*').eq('project_id',project.id).in('status',['waiting_intake','intake_ready','queued','generating','generated','qa','ready_for_review','approved','release_queued','blocked']).order('created_at',{ascending:false}).limit(1).maybeSingle()
      job=existingJob||null
      if(!job){
        const {data:newJob,error:jobError}=await db.from('project_fulfillment_jobs').insert({project_id:project.id,lead_id:project.lead_id||null,intake_request_id:intake.id,status:intake.status==='submitted'?'intake_ready':'waiting_intake',build_profile:'paid_client_v1',requirements_snapshot:{package_key:project.project_type||null,agreed_price:Number(project.agreed_price),paid_amount:Number(project.paid_amount)}}).select('*').single()
        if(jobError||!newJob) throw new Error('fulfillment_job_creation_failed');job=newJob
      }

      const checklist=[['client_intake','Client intake completed','onboarding'],['build_generation','Website build generated','build']].map(([item_key,label,category])=>({project_id:project.id,item_key,label,category,status:'pending'}))
      const {error:checkError}=await db.from('project_checklist').upsert(checklist,{onConflict:'project_id,item_key',ignoreDuplicates:true})
      if(checkError) throw new Error('project_checklist_seed_failed')
      const {error:projectUpdateError}=await db.from('projects').update({status:'active',content_status:intake.status==='submitted'?'in_progress':'waiting_client',current_milestone:intake.status==='submitted'?'intake_ready':'client_intake',next_action:intake.status==='submitted'?'prepare_fulfillment_build':'await_client_intake',updated_at:now()}).eq('id',project.id)
      if(projectUpdateError) throw new Error('project_activation_failed')

      let intakeToken:string|null=null,intakeUrl:string|null=null
      if(intake.status==='pending'){
        intakeToken=randomToken();const tokenHash=await sha256(intakeToken);const expiresAt=new Date(Date.now()+7*24*60*60*1000).toISOString()
        const {error:tokenError}=await db.from('client_intake_requests').update({token_hash:tokenHash,expires_at:expiresAt,updated_at:now(),metadata:{...(intake.metadata||{}),delivery_issued:true,delivery_issued_at:now()}}).eq('id',intake.id).eq('status','pending')
        if(tokenError) throw new Error('intake_token_issue_failed')
        intake.expires_at=expiresAt
        intakeUrl=`https://bwdnorth.com/client-intake.html?t=${encodeURIComponent(intakeToken)}`
      }

      await db.from('activity').insert({entity_type:'project',entity_id:project.id,action:'paid_fulfillment_started',detail:{fulfillment_job_id:job.id,intake_request_id:intake.id,intake_status:intake.status}})
      return await complete({project_id:project.id,fulfillment_job_id:job.id,intake_request_id:intake.id,intake_status:intake.status,intake_token:intakeToken,intake_url:intakeUrl,intake_expires_at:intake.expires_at,next_stage:intake.status==='submitted'?'intake_ready':'waiting_client_intake',production_release_authorized:false})
    }

    if(claimed.action_type==='prepare_paid_project_build'){
      const projectId=claimed.entity_id||claimed.payload?.project_id
      if(!projectId||!uuidRe.test(String(projectId))) throw new Error('valid_project_id_required')
      const {data:project,error:projectError}=await db.from('projects').select('*').eq('id',projectId).single()
      if(projectError||!project) throw new Error('project_not_found')
      if(project.payment_state!=='paid') throw new Error('project_not_fully_paid')
      const {data:intake,error:intakeError}=await db.from('client_intake_requests').select('*').eq('project_id',project.id).eq('status','submitted').order('submitted_at',{ascending:false}).limit(1).maybeSingle()
      if(intakeError||!intake) throw new Error('submitted_client_intake_required')
      const {data:job,error:jobError}=await db.from('project_fulfillment_jobs').select('*').eq('project_id',project.id).in('status',['intake_ready','queued','blocked']).order('created_at',{ascending:false}).limit(1).maybeSingle()
      if(jobError||!job) throw new Error('fulfillment_job_not_ready')
      const a=intake.answers||{}
      const generationSpec={version:1,mode:'paid_client_preview',package_key:project.project_type||'website_rebuild',business_name:clean(a.business_name,200)||project.client_name,primary_goal:clean(a.primary_goal,4000),services:clean(a.services,4000),target_customer:clean(a.target_customer,4000),style_direction:clean(a.style_direction,4000),requested_pages:clean(a.pages,4000),contact_details:clean(a.contact_details,4000),assets_notes:clean(a.assets_notes,4000),domain_notes:clean(a.domain_notes,4000),additional_notes:clean(a.additional_notes,4000),quality_requirements:['responsive','accessible','performance_review','forms_verified','seo_metadata','social_metadata'],safety:{preview_only:true,production_release_authorized:false,customer_data_minimized:true},repository:{strategy:'dedicated_client_workspace',production_branch_protected:true}}
      const {error:updateError}=await db.from('project_fulfillment_jobs').update({status:'queued',generation_spec:generationSpec,updated_at:now(),failure_code:null,failure_message:null}).eq('id',job.id).in('status',['intake_ready','queued','blocked'])
      if(updateError) throw new Error('fulfillment_job_queue_failed')
      await db.from('projects').update({current_milestone:'build_queued',next_action:'generate_paid_project_build',updated_at:now()}).eq('id',project.id)
      const {data:existing}=await db.from('automation_actions').select('id').eq('action_type','generate_paid_project_build').eq('entity_type','project').eq('entity_id',project.id).in('status',['pending','approved','executing']).limit(1)
      let generationActionId=existing?.[0]?.id||null
      if(!generationActionId){
        const {data:created,error:createError}=await db.from('automation_actions').insert({action_type:'generate_paid_project_build',entity_type:'project',entity_id:project.id,title:`Generate website preview for ${generationSpec.business_name}`,summary:'Build specification is ready. Generate the client website in preview-only mode and run QA before any release.',risk_level:'approval',status:'pending',proposed_by:'autopilot_executor',payload:{project_id:project.id,fulfillment_job_id:job.id,external_effect:'preview_generation_only',production_release_authorized:false}}).select('id').single()
        if(createError||!created) throw new Error('generation_action_queue_failed');generationActionId=created.id
      }
      await db.from('activity').insert({entity_type:'project',entity_id:project.id,action:'paid_build_prepared',detail:{fulfillment_job_id:job.id,generation_action_id:generationActionId}})
      return await complete({project_id:project.id,fulfillment_job_id:job.id,generation_action_id:generationActionId,job_status:'queued',production_release_authorized:false})
    }

    throw new Error('unsupported_action_type')
  }catch(error){
    const message=clean(error instanceof Error?error.message:'execution_failed',500)
    await db.from('automation_actions').update({status:'failed',error_message:message,result:{error:message},updated_at:now()}).eq('id',claimed.id).eq('status','executing')
    return Response.json({ok:false,error:message,action_id:claimed.id},{status:500,headers:{'Cache-Control':'no-store'}})
  }
})
