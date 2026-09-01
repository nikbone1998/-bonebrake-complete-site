import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const clean=(v:unknown,max=300)=>String(v??'').trim().slice(0,max)
async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}

Deno.serve(async(req:Request)=>{
  if(req.method!=='GET') return new Response('Method Not Allowed',{status:405,headers:{'Cache-Control':'no-store'}})
  const url=Deno.env.get('SUPABASE_URL'),secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')['default']
  if(!url||!secret) return new Response('Preview unavailable',{status:503,headers:{'Cache-Control':'no-store'}})
  const token=clean(new URL(req.url).searchParams.get('t'),180)
  if(token.length<32||token.length>120) return new Response('Preview not found',{status:404,headers:{'Cache-Control':'no-store'}})
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
  const tokenHash=await sha256(token)
  const {data:artifact}=await db.from('project_generated_artifacts').select('id,project_id,status,html,preview_expires_at').eq('preview_token_hash',tokenHash).maybeSingle()
  if(!artifact||!['generated','review','approved'].includes(artifact.status)) return new Response('Preview not found',{status:404,headers:{'Cache-Control':'no-store'}})
  if(new Date(artifact.preview_expires_at).getTime()<Date.now()) return new Response('Preview expired',{status:410,headers:{'Cache-Control':'no-store'}})
  const {data:project}=await db.from('projects').select('payment_state,status').eq('id',artifact.project_id).maybeSingle()
  if(!project||project.payment_state==='refunded'||project.status==='cancelled') return new Response('Preview unavailable',{status:410,headers:{'Cache-Control':'no-store'}})
  return new Response(String(artifact.html||''),{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors https://bwdnorth.com https://www.bwdnorth.com https://*.vercel.app; sandbox allow-scripts"}})
})
