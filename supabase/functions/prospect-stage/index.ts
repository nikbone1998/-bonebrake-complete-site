import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const OWNER='bonebrakewebsitedesign@gmail.com'
const clean=(v:unknown,max=500)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)
const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeDomain(value:unknown){
  let s=clean(value,2048).toLowerCase()
  if(!s) return null
  try{
    if(!/^https?:\/\//.test(s)) s=`https://${s}`
    const u=new URL(s)
    return u.hostname.replace(/^www\./,'').replace(/\.$/,'')||null
  }catch{return null}
}
function nInt(v:unknown){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.round(n)):null}
function nRating(v:unknown){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(5,n)):null}
function normalizeCandidate(raw:Record<string,unknown>,sourceSystem:string){
  const company=clean(raw.company_name??raw.company??raw.business_name,200)
  const website=clean(raw.website??raw.url,2048)||null
  const domain=normalizeDomain(raw.normalized_domain??website??raw.domain)
  const email=clean(raw.email,254).toLowerCase()
  return {
    source_system:sourceSystem,
    source_record_id:clean(raw.source_record_id??raw.id,240)||null,
    company_name:company,
    website,
    normalized_domain:domain,
    contact_name:clean(raw.contact_name??raw.name,180)||null,
    contact_title:clean(raw.contact_title??raw.title,160)||null,
    email:emailRe.test(email)?email:null,
    phone:clean(raw.phone,80)||null,
    city:clean(raw.city,120)||null,
    region:clean(raw.region??raw.state,120)||null,
    country:clean(raw.country,120)||'United States',
    industry:clean(raw.industry,180)||null,
    employee_count:nInt(raw.employee_count??raw.employees),
    review_count:nInt(raw.review_count??raw.reviews),
    rating:nRating(raw.rating),
    source_payload:raw,
  }
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST') return Response.json({ok:false,error:'method_not_allowed'},{status:405})
  const auth=req.headers.get('authorization')||''
  const token=auth.startsWith('Bearer ')?auth.slice(7):''
  if(!token) return Response.json({ok:false,error:'authentication_required'},{status:401})

  const url=Deno.env.get('SUPABASE_URL')
  const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')['default']
  if(!url||!secret) return Response.json({ok:false,error:'server_configuration_error'},{status:500})
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error:userError}=await db.auth.getUser(token)
  if(userError||!user||String(user.email||'').toLowerCase()!==OWNER) return Response.json({ok:false,error:'owner_only'},{status:403})

  let body:Record<string,unknown>
  try{body=await req.json()}catch{return Response.json({ok:false,error:'invalid_json'},{status:400})}
  const sourceSystem=clean(body.source_system,80).toLowerCase()
  const sourceLabel=clean(body.source_label,160)||null
  const dryRun=body.dry_run===true
  const raw=Array.isArray(body.candidates)?body.candidates:[]
  if(!sourceSystem||raw.length===0) return Response.json({ok:false,error:'source_and_candidates_required'},{status:400})
  if(raw.length>100) return Response.json({ok:false,error:'batch_too_large',max_candidates:100},{status:413})

  const {data:settings,error:settingsError}=await db.from('automation_settings').select('prospecting_enabled').eq('key','global').single()
  if(settingsError) return Response.json({ok:false,error:'settings_unavailable'},{status:503})
  if(!dryRun&&!settings?.prospecting_enabled) return Response.json({ok:false,error:'prospecting_disabled',message:'Prospecting is currently disabled. Use dry_run=true for validation.'},{status:423})

  const candidates=raw.map((r)=>normalizeCandidate((r&&typeof r==='object'?r:{}) as Record<string,unknown>,sourceSystem))
  const invalid=candidates.filter(c=>!c.company_name||(!c.normalized_domain&&!c.email&&!c.phone)).length
  const usable=candidates.filter(c=>c.company_name&&(c.normalized_domain||c.email||c.phone))
  const seen=new Set<string>(); let batchDuplicates=0
  const unique=usable.filter(c=>{
    const key=c.normalized_domain?`d:${c.normalized_domain}`:c.source_record_id?`s:${sourceSystem}:${c.source_record_id}`:c.email?`e:${c.email}`:`p:${c.phone}`
    if(seen.has(key)){batchDuplicates++;return false} seen.add(key);return true
  })

  if(dryRun) return Response.json({ok:true,dry_run:true,source_system:sourceSystem,received:raw.length,usable:unique.length,invalid,batch_duplicates:batchDuplicates,preview:unique.slice(0,20).map(c=>({company_name:c.company_name,normalized_domain:c.normalized_domain,email:c.email,industry:c.industry}))},{headers:{'Cache-Control':'no-store'}})

  const {data:run,error:runError}=await db.from('prospect_import_runs').insert({source_system:sourceSystem,source_label:sourceLabel,status:'running',discovered_count:raw.length,metadata:{ingested_by:'prospect-stage'}}).select('id').single()
  if(runError||!run) return Response.json({ok:false,error:'import_run_create_failed'},{status:503})

  let accepted=0,duplicates=batchDuplicates,rejected=invalid
  for(const c of unique){
    let existing:any=null
    if(c.normalized_domain){const q=await db.from('prospect_candidates').select('id').eq('normalized_domain',c.normalized_domain).limit(1);existing=q.data?.[0]||null}
    if(!existing&&c.source_record_id){const q=await db.from('prospect_candidates').select('id').eq('source_system',sourceSystem).eq('source_record_id',c.source_record_id).limit(1);existing=q.data?.[0]||null}
    if(existing){duplicates++;continue}
    const {error}=await db.from('prospect_candidates').insert({...c,import_run_id:run.id,status:'discovered',last_checked_at:new Date().toISOString()})
    if(error){rejected++;continue}
    accepted++
  }
  await db.from('prospect_import_runs').update({status:'complete',completed_at:new Date().toISOString(),accepted_count:accepted,duplicate_count:duplicates,rejected_count:rejected}).eq('id',run.id)
  return Response.json({ok:true,dry_run:false,run_id:run.id,received:raw.length,accepted,duplicates,rejected},{headers:{'Cache-Control':'no-store'}})
})
