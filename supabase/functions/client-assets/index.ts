import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const BUCKET='client-project-assets'
const MAX_FILE_BYTES=5*1024*1024
const MAX_PHOTOS=6
const EDITABLE_JOB_STATES=new Set(['waiting_intake','intake_ready'])
const allowedMimes=new Set(['image/jpeg','image/png','image/webp'])
const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const clean=(v:unknown,max=500)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)
const now=()=>new Date().toISOString()
async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
function randomToken(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function cors(req:Request){const origin=req.headers.get('origin')||'';const allowed=origin==='https://bwdnorth.com'||origin==='https://www.bwdnorth.com'||(/^https:\/\/[a-z0-9-]+(?:-[a-z0-9-]+)*\.vercel\.app$/i.test(origin));return {'Access-Control-Allow-Origin':allowed?origin:'https://bwdnorth.com','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'}}

Deno.serve(async(req:Request)=>{
  const headers=cors(req)
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers})
  if(req.method!=='POST') return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers})
  const url=Deno.env.get('SUPABASE_URL'),secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')['default']
  if(!url||!secret) return Response.json({ok:false,error:'server_configuration_error'},{status:500,headers})
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})

  let token='',kind='',file:File|null=null,action='list',assetId=''
  const contentType=req.headers.get('content-type')||''
  if(contentType.includes('multipart/form-data')){
    let form:FormData
    try{form=await req.formData()}catch{return Response.json({ok:false,error:'invalid_upload'},{status:400,headers})}
    token=clean(form.get('token'),180);kind=clean(form.get('kind'),20);const candidate=form.get('file');file=candidate instanceof File?candidate:null;action='upload'
  }else{
    let body:any
    try{body=await req.json()}catch{return Response.json({ok:false,error:'invalid_json'},{status:400,headers})}
    token=clean(body?.token,180);action=clean(body?.action,40)||'list';assetId=clean(body?.asset_id,80)
  }
  if(token.length<32||token.length>120) return Response.json({ok:false,error:'invalid_or_expired_link'},{status:404,headers})
  const tokenHash=await sha256(token)
  const {data:intake}=await db.from('client_intake_requests').select('*').eq('token_hash',tokenHash).maybeSingle()
  if(!intake||!['pending','sent','submitted'].includes(intake.status)) return Response.json({ok:false,error:'invalid_or_expired_link'},{status:404,headers})
  if(new Date(intake.expires_at).getTime()<Date.now()) return Response.json({ok:false,error:'intake_expired'},{status:410,headers})
  const [{data:project},{data:fulfillment}]=await Promise.all([
    db.from('projects').select('id,status,payment_state,client_name,current_milestone').eq('id',intake.project_id).maybeSingle(),
    db.from('project_fulfillment_jobs').select('id,status').eq('project_id',intake.project_id).order('created_at',{ascending:false}).limit(1).maybeSingle()
  ])
  if(!project||project.payment_state!=='paid'||project.status==='cancelled') return Response.json({ok:false,error:'project_unavailable'},{status:409,headers})
  const assetIntakeOpen=!fulfillment||EDITABLE_JOB_STATES.has(String(fulfillment.status||''))

  const {data:assets}=await db.from('client_project_assets').select('id,asset_token,asset_kind,original_filename,mime_type,size_bytes,status,created_at').eq('project_id',project.id).eq('status','active').order('created_at',{ascending:true})
  const list=(assets||[]).map((a:any)=>({id:a.id,kind:a.asset_kind,file_name:a.original_filename,mime_type:a.mime_type,size_bytes:a.size_bytes,created_at:a.created_at,asset_url:`${url}/functions/v1/client-asset?t=${encodeURIComponent(a.asset_token)}`}))
  const limits={logo:1,photos:MAX_PHOTOS,max_file_bytes:MAX_FILE_BYTES,allowed_mime_types:[...allowedMimes]}
  if(action==='list') return Response.json({ok:true,project:{client_name:project.client_name},assets:list,limits,asset_intake_open:assetIntakeOpen,fulfillment_status:fulfillment?.status||null},{headers})
  if(!assetIntakeOpen) return Response.json({ok:false,error:'asset_intake_closed',fulfillment_status:fulfillment?.status||null},{status:409,headers})

  if(action==='remove'){
    if(!uuidRe.test(assetId)) return Response.json({ok:false,error:'valid_asset_id_required'},{status:400,headers})
    const {data:asset}=await db.from('client_project_assets').select('id,storage_bucket,storage_path,asset_kind').eq('id',assetId).eq('project_id',project.id).eq('status','active').maybeSingle()
    if(!asset) return Response.json({ok:false,error:'asset_not_found'},{status:404,headers})
    const {data:revoked,error:revokeError}=await db.from('client_project_assets').update({status:'revoked',updated_at:now()}).eq('id',asset.id).eq('status','active').select('id').maybeSingle()
    if(revokeError||!revoked) return Response.json({ok:false,error:'asset_remove_failed'},{status:409,headers})
    await db.storage.from(asset.storage_bucket).remove([asset.storage_path])
    await db.from('activity').insert({entity_type:'project',entity_id:project.id,action:'client_asset_removed',detail:{asset_id:asset.id,asset_kind:asset.asset_kind}})
    return Response.json({ok:true,removed:true,asset_id:asset.id},{headers})
  }

  if(action!=='upload') return Response.json({ok:false,error:'unsupported_action'},{status:400,headers})
  if(!file||!['logo','photo'].includes(kind)) return Response.json({ok:false,error:'valid_asset_required'},{status:422,headers})
  if(!allowedMimes.has(file.type)) return Response.json({ok:false,error:'unsupported_asset_type'},{status:415,headers})
  if(file.size<=0||file.size>MAX_FILE_BYTES) return Response.json({ok:false,error:'asset_too_large'},{status:413,headers})
  const activeLogo=list.filter((a:any)=>a.kind==='logo').length,activePhotos=list.filter((a:any)=>a.kind==='photo').length
  if(kind==='logo'&&activeLogo>=1) return Response.json({ok:false,error:'logo_already_uploaded'},{status:409,headers})
  if(kind==='photo'&&activePhotos>=MAX_PHOTOS) return Response.json({ok:false,error:'photo_limit_reached'},{status:409,headers})
  const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'
  const storagePath=`${project.id}/${crypto.randomUUID()}.${ext}`
  const assetToken=randomToken()
  const {error:uploadError}=await db.storage.from(BUCKET).upload(storagePath,file,{contentType:file.type,upsert:false,cacheControl:'3600'})
  if(uploadError) return Response.json({ok:false,error:'asset_upload_failed'},{status:500,headers})
  const {data:row,error:insertError}=await db.from('client_project_assets').insert({project_id:project.id,intake_request_id:intake.id,storage_bucket:BUCKET,storage_path:storagePath,asset_token:assetToken,asset_kind:kind,original_filename:clean(file.name,240)||`${kind}.${ext}`,mime_type:file.type,size_bytes:file.size,status:'active',updated_at:now()}).select('id,asset_kind,original_filename,mime_type,size_bytes,created_at').single()
  if(insertError||!row){await db.storage.from(BUCKET).remove([storagePath]);return Response.json({ok:false,error:'asset_record_failed'},{status:500,headers})}
  await db.from('activity').insert({entity_type:'project',entity_id:project.id,action:'client_asset_uploaded',detail:{asset_id:row.id,asset_kind:row.asset_kind,mime_type:row.mime_type,size_bytes:row.size_bytes}})
  return Response.json({ok:true,asset:{id:row.id,kind:row.asset_kind,file_name:row.original_filename,mime_type:row.mime_type,size_bytes:row.size_bytes,created_at:row.created_at,asset_url:`${url}/functions/v1/client-asset?t=${encodeURIComponent(assetToken)}`},limits,asset_intake_open:true},{headers})
})