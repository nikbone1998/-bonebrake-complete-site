import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const OWNER='bonebrakewebsitedesign@gmail.com'
const clean=(v:unknown,max=500)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)
const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
const allowedChecks=new Set(['ci_green','vercel_worker_route_ready','ai_runtime_certified','single_customer_checkout_ready','domain_launch_path_ready','auth_security_reviewed'])

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST') return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers})
  const url=Deno.env.get('SUPABASE_URL'),secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')['default']
  if(!url||!secret) return Response.json({ok:false,error:'server_configuration_error'},{status:500,headers})
  const auth=req.headers.get('authorization')||'',jwt=auth.startsWith('Bearer ')?auth.slice(7):''
  if(!jwt) return Response.json({ok:false,error:'owner_auth_required'},{status:401,headers})
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user}}=await db.auth.getUser(jwt)
  if(String(user?.email||'').toLowerCase()!==OWNER) return Response.json({ok:false,error:'owner_auth_required'},{status:401,headers})
  let body:any
  try{body=await req.json()}catch{return Response.json({ok:false,error:'invalid_json'},{status:400,headers})}
  const action=clean(body?.action,40)||'read'
  const planId=clean(body?.plan_id,80)
  if(!uuidRe.test(planId)) return Response.json({ok:false,error:'valid_plan_id_required'},{status:400,headers})

  if(action==='read'||action==='refresh'){
    const {data:readiness,error:rerr}=await db.rpc('phase14_pilot_readiness',{p_plan_id:planId})
    if(rerr) return Response.json({ok:false,error:'pilot_readiness_failed'},{status:500,headers})
    const [{data:plan},{data:settings}]=await Promise.all([
      db.from('pilot_activation_plans').select('*').eq('id',planId).maybeSingle(),
      db.from('automation_settings').select('external_effects_locked,pilot_mode_enabled,pilot_active_plan_id,autopilot_enabled,prospecting_enabled,outreach_enabled,auto_reply_enabled,payments_enabled,fulfillment_enabled,production_deploy_enabled,monitoring_enabled,retry_engine_enabled,executive_brief_enabled,domain_onboarding_enabled').eq('key','global').maybeSingle()
    ])
    return Response.json({ok:true,plan,settings,readiness},{headers})
  }

  if(action==='mark_check'){
    const check=clean(body?.check,80),value=body?.value===true,evidence=clean(body?.evidence,1200)
    if(!allowedChecks.has(check)) return Response.json({ok:false,error:'unsupported_check'},{status:400,headers})
    const patch:any={[check]:value,updated_at:new Date().toISOString()}
    const {data:plan,error}=await db.from('pilot_activation_plans').update(patch).eq('id',planId).in('status',['prepared','blocked','ready']).select('id').maybeSingle()
    if(error||!plan) return Response.json({ok:false,error:'pilot_check_update_failed'},{status:409,headers})
    await db.from('pilot_activation_events').insert({plan_id:planId,event_type:'readiness_check_updated',detail:{check,value,evidence:evidence||null}})
    const {data:readiness}=await db.rpc('phase14_pilot_readiness',{p_plan_id:planId})
    return Response.json({ok:true,plan_id:planId,check,value,readiness},{headers})
  }

  if(action==='arm'){
    const {data:readiness,error:rerr}=await db.rpc('phase14_pilot_readiness',{p_plan_id:planId})
    if(rerr||readiness?.ready!==true) return Response.json({ok:false,error:'pilot_not_ready',blockers:readiness?.blockers||[]},{status:409,headers})
    const now=new Date().toISOString()
    const {data:plan,error}=await db.from('pilot_activation_plans').update({status:'armed',armed_at:now,owner_approved_at:now,updated_at:now}).eq('id',planId).eq('status','ready').select('*').maybeSingle()
    if(error||!plan) return Response.json({ok:false,error:'pilot_arm_failed'},{status:409,headers})
    const {data:existing}=await db.from('automation_actions').select('id').eq('action_type','activate_single_customer_pilot').eq('entity_type','pilot_activation_plan').eq('entity_id',planId).in('status',['pending','approved','executing']).limit(1)
    let activationActionId=existing?.[0]?.id||null
    if(!activationActionId){
      const {data:created,error:aerr}=await db.from('automation_actions').insert({action_type:'activate_single_customer_pilot',entity_type:'pilot_activation_plan',entity_id:planId,title:'Activate first-customer pilot',summary:'Enable payments and fulfillment for exactly one manually acquired customer. Prospecting, outreach, auto-reply, reusable payment-link activation, and production deployment remain disabled.',risk_level:'approval',status:'pending',proposed_by:'pilot_control',payload:{pilot_plan_id:planId,max_paid_projects:1,max_concurrent_projects:1,checkout_mode:'single_customer',external_effect:'enable_single_customer_payments_and_fulfillment'}}).select('id').single()
      if(aerr||!created) return Response.json({ok:false,error:'pilot_activation_action_queue_failed'},{status:500,headers})
      activationActionId=created.id
    }
    await db.from('pilot_activation_events').insert({plan_id:planId,event_type:'pilot_armed',severity:'warning',detail:{activation_action_id:activationActionId}})
    return Response.json({ok:true,status:'armed',activation_action_id:activationActionId},{headers})
  }

  if(action==='activate'){
    const actionId=clean(body?.action_id,80)
    if(!uuidRe.test(actionId)) return Response.json({ok:false,error:'valid_action_id_required'},{status:400,headers})
    const {data,error}=await db.rpc('phase14_activate_single_customer_pilot',{p_plan_id:planId,p_action_id:actionId})
    if(error) return Response.json({ok:false,error:clean(error.message,300)},{status:409,headers})
    return Response.json({ok:true,result:data},{headers})
  }

  if(action==='halt'){
    const reason=clean(body?.reason,500)||'owner_halt'
    const {data,error}=await db.rpc('phase14_halt_single_customer_pilot',{p_plan_id:planId,p_reason:reason})
    if(error) return Response.json({ok:false,error:'pilot_halt_failed'},{status:500,headers})
    return Response.json({ok:true,result:data},{headers})
  }

  return Response.json({ok:false,error:'unsupported_action'},{status:400,headers})
})