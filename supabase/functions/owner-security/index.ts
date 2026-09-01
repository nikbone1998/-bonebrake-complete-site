const PROJECT_URL = 'https://usurytofnhhfxxipngdd.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_jpA7u89wOaxWcyO5NU5cGw_HkQTnOkv'
const OWNER = 'bonebrakewebsitedesign@gmail.com'

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>Bonebrake Owner Security</title>
<style>
:root{color-scheme:dark;--bg:#0c0c0c;--panel:#151515;--line:#303030;--text:#f5f2ea;--muted:#aaa59b;--ok:#9dd6a5;--warn:#e4c07c;--bad:#ed9b9b}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh;padding:24px}.wrap{max-width:680px;margin:0 auto}.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}h1{font-size:30px;line-height:1.1;margin:10px 0 8px}p{color:var(--muted)}.card{margin-top:20px;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:20px}.row{display:grid;gap:10px;margin-top:14px}label{font-size:13px;color:var(--muted)}input,button{font:inherit;border-radius:12px;border:1px solid var(--line);padding:13px 14px}input{background:#0f0f0f;color:var(--text);width:100%}button{background:#f0ece2;color:#111;font-weight:700;cursor:pointer}button.secondary{background:#222;color:var(--text)}button:disabled{opacity:.5;cursor:not-allowed}.status{padding:12px 14px;border:1px solid var(--line);border-radius:12px;margin-top:14px}.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}.hidden{display:none!important}.qr{background:#fff;border-radius:14px;padding:14px;max-width:260px;width:100%;margin:14px auto;display:block}.secret{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;background:#0d0d0d;border:1px solid var(--line);border-radius:10px;padding:12px}.fine{font-size:13px;color:var(--muted)}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.actions button{flex:1;min-width:180px}
</style>
</head>
<body>
<main class="wrap">
<div class="eyebrow">Bonebrake / owner-only security</div>
<h1>Secure the owner account</h1>
<p>This page is hosted directly by the Bonebrake Supabase project. Your password and authenticator secret are handled by Supabase Auth in your browser and are never sent to ChatGPT.</p>

<section class="card" id="loginCard">
  <div class="eyebrow">Step 1</div><h2>Owner sign in</h2>
  <div class="row"><label>Email</label><input id="email" value="${OWNER}" readonly autocomplete="username"></div>
  <div class="row"><label>Password</label><input id="password" type="password" autocomplete="current-password" placeholder="Bonebrake owner password"></div>
  <div class="actions"><button id="signIn">Sign in securely</button></div>
  <div id="loginStatus" class="status hidden"></div>
</section>

<section class="card hidden" id="securityCard">
  <div class="eyebrow">Step 2</div><h2>Authenticator MFA</h2>
  <div id="aalStatus" class="status"></div>
  <div id="factorState"></div>
  <div id="enrollArea" class="hidden">
    <p>Scan this QR code with an authenticator app, or copy the secret into the app manually on the same phone.</p>
    <img id="qr" class="qr" alt="TOTP enrollment QR code">
    <label>Manual secret</label><div id="secret" class="secret"></div>
    <div class="actions"><button class="secondary" id="copySecret">Copy secret</button></div>
  </div>
  <div id="verifyArea" class="hidden">
    <div class="row"><label>6-digit authenticator code</label><input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456"></div>
    <div class="actions"><button id="verify">Verify MFA</button></div>
  </div>
  <div class="actions"><button class="secondary" id="beginEnroll">Start TOTP enrollment</button><button class="secondary" id="signOut">Sign out</button></div>
  <div id="securityStatus" class="status hidden"></div>
  <p class="fine">A successful verification promotes this session to AAL2 and activates the verified TOTP factor. Supabase signs out other sessions when a new factor is verified.</p>
</section>
</main>
<script type="module">
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/+esm'
const sb=createClient('${PROJECT_URL}','${PUBLISHABLE_KEY}',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}})
const OWNER='${OWNER}'
const $=id=>document.getElementById(id)
let factorId=null
const show=(id,on=true)=>$(id).classList.toggle('hidden',!on)
const msg=(id,text,type='warn')=>{const el=$(id);el.textContent=text;el.className='status '+type;show(id,true)}
async function ensureOwner(){const {data:{user}}=await sb.auth.getUser();if(!user||String(user.email||'').toLowerCase()!==OWNER){if(user)await sb.auth.signOut();return null}return user}
async function refresh(){
 const user=await ensureOwner();show('loginCard',!user);show('securityCard',!!user);if(!user)return
 const [{data:aal,error:aalErr},{data:factors,error:fErr}]=await Promise.all([sb.auth.mfa.getAuthenticatorAssuranceLevel(),sb.auth.mfa.listFactors()])
 if(aalErr||fErr){msg('securityStatus',(aalErr||fErr).message,'bad');return}
 const current=aal?.currentLevel||'unknown',next=aal?.nextLevel||'unknown'
 $('aalStatus').innerHTML='<strong>Current session:</strong> '+current.toUpperCase()+' &nbsp; <strong>Next:</strong> '+next.toUpperCase()
 $('aalStatus').className='status '+(current==='aal2'?'ok':next==='aal2'?'warn':'bad')
 const verified=(factors?.totp||[]).find(f=>f.status==='verified')||(factors?.totp||[])[0]
 if(current==='aal2'){
   $('factorState').innerHTML='<p class="ok"><strong>MFA verified.</strong> This session has reached AAL2.</p>'
   show('beginEnroll',false);show('verifyArea',false);show('enrollArea',false);factorId=verified?.id||null
 }else if(verified){
   factorId=verified.id;$('factorState').innerHTML='<p class="warn"><strong>A TOTP factor is enrolled.</strong> Enter a current authenticator code to elevate this session to AAL2.</p>'
   show('beginEnroll',false);show('verifyArea',true);show('enrollArea',false)
 }else{
   factorId=null;$('factorState').innerHTML='<p class="bad"><strong>No verified TOTP factor yet.</strong> Start enrollment below.</p>'
   show('beginEnroll',true);show('verifyArea',false);show('enrollArea',false)
 }
}
$('signIn').onclick=async()=>{const password=$('password').value;if(!password)return msg('loginStatus','Enter the owner password.','bad');$('signIn').disabled=true;try{const {error}=await sb.auth.signInWithPassword({email:OWNER,password});$('password').value='';if(error)throw error;const user=await ensureOwner();if(!user)throw new Error('This account is not the authorized Bonebrake owner.');show('loginStatus',false);await refresh()}catch(e){msg('loginStatus',e.message||'Sign-in failed.','bad')}finally{$('signIn').disabled=false}}
$('beginEnroll').onclick=async()=>{$('beginEnroll').disabled=true;try{const {data,error}=await sb.auth.mfa.enroll({factorType:'totp',friendlyName:'Bonebrake Owner'});if(error)throw error;factorId=data.id;$('qr').src=data.totp.qr_code;$('secret').textContent=data.totp.secret;show('enrollArea',true);show('verifyArea',true);msg('securityStatus','Add the factor to your authenticator app, then enter the current code below.','warn')}catch(e){msg('securityStatus',e.message||'Enrollment failed.','bad')}finally{$('beginEnroll').disabled=false}}
$('copySecret').onclick=async()=>{try{await navigator.clipboard.writeText($('secret').textContent);msg('securityStatus','Authenticator secret copied.','ok')}catch{msg('securityStatus','Copy failed. Press and hold the secret to copy it manually.','warn')}}
$('verify').onclick=async()=>{const code=$('code').value.trim();if(!factorId||!/^\d{6,8}$/.test(code))return msg('securityStatus','Enter the current authenticator code.','bad');$('verify').disabled=true;try{const {data:challenge,error:cErr}=await sb.auth.mfa.challenge({factorId});if(cErr)throw cErr;const {error:vErr}=await sb.auth.mfa.verify({factorId,challengeId:challenge.id,code});if(vErr)throw vErr;$('code').value='';msg('securityStatus','MFA verification succeeded. Confirming AAL2…','ok');await refresh()}catch(e){msg('securityStatus',e.message||'MFA verification failed.','bad')}finally{$('verify').disabled=false}}
$('signOut').onclick=async()=>{await sb.auth.signOut();factorId=null;await refresh()}
const {data:{session}}=await sb.auth.getSession();if(session)await refresh()
</script>
</body></html>`

Deno.serve((req: Request) => {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Pragma': 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; script-src https://cdn.jsdelivr.net; connect-src https://usurytofnhhfxxipngdd.supabase.co; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'"
    }
  })
})
