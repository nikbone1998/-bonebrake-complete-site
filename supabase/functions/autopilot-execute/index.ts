import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const OWNER='bonebrakewebsitedesign@gmail.com'
const clean=(v:unknown,max=500)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)
const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
  if(['run_prospect_audit','promote_prospect_to_crm'].includes(action.action_type)&&!settings.prospecting_enabled)
    return Response.json({ok:false,error:'prospecting_disabled'},{status:423})

  const now=new Date().toISOString()
  const {data:claimed,error:claimError}=await db.from('automation_actions')
    .update({status:'executing',updated_at:now,error_message:null})
    .eq('id',action.id).eq('status','approved').select('*').maybeSingle()
  if(claimError||!claimed) return Response.json({ok:false,error:'action_already_claimed'},{status:409})

  try{
    if(claimed.action_type==='run_prospect_audit'){
      const candidateId=claimed.entity_id||claimed.payload?.candidate_id
      if(!candidateId) throw new Error('candidate_id_missing')
      const {data:candidate,error:candidateError}=await db.from('prospect_candidates').select('*').eq('id',candidateId).single()
      if(candidateError||!candidate) throw new Error('prospect_not_found')
      if(!['A','B'].includes(candidate.qualification_tier)) throw new Error('prospect_not_qualified')
      if(!candidate.website) throw new Error('prospect_website_missing')

      const auditRes=await fetch(`${url}/functions/v1/audit-run`,{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':publishable},
        body:JSON.stringify({url:candidate.website,requested_by:OWNER,source:'autopilot',medium:'prospect_audit'})
      })
      const audit=await auditRes.json().catch(()=>({}))
      if(!auditRes.ok||audit?.ok!==true||!audit?.audit_id) throw new Error(clean(audit?.error||'audit_failed',160))

      await db.from('prospect_candidates').update({audit_id:audit.audit_id,status:'audited',last_checked_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',candidate.id)

      let promotionQueued=false
      const {data:ready}=await db.from('prospect_ready_for_promotion').select('*').eq('candidate_id',candidate.id).maybeSingle()
      if(ready){
        const {data:existing}=await db.from('automation_actions').select('id').eq('action_type','promote_prospect_to_crm').eq('entity_type','prospect_candidate').eq('entity_id',candidate.id).in('status',['pending','approved']).limit(1)
        if(!existing?.length){
          const {error:qError}=await db.from('automation_actions').insert({
            action_type:'promote_prospect_to_crm',entity_type:'prospect_candidate',entity_id:candidate.id,
            title:`Promote ${candidate.company_name} to sales lead`,
            summary:`Audit passed · combined score ${ready.combined_score} · Tier ${candidate.qualification_tier}`,
            risk_level:'approval',status:'pending',proposed_by:'autopilot_executor',
            payload:{candidate_id:candidate.id,company_name:candidate.company_name,website:candidate.website,contact_name:candidate.contact_name,email:candidate.email,phone:candidate.phone,source_system:candidate.source_system,discovery_score:candidate.discovery_score,audit_opportunity_score:ready.audit_opportunity_score,combined_score:ready.combined_score,qualification_tier:candidate.qualification_tier,external_effect:'crm_promotion_only'}
          })
          promotionQueued=!qError
        }
      }

      const result={audit_id:audit.audit_id,opportunity_score:audit?.heuristic?.opportunity_score??audit?.summary?.opportunity_score??null,promotion_queued:promotionQueued}
      await db.from('automation_actions').update({status:'completed',result,executed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',claimed.id).eq('status','executing')
      return Response.json({ok:true,action_id:claimed.id,status:'completed',result},{headers:{'Cache-Control':'no-store'}})
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
      if(!leadId){
        const {data:existing}=await db.from('leads').select('id').eq('email',email).order('created_at',{ascending:true}).limit(1).maybeSingle()
        leadId=existing?.id||null
      }
      if(!leadId){
        const combined=Number(ready.combined_score||0)
        const crmQualification=candidate.qualification_tier==='A'?'high':'medium'
        const {data:lead,error:leadError}=await db.from('leads').insert({
          name:candidate.contact_name||candidate.company_name,
          email,phone:candidate.phone||null,company:candidate.company_name,website:candidate.website||null,
          source:`prospecting:${candidate.source_system}`,
          status:'qualified',priority:combined>=80?'high':'normal',estimated_value:0,
          opportunity_score:combined,qualification:crmQualification,next_action:'prepare_preview',
          notes:`Promoted after owner-approved prospect qualification and completed website audit. Prospect tier ${candidate.qualification_tier}.`
        }).select('id').single()
        if(leadError||!lead) throw new Error('lead_persistence_failed')
        leadId=lead.id
      }

      await db.from('prospect_candidates').update({lead_id:leadId,promoted_at:new Date().toISOString(),status:'promoted',updated_at:new Date().toISOString()}).eq('id',candidate.id)
      if(candidate.audit_id) await db.from('audits').update({lead_id:leadId}).eq('id',candidate.audit_id).is('lead_id',null)
      await db.from('activity').insert({entity_type:'lead',entity_id:leadId,action:'prospect_promoted',detail:{candidate_id:candidate.id,combined_score:ready.combined_score,tier:candidate.qualification_tier}})

      const result={lead_id:leadId,combined_score:ready.combined_score,qualification_tier:candidate.qualification_tier}
      await db.from('automation_actions').update({status:'completed',result,executed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',claimed.id).eq('status','executing')
      return Response.json({ok:true,action_id:claimed.id,status:'completed',result},{headers:{'Cache-Control':'no-store'}})
    }

    throw new Error('unsupported_action_type')
  }catch(error){
    const message=clean(error instanceof Error?error.message:'execution_failed',500)
    await db.from('automation_actions').update({status:'failed',error_message:message,result:{error:message},updated_at:new Date().toISOString()}).eq('id',claimed.id).eq('status','executing')
    return Response.json({ok:false,error:message,action_id:claimed.id},{status:500,headers:{'Cache-Control':'no-store'}})
  }
})
