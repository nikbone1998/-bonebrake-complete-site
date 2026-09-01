import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/+esm';

const db=createClient('https://usurytofnhhfxxipngdd.supabase.co','sb_publishable_jpA7u89wOaxWcyO5NU5cGw_HkQTnOkv',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const OWNER='bonebrakewebsitedesign@gmail.com';

function rowNamed(name){return [...document.querySelectorAll('.control-row')].find(r=>r.querySelector('strong')?.textContent?.trim()===name)}
function paint(name,{on=false,locked=false,note=''}){const row=rowNamed(name);if(!row)return false;const toggle=row.querySelector('.toggle-look'),small=row.querySelector('small');toggle?.classList.toggle('on',!!on);toggle?.classList.toggle('locked',!!locked);if(small&&note)small.textContent=note;return true}

async function syncControlTruth(){
  const {data:{session}}=await db.auth.getSession();
  if((session?.user?.email||'').toLowerCase()!==OWNER)return;
  const {data:s,error}=await db.from('automation_settings').select('*').limit(1).maybeSingle();
  if(error||!s)return;
  const scheduled=!!s.config?.sales_autopilot_schedule;
  const locked=!!s.external_effects_locked;
  let tries=0;
  const apply=()=>{
    if(!rowNamed('Sales Autopilot')&&tries++<20){setTimeout(apply,150);return}
    const host=document.getElementById('automationControls');
    if(host&&!document.getElementById('scopedAutomationLegend')){
      const legend=document.createElement('div');legend.id='scopedAutomationLegend';legend.className='system-legend';legend.innerHTML='<strong>Scoped scheduler vs. backend switches</strong><span>The hourly ChatGPT workflow can be active while Bonebrake’s global backend external-effect switches remain safety-locked OFF.</span>';host.before(legend);
    }
    paint('Sales Autopilot',{on:scheduled,locked:false,note:scheduled?(locked?'Hourly ChatGPT scheduler ON · backend master Autopilot remains OFF under global safety lock':'Hourly ChatGPT scheduler ON'):'Hourly scheduler not recorded'});
    paint('Hourly Prospecting',{on:scheduled,locked:false,note:scheduled?(locked?'Scoped hourly prospecting ON · backend Prospecting switch remains OFF under global safety lock':'Hourly prospecting schedule ON'):'Hourly prospecting schedule not recorded'});
    paint('Website Generation',{on:scheduled,locked:false,note:scheduled?'Available inside the scoped hourly run · generated concepts remain preview-only':'No active hourly generation workflow recorded'});
    paint('Automatic QA',{on:true,locked:false,note:'Internal deterministic QA is allowed and does not publish or contact anyone'});
    paint('Cold Email',{on:scheduled,locked:false,note:scheduled?(locked?'Scoped one-prospect email workflow ON · backend Outreach switch remains OFF':'Scoped cold-email workflow ON'):'No active scheduled cold-email workflow recorded'});
    paint('Reply Monitoring',{on:scheduled,locked:false,note:scheduled?'Reply reconciliation runs inside each hourly cycle':'No scheduled reply reconciliation recorded'});
    paint('Follow-Up',{on:false,locked:false,note:'Automatic follow-up remains OFF unless a separate bounded policy is approved'});
    paint('Client Fulfillment',{on:!!s.fulfillment_enabled,locked:locked&&!s.fulfillment_enabled,note:locked&&!s.fulfillment_enabled?'OFF · disabled by external_effects_locked':'Backend fulfillment switch reflects live setting'});
    paint('Production Deployment',{on:!!s.production_deploy_enabled,locked:locked&&!s.production_deploy_enabled,note:locked&&!s.production_deploy_enabled?'OFF · disabled by external_effects_locked and release gates':'Backend production switch reflects live setting'});
  };
  apply();
}

document.addEventListener('click',e=>{if(e.target.closest('[data-view="health"],[data-view-jump="health"]'))setTimeout(syncControlTruth,100)});
setTimeout(syncControlTruth,600);
setInterval(syncControlTruth,30000);
