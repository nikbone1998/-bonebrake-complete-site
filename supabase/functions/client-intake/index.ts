import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const clean=(v:unknown,max=1000)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)
const now=()=>new Date().toISOString()
const allowedOrigins=new Set(['https://bwdnorth.com','https://www.bwdnorth.com'])

async function sha256(value:string){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')
}
function cors(req:Request){
  const origin=req.headers.get('origin')||''
  return {
    'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://bwdnorth.com',
    'Access-Control-Allow-Headers':'content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json'
  }
}

Deno.serve(async(req:Request)=>{
  const headers=cors(req)
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers})
  if(req.method!=='POST') return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers})

  const url=Deno.env.get('SUPABASE_URL')
  const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')['default']
  if(!url||!secret) return Response.json({ok:false,error:'server_configuration_error'},{status:500,headers})
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})

  let body:any
  try{body=await req.json()}catch{return Response.json({ok:false,error:'invalid_json'},{status:400,headers})}
  const token=clean(body?.token,200)
  const action=clean(body?.action,40)||'read'
  if(token.length<32||token.length>120) return Response.json({ok:false,error:'invalid_or_expired_link'},{status:404,headers})
  if(!['read','submit'].includes(action)) return Response.json({ok:false,error:'unsupported_action'},{status:400,headers})

  const tokenHash=await sha256(token)
  const {data:intake,error:intakeError}=await db.from('client_intake_requests').select('*').eq('token_hash',tokenHash).maybeSingle()
  if(intakeError||!intake) return Response.json({ok:false,error:'invalid_or_expired_link'},{status:404,headers})
  if(intake.status==='cancelled') return Response.json({ok:false,error:'intake_cancelled'},{status:410,headers})
  if(new Date(intake.expires_at).getTime()<Date.now()&&intake.status!=='submitted'){
    await db.from('client_intake_requests').update({status:'expired',updated_at:now()}).eq('id',intake.id).in('status',['pending','sent'])
    return Response.json({ok:false,error:'intake_expired'},{status:410,headers})
  }

  const {data:project}=await db.from('projects').select('id,client_name,project_type,status,payment_state').eq('id',intake.project_id).maybeSingle()
  if(!project||project.payment_state!=='paid') return Response.json({ok:false,error:'project_unavailable'},{status:409,headers})

  const questions=[
    {key:'business_name',label:'Business name',type:'text',required:true},
    {key:'primary_goal',label:'What is the main goal of the new website?',type:'textarea',required:true},
    {key:'services',label:'What services or products should the website focus on?',type:'textarea',required:true},
    {key:'target_customer',label:'Who is your ideal customer?',type:'textarea',required:true},
    {key:'style_direction',label:'What should the website feel like? Include colors, examples, or styles you like.',type:'textarea',required:true},
    {key:'pages',label:'Any specific pages you know you need?',type:'textarea',required:false},
    {key:'contact_details',label:'What phone, email, address, or contact details should appear?',type:'textarea',required:false},
    {key:'assets_notes',label:'Tell us about logos, photos, copy, or other assets you already have.',type:'textarea',required:false},
    {key:'domain_notes',label:'Anything we should know about your current domain or hosting?',type:'textarea',required:false},
    {key:'additional_notes',label:'Anything else we should know?',type:'textarea',required:false}
  ]

  if(action==='read'){
    return Response.json({ok:true,project:{client_name:project.client_name,project_type:project.project_type},status:intake.status,questions,submitted:intake.status==='submitted'},{headers})
  }

  if(intake.status==='submitted') return Response.json({ok:true,already_submitted:true},{headers})
  const answers=body?.answers
  if(!answers||typeof answers!=='object'||Array.isArray(answers)) return Response.json({ok:false,error:'answers_required'},{status:400,headers})
  const encoded=new TextEncoder().encode(JSON.stringify(answers))
  if(encoded.byteLength>40000) return Response.json({ok:false,error:'answers_too_large'},{status:413,headers})

  const normalized:Record<string,string>={}
  for(const q of questions){
    const value=clean(answers[q.key],q.key==='business_name'?200:4000)
    if(q.required&&!value) return Response.json({ok:false,error:`required_${q.key}`},{status:422,headers})
    if(value) normalized[q.key]=value
  }

  const submittedAt=now()
  const {error:submitError}=await db.from('client_intake_requests').update({status:'submitted',answers:normalized,submitted_at:submittedAt,updated_at:submittedAt}).eq('id',intake.id).in('status',['pending','sent'])
  if(submitError) return Response.json({ok:false,error:'intake_submission_failed'},{status:500,headers})

  const {data:job}=await db.from('project_fulfillment_jobs').select('*').eq('project_id',project.id).eq('intake_request_id',intake.id).order('created_at',{ascending:false}).limit(1).maybeSingle()
  if(job){
    await db.from('project_fulfillment_jobs').update({
      status:'intake_ready',updated_at:submittedAt,
      requirements_snapshot:{...(job.requirements_snapshot||{}),intake_answers:normalized,intake_submitted_at:submittedAt}
    }).eq('id',job.id).in('status',['waiting_intake','blocked'])
  }

  await db.from('project_checklist').update({status:'complete',completed_at:submittedAt,updated_at:submittedAt}).eq('project_id',project.id).eq('item_key','client_intake')
  await db.from('projects').update({content_status:'in_progress',current_milestone:'intake_ready',next_action:'prepare_fulfillment_build',updated_at:submittedAt}).eq('id',project.id)
  await db.from('activity').insert({entity_type:'project',entity_id:project.id,action:'client_intake_submitted',detail:{intake_request_id:intake.id,fulfillment_job_id:job?.id||null}})

  const {data:existing}=await db.from('automation_actions').select('id').eq('action_type','prepare_paid_project_build').eq('entity_type','project').eq('entity_id',project.id).in('status',['pending','approved','executing']).limit(1)
  if(!existing?.length){
    await db.from('automation_actions').insert({
      action_type:'prepare_paid_project_build',entity_type:'project',entity_id:project.id,
      title:`Prepare build for ${normalized.business_name||project.client_name}`,
      summary:'Client intake is complete. Prepare the paid project build specification and generation queue.',
      risk_level:'approval',status:'pending',proposed_by:'client_intake',
      payload:{project_id:project.id,fulfillment_job_id:job?.id||null,intake_request_id:intake.id,external_effect:'prepare_build_only'}
    })
  }

  return Response.json({ok:true,submitted:true,next_stage:'build_preparation'},{headers})
})
