const BOOTSTRAP='https://usurytofnhhfxxipngdd.supabase.co/functions/v1/phase13-owner-bootstrap';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'method_not_allowed'});}
  try{
    const r=await fetch(BOOTSTRAP,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const data=await r.json().catch(()=>({}));
    return res.status(r.status).json(data);
  }catch{
    return res.status(502).json({ok:false,error:'bootstrap_unreachable'});
  }
}
