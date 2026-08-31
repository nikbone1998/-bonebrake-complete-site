const BOOTSTRAP='https://usurytofnhhfxxipngdd.supabase.co/functions/v1/phase13-owner-bootstrap';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='phase13-six-figure-reality') return res.status(404).json({ok:false,error:'not_available'});
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'});}
  try{const r=await fetch(BOOTSTRAP,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const data=await r.json().catch(()=>({}));return res.status(r.status).json({ok:data.ok===true,created:data.created===true});}
  catch{return res.status(502).json({ok:false,error:'bootstrap_unreachable'});}
}
