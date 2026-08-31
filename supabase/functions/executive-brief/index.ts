import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const OWNER='bonebrakewebsitedesign@gmail.com'
const clean=(v:unknown,max=1000)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)
async function sha256(v:string){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function sameSecret(a:string,b:string){if(!a||!b)return false;const[x,y]=await Promise.all([sha256(a),sha256(b)]);return x===y}
const money=(c:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(c||0)/100)
function localHour(tz:string){const parts=new Intl.DateTimeFormat('en-US',{timeZone:tz,hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date());return Number(parts.find(x=>x.type==='hour')?.value||-1)}
function cors(req:Request){const o=req.headers.get('origin')||'';const allowed=o==='https://bwdnorth.com'||o==='https://www.bwdnorth.com'||/^https:\/\/[-a-z0-9]+\.vercel\.app$/i.test(o);return {'Access-Control-Allow-Origin':allowed?o:'https://bwdnorth.com','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-bonebrake-brief-key','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'}}
const severityRank:any={critical:0,error:1,warning:2,info:3}

Deno.serve(async(req:Request)=>{
  const headers=cors(req);if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(req.method!=='POST')return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers})
  const url=Deno.env.get('SUPABASE_URL'),service=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')['default'];if(!url||!service)return Response.json({ok:false,error:'server_configuration_error'},{status:500,headers})
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}})
  const [{data:stored},{data:settings}]=await Promise.all([db.from('integration_secrets').select('secret_value').eq('key','executive_brief_worker_secret').maybeSingle(),db.from('automation_settings').select('*').eq('key','global').maybeSingle()])
  if(!settings)return Response.json({ok:false,error:'settings_unavailable'},{status:503,headers})
  const supplied=req.headers.get('x-bonebrake-brief-key')||'';let authorized=await sameSecret(supplied,String(stored?.secret_value||''));let owner=false
  if(!authorized){const auth=req.headers.get('authorization')||'',jwt=auth.startsWith('Bearer ')?auth.slice(7):'';if(jwt){const {data:{user}}=await db.auth.getUser(jwt);owner=String(user?.email||'').toLowerCase()===OWNER;authorized=owner}}
  if(!authorized)return Response.json({ok:false,error:'executive_brief_auth_required'},{status:401,headers})
  let body:any={};try{body=await req.json()}catch{}
  const trigger=['scheduled','owner_refresh','certification'].includes(body?.trigger_source)?body.trigger_source:(owner?'owner_refresh':'scheduled')
  const timezone=clean(settings.executive_brief_timezone||'America/Chicago',80),hour=Number(settings.executive_brief_hour??8)
  if(trigger==='scheduled'&&!settings.executive_brief_enabled)return Response.json({ok:true,status:'skipped',reason:'executive_brief_disabled'},{headers})
  if(trigger==='scheduled'&&localHour(timezone)!==hour)return Response.json({ok:true,status:'skipped',reason:'outside_daily_brief_hour',timezone,hour},{headers})
  const started=Date.now()
  const [metricsRes,actionsRes,incidentsRes,projectsRes,activityRes,deadLettersRes]=await Promise.all([
    db.rpc('phase14_executive_brief_metrics',{p_timezone:timezone}),
    db.from('automation_actions').select('id,action_type,entity_type,entity_id,title,summary,risk_level,status,created_at,expires_at').eq('status','pending').order('created_at',{ascending:true}).limit(20),
    db.from('automation_incidents').select('id,incident_key,category,severity,status,entity_type,entity_id,title,detail,occurrence_count,recovery_attempts,escalation_action_id,last_seen_at').in('status',['open','retrying','escalated']).order('last_seen_at',{ascending:false}).limit(30),
    db.from('projects').select('id,client_name,status,current_milestone,payment_state,agreed_price,paid_amount,target_launch,next_action,updated_at').order('updated_at',{ascending:false}).limit(30),
    db.from('activity').select('id,created_at,entity_type,entity_id,action,detail').order('created_at',{ascending:false}).limit(15),
    db.from('automation_dead_letters').select('id,action_id,action_type,reason,error_message,status,escalation_action_id,created_at').eq('status','open').order('created_at',{ascending:true}).limit(10)
  ])
  if(metricsRes.error)return Response.json({ok:false,error:'executive_metrics_failed',detail:clean(metricsRes.error.message,500)},{status:500,headers})
  const m:any=metricsRes.data||{},actions=actionsRes.data||[],incidents=(incidentsRes.data||[]).sort((a:any,b:any)=>(severityRank[a.severity]??9)-(severityRank[b.severity]??9)),projects=projectsRes.data||[],deadLetters=deadLettersRes.data||[]
  const priorities:any[]=[]
  for(const d of deadLetters.slice(0,3))priorities.push({kind:'dead_letter',severity:'error',title:`Retry stopped: ${String(d.action_type||'automation').replaceAll('_',' ')}`,detail:d.error_message||d.reason||'Automatic retries were exhausted or prohibited.',dead_letter_id:d.id,action_id:d.escalation_action_id||d.action_id})
  for(const i of incidents.slice(0,Math.max(0,4-priorities.length)))priorities.push({kind:'incident',severity:i.severity,title:i.title,detail:i.detail||`${i.category} incident`,incident_id:i.id,action_id:i.escalation_action_id||null})
  for(const a of actions.slice(0,Math.max(0,5-priorities.length)))priorities.push({kind:'approval',severity:a.action_type==='deploy_paid_project_production'?'critical':'action',title:a.title,detail:a.summary||a.action_type,action_id:a.id,entity_id:a.entity_id||null})
  const blockedProjects=projects.filter((p:any)=>['waiting_client_intake','await_client_review','await_production_deployment'].includes(String(p.next_action||''))||['launch_ready','review'].includes(String(p.status||'')))
  for(const p of blockedProjects.slice(0,Math.max(0,5-priorities.length)))priorities.push({kind:'project',severity:'watch',title:`${p.client_name}: ${p.current_milestone||p.status}`,detail:p.next_action||'Project requires progress review',project_id:p.id})
  if(!priorities.length)priorities.push({kind:'status',severity:'normal',title:'No owner intervention required',detail:'Monitoring and retry recovery are healthy and no approval-risk action is waiting.'})
  const critical=Number(m.incidents?.critical||0),errors=Number(m.incidents?.error||0),warnings=Number(m.incidents?.warning||0),pending=Number(m.approvals?.pending||0),openDeadLetters=Number(m.retries?.open_dead_letters||0),operationalFailures=Number(m.fulfillment?.failed||0)+Number(m.revisions?.failed||0)+Number(m.domains?.failed||0)+Number(m.releases?.failed_24h||0)+openDeadLetters
  const attentionLevel=critical>0?'critical':(errors>0||pending>0||operationalFailures>0)?'action':warnings>0?'watch':'normal'
  let headline='No urgent intervention required.'
  if(critical)headline=`${critical} critical incident${critical===1?'':'s'} require owner attention.`
  else if(pending||errors||operationalFailures)headline=`${pending} pending decision${pending===1?'':'s'} and ${errors+operationalFailures} operational issue${errors+operationalFailures===1?'':'s'} need review.`
  else if(Number(m.revenue?.today_cents||0)>0)headline=`${money(m.revenue.today_cents)} received today; operations are healthy.`
  const payload={version:'phase14-executive-brief-v2',generated_at:new Date().toISOString(),business_date:m.business_date,timezone,attention_level:attentionLevel,headline,metrics:m,priorities,approvals:actions,incidents,open_dead_letters:deadLetters,projects:projects.filter((p:any)=>!['complete','completed','cancelled'].includes(String(p.status||''))).slice(0,12),recent_activity:activityRes.data||[],capabilities:{monitoring_enabled:!!settings.monitoring_enabled,auto_recovery_enabled:!!settings.auto_recovery_enabled,retry_engine_enabled:!!settings.retry_engine_enabled,auto_retry_enabled:!!settings.auto_retry_enabled,autopilot_enabled:!!settings.autopilot_enabled,payments_enabled:!!settings.payments_enabled,fulfillment_enabled:!!settings.fulfillment_enabled,production_deploy_enabled:!!settings.production_deploy_enabled}}
  const generationMs=Date.now()-started
  const {data:snapshot,error:snapError}=await db.from('executive_brief_snapshots').upsert({business_date:m.business_date,generated_at:new Date().toISOString(),updated_at:new Date().toISOString(),trigger_source:trigger,attention_level:attentionLevel,headline,payload,generation_ms:generationMs},{onConflict:'business_date'}).select('id,business_date,generated_at,attention_level,headline,payload,generation_ms').single()
  if(snapError)return Response.json({ok:false,error:'executive_snapshot_failed',detail:clean(snapError.message,500)},{status:500,headers})
  return Response.json({ok:true,status:'ready',snapshot},{headers})
})