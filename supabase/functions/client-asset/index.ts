import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const clean=(v:unknown,max=180)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max)
const headersBase={'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Access-Control-Allow-Origin':'*'}
Deno.serve(async(req:Request)=>{
  if(req.method!=='GET') return new Response('Method Not Allowed',{status:405,headers:{...headersBase,'Cache-Control':'no-store'}})
  const url=Deno.env.get('SUPABASE_URL'),secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')['default']
  if(!url||!secret) return new Response('Asset unavailable',{status:503,headers:{...headersBase,'Cache-Control':'no-store'}})
  const token=clean(new URL(req.url).searchParams.get('t'))
  if(token.length<32||token.length>120) return new Response('Asset not found',{status:404,headers:{...headersBase,'Cache-Control':'no-store'}})
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:asset}=await db.from('client_project_assets').select('*').eq('asset_token',token).eq('status','active').maybeSingle()
  if(!asset) return new Response('Asset not found',{status:404,headers:{...headersBase,'Cache-Control':'no-store'}})
  const {data:project}=await db.from('projects').select('status,payment_state').eq('id',asset.project_id).maybeSingle()
  if(!project||project.status==='cancelled'||project.payment_state==='refunded') return new Response('Asset unavailable',{status:410,headers:{...headersBase,'Cache-Control':'no-store'}})
  const {data:file,error}=await db.storage.from(asset.storage_bucket).download(asset.storage_path)
  if(error||!file) return new Response('Asset unavailable',{status:404,headers:{...headersBase,'Cache-Control':'no-store'}})
  const body=await file.arrayBuffer()
  return new Response(body,{status:200,headers:{...headersBase,'Content-Type':asset.mime_type,'Content-Length':String(body.byteLength),'Content-Disposition':`inline; filename="${String(asset.original_filename||'asset').replace(/["\r\n]/g,'_')}"`}})
})
