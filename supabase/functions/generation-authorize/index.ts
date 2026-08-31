import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const clean=(v:unknown,max=500)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)
const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const now=()=>new Date().toISOString()
async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST') return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers})
  const url=Deno.env.get('SUPABASE_URL'),secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')['default']
  if(!url||!secret) return Response.json({ok:false,error:'server_configuration_error'},{status:500,headers})
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
  let body:any
  try{body=await req.json()}catch{return Response.json({ok:false,error:'invalid_json'},{status:400,headers})}
  const workerToken=clean(body?.worker_token,200),actionId=clean(body?.action_id,80),jobId=clean(body?.fulfillment_job_id,80)
  if(workerToken.length<32||workerToken.length>120||!uuidRe.test(actionId)||!uuidRe.test(jobId)) return Response.json({ok:false,error:'invalid_worker_authorization'},{status:404,headers})
  const tokenHash=await sha256(workerToken)
  const {data:row}=await db.from('generation_worker_tokens').select('*').eq('token_hash',tokenHash).eq('action_id',actionId).eq('fulfillment_job_id',jobId).maybeSingle()
  if(!row||row.status!=='issued') return Response.json({ok:false,error:'worker_authorization_unavailable'},{status:404,headers})
  if(new Date(row.expires_at).getTime()<Date.now()){
    await db.from('generation_worker_tokens').update({status:'expired'}).eq('id',row.id).eq('status','issued')
    return Response.json({ok:false,error:'worker_authorization_expired'},{status:410,headers})
  }
  const [{data:settings},{data:action},{data:job}]=await Promise.all([
    db.from('automation_settings').select('autopilot_enabled,fulfillment_enabled,production_deploy_enabled').eq('key','global').maybeSingle(),
    db.from('automation_actions').select('id,action_type,status,entity_id').eq('id',actionId).maybeSingle(),
    db.from('project_fulfillment_jobs').select('id,project_id,status,generation_spec').eq('id',jobId).maybeSingle()
  ])
  if(!settings?.autopilot_enabled||!settings?.fulfillment_enabled) return Response.json({ok:false,error:'fulfillment_disabled'},{status:423,headers})
  if(!action||action.action_type!=='generate_paid_project_build'||action.status!=='executing') return Response.json({ok:false,error:'action_not_executing'},{status:409,headers})
  if(!job||job.project_id!==row.project_id||!['queued','generating'].includes(job.status)) return Response.json({ok:false,error:'job_not_ready'},{status:409,headers})
  const {data:project}=await db.from('projects').select('id,client_name,project_type,payment_state,agreed_price,paid_amount').eq('id',row.project_id).maybeSingle()
  if(!project||project.payment_state!=='paid'||Number(project.paid_amount)<Number(project.agreed_price)) return Response.json({ok:false,error:'paid_project_required'},{status:409,headers})

  const {data:claimed,error:claimError}=await db.from('generation_worker_tokens').update({status:'claimed',claimed_at:now(),claim_count:1}).eq('id',row.id).eq('status','issued').select('id').maybeSingle()
  if(claimError||!claimed) return Response.json({ok:false,error:'worker_authorization_already_claimed'},{status:409,headers})

  return Response.json({
    ok:true,
    authorization:{action_id:actionId,project_id:project.id,fulfillment_job_id:job.id,preview_only:true,production_release_authorized:false},
    project:{client_name:project.client_name,project_type:project.project_type},
    generation_spec:job.generation_spec||{}
  },{headers})
})
