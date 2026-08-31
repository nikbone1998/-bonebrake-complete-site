import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const cleanHost=(value:string)=>String(value||'').trim().toLowerCase().replace(/\.$/,'').replace(/:\d+$/,'')
const validHost=(host:string)=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)&&host.length<=253
async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
const baseHeaders={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()','X-Robots-Tag':'index, follow'}

Deno.serve(async(req:Request)=>{
  if(req.method!=='GET') return new Response('Method Not Allowed',{status:405,headers:{...baseHeaders,'Cache-Control':'no-store'}})
  const host=cleanHost(new URL(req.url).searchParams.get('host')||'')
  if(!validHost(host)||host==='bwdnorth.com'||host==='www.bwdnorth.com'||host.endsWith('.vercel.app')) return new Response('Site not found',{status:404,headers:{...baseHeaders,'Cache-Control':'public, max-age=30'}})
  const url=Deno.env.get('SUPABASE_URL'),secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')['default']
  if(!url||!secret) return new Response('Site unavailable',{status:503,headers:{...baseHeaders,'Cache-Control':'no-store'}})
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:domain}=await db.from('project_site_domains').select('id,project_id,hostname,status,ssl_status').eq('hostname',host).eq('status','active').maybeSingle()
  if(!domain||domain.ssl_status!=='ready') return new Response('Site not found',{status:404,headers:{...baseHeaders,'Cache-Control':'public, max-age=30'}})
  const {data:project}=await db.from('projects').select('id,status,payment_state').eq('id',domain.project_id).maybeSingle()
  if(!project||project.status==='cancelled'||project.payment_state==='refunded') return new Response('Site unavailable',{status:410,headers:{...baseHeaders,'Cache-Control':'no-store'}})
  const {data:release}=await db.from('project_release_candidates').select('id,artifact_id,status,is_active,production_deployed_at').eq('project_id',domain.project_id).eq('status','deployed').eq('is_active',true).maybeSingle()
  if(!release||!release.production_deployed_at) return new Response('Site not found',{status:404,headers:{...baseHeaders,'Cache-Control':'public, max-age=30'}})
  const {data:artifact}=await db.from('project_generated_artifacts').select('id,status,html,content_sha256,title').eq('id',release.artifact_id).eq('project_id',domain.project_id).maybeSingle()
  if(!artifact||artifact.status!=='approved'||!artifact.html||!artifact.content_sha256) return new Response('Site unavailable',{status:503,headers:{...baseHeaders,'Cache-Control':'no-store'}})
  const actualHash=await sha256(String(artifact.html));if(actualHash!==artifact.content_sha256)return new Response('Site unavailable',{status:503,headers:{...baseHeaders,'Cache-Control':'no-store'}})
  const etag=`\"${actualHash}\"`;if(req.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers:{...baseHeaders,'Cache-Control':'public, s-maxage=60, stale-while-revalidate=300','ETag':etag}})
  return new Response(String(artifact.html),{status:200,headers:{...baseHeaders,'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, s-maxage=60, stale-while-revalidate=300','ETag':etag,'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}})
})
