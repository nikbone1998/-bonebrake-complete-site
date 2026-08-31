const RESOLVER='https://usurytofnhhfxxipngdd.supabase.co/functions/v1/client-site-resolve';

function cleanHost(value){return String(value||'').split(',')[0].trim().toLowerCase().replace(/\.$/,'').replace(/:\d+$/,'')}
function validHost(host){return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)&&host.length<=253}
function send(res,status,text,headers={}){res.statusCode=status;for(const [k,v] of Object.entries(headers))if(v)res.setHeader(k,v);res.end(text)}

export default async function handler(req,res){
  if(!['GET','HEAD'].includes(req.method||'')) return send(res,405,'Method Not Allowed',{'Cache-Control':'no-store','Allow':'GET, HEAD'});
  const host=cleanHost(req.headers['x-forwarded-host']||req.headers.host||'');
  if(!validHost(host)||host==='bwdnorth.com'||host==='www.bwdnorth.com'||host.endsWith('.vercel.app')) return send(res,404,'Site not found',{'Cache-Control':'public, max-age=30','X-Robots-Tag':'noindex'});
  let upstream;
  try{
    upstream=await fetch(`${RESOLVER}?host=${encodeURIComponent(host)}`,{headers:req.headers['if-none-match']?{'If-None-Match':String(req.headers['if-none-match'])}:{},signal:AbortSignal.timeout(12000)});
  }catch{return send(res,503,'Site unavailable',{'Cache-Control':'no-store','Retry-After':'30'})}
  const relay=['content-type','cache-control','etag','content-security-policy','x-content-type-options','referrer-policy','permissions-policy','x-robots-tag'];
  for(const key of relay){const value=upstream.headers.get(key);if(value)res.setHeader(key,value)}
  res.setHeader('X-Bonebrake-Host','multi-tenant-v1');
  res.statusCode=upstream.status;
  if(req.method==='HEAD'||upstream.status===304){res.end();return}
  const text=await upstream.text();res.end(text);
}
