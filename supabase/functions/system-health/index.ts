import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

Deno.serve(async(req:Request)=>{
  if(!['GET','HEAD'].includes(req.method)) return Response.json({ok:false,error:'method_not_allowed'},{status:405})
  const pub=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}')['default']
  if(!pub||req.headers.get('apikey')!==pub) return Response.json({ok:false,error:'invalid_application_key'},{status:401})
  const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')['default'],url=Deno.env.get('SUPABASE_URL')!
  if(!secret||!url) return Response.json({ok:false,error:'server_configuration_error'},{status:500})
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}),started=Date.now()
  const [countsRes,settingsRes,lastRunRes,incidentRes]=await Promise.all([
    db.rpc('phase13_health_counts'),
    db.from('automation_settings').select('monitoring_enabled,auto_recovery_enabled,monitoring_interval_minutes').eq('key','global').maybeSingle(),
    db.from('automation_monitor_runs').select('id,started_at,completed_at,status,checks_run,incidents_seen,recoveries_attempted,recoveries_succeeded,escalations_created,error_message').order('started_at',{ascending:false}).limit(1).maybeSingle(),
    db.from('automation_incidents').select('severity,status').in('status',['open','retrying','escalated'])
  ])
  const incidentCounts={critical:0,error:0,warning:0,info:0};for(const row of incidentRes.data||[])(incidentCounts as any)[row.severity]=Number((incidentCounts as any)[row.severity]||0)+1
  const databaseOk=!countsRes.error
  const monitoringOk=!settingsRes.error&&!lastRunRes.error&&!incidentRes.error
  const criticalHealthy=incidentCounts.critical===0
  const ok=databaseOk&&monitoringOk&&criticalHealthy
  const payload={
    ok,
    service:'bwd-data-plane',
    release:'14.0.0',
    database:databaseOk?'reachable':'error',
    tables:databaseOk?countsRes.data:null,
    capabilities:{crm:true,proposals:true,launch_readiness:true,audits:true,analytics:true,cms:true,autopilot:true,monitoring:true,automatic_recovery:true},
    monitoring:{
      enabled:!!settingsRes.data?.monitoring_enabled,
      automatic_recovery_enabled:!!settingsRes.data?.auto_recovery_enabled,
      interval_minutes:Number(settingsRes.data?.monitoring_interval_minutes||0)||null,
      open_incidents:incidentCounts,
      last_run:lastRunRes.data||null
    },
    latency_ms:Date.now()-started,
    timestamp:new Date().toISOString()
  }
  if(!databaseOk) console.error('data_plane_health_failed',{code:countsRes.error?.code,message:countsRes.error?.message})
  if(req.method==='HEAD') return new Response(null,{status:ok?200:503,headers:{'Cache-Control':'no-store'}})
  return Response.json(payload,{status:ok?200:503,headers:{'Cache-Control':'no-store'}})
})