import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/+esm';

const SB='https://usurytofnhhfxxipngdd.supabase.co';
const KEY='sb_publishable_jpA7u89wOaxWcyO5NU5cGw_HkQTnOkv';
const OWNER='bonebrakewebsitedesign@gmail.com';
const db=createClient(SB,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const when=v=>v?new Date(v).toLocaleString():'—';

let session=null;
let actionRows=[];
let settings=null;
let pollTimer=null;
let initialRouteApplied=false;

function mount(){
  const tabs=document.querySelector('.dashboard-tabs');
  const shell=document.querySelector('#dashboardMain .p11-shell');
  if(!tabs||!shell||$('view-autopilot')) return;
  const tab=document.createElement('button');
  tab.type='button';
  tab.dataset.tab='autopilot';
  tab.id='autopilotTab';
  tab.innerHTML='Autopilot <span class="p14-tab-count" id="autopilotTabCount">0</span>';
  tabs.prepend(tab);

  const view=document.createElement('section');
  view.className='dashboard-view';
  view.id='view-autopilot';
  view.innerHTML=`
    <section class="p14-hero">
      <div>
        <div class="p11-eyebrow">Phase 14 / owner approval layer</div>
        <h3>Bonebrake Autopilot</h3>
        <p>Routine work should happen below this screen. Only decisions that genuinely require owner authority should reach this queue.</p>
      </div>
      <div class="p14-hero-actions">
        <div class="p14-system-state" id="autopilotState"><span class="p14-dot off"></span> Loading controls…</div>
        <button type="button" class="p14-stop" id="autopilotStop">STOP ALL AUTOMATION</button>
      </div>
    </section>

    <div class="p14-metrics" id="autopilotMetrics"></div>

    <div class="p14-layout">
      <section class="p11-panel p14-queue-panel">
        <div class="p11-panel-head">
          <div><h3>Needs your decision</h3><div class="p11-eyebrow" style="margin-top:6px">Approval-risk actions only</div></div>
          <button class="p11-btn secondary" type="button" id="autopilotRefresh">Refresh</button>
        </div>
        <div class="p11-panel-body" id="autopilotQueue"><div class="p11-empty">Loading approval queue…</div></div>
      </section>

      <aside class="p14-side">
        <section class="p11-panel">
          <div class="p11-panel-head"><div><h3>Authority controls</h3><div class="p11-eyebrow" style="margin-top:6px">Read-only during setup</div></div><span class="p11-status warn">Locked</span></div>
          <div class="p11-panel-body" id="autopilotControls"></div>
        </section>
        <section class="p11-panel" style="margin-top:18px">
          <div class="p11-panel-head"><h3>Recent decisions</h3><span class="p11-status">Audit trail</span></div>
          <div class="p11-panel-body" id="autopilotRecent"></div>
        </section>
      </aside>
    </div>`;
  shell.appendChild(view);

  tab.addEventListener('click',()=>activateTab());
  $('autopilotRefresh')?.addEventListener('click',loadAutopilot);
  $('autopilotStop')?.addEventListener('click',stopEverything);
  $('autopilotQueue')?.addEventListener('click',handleDecision);
}

function activateTab(refresh=true){
  document.querySelectorAll('.dashboard-tabs button').forEach(x=>x.classList.toggle('active',x.id==='autopilotTab'));
  document.querySelectorAll('.dashboard-view').forEach(v=>v.classList.toggle('active',v.id==='view-autopilot'));
  location.hash='autopilot';
  if(refresh) loadAutopilot();
}

function metric(label,value,sub=''){
  return `<div class="p14-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</div>`;
}

function controlRow(label,key,highRisk=false){
  const enabled=!!settings?.[key];
  return `<div class="p14-control-row"><div><strong>${esc(label)}</strong><small>${highRisk?'Always requires explicit owner authority before activation':'Will be enabled only after its build step passes verification'}</small></div><span class="p14-switch ${enabled?'on':'off'}" aria-label="${esc(label)} ${enabled?'enabled':'disabled'}"><i></i></span></div>`;
}

function render(){
  if(!$('view-autopilot')) return;
  const pending=actionRows.filter(a=>a.status==='pending');
  const approved=actionRows.filter(a=>a.status==='approved');
  const errors=actionRows.filter(a=>a.status==='error');
  const today=new Date(); today.setHours(0,0,0,0);
  const executedToday=actionRows.filter(a=>a.status==='executed'&&a.executed_at&&new Date(a.executed_at)>=today).length;
  $('autopilotTabCount').textContent=String(pending.length);
  $('autopilotTabCount').hidden=pending.length===0;
  $('autopilotMetrics').innerHTML=[
    metric('Waiting for you',pending.length,'Pending owner decisions'),
    metric('Approved / queued',approved.length,'Approved but not yet executed'),
    metric('Executed today',executedToday,'Completed automation actions'),
    metric('Errors',errors.length,'Requires investigation')
  ].join('');

  const anyEnabled=settings&&['autopilot_enabled','prospecting_enabled','outreach_enabled','auto_reply_enabled','payments_enabled','fulfillment_enabled','production_deploy_enabled'].some(k=>settings[k]);
  $('autopilotState').innerHTML=settings
    ? `<span class="p14-dot ${anyEnabled?'on':'off'}"></span>${anyEnabled?'Some automation capability is enabled':'Safe setup mode · all live capabilities off'}`
    : '<span class="p14-dot off"></span>Controls unavailable';

  $('autopilotControls').innerHTML=settings?[
    controlRow('Master autopilot','autopilot_enabled',true),
    controlRow('Prospecting','prospecting_enabled'),
    controlRow('Outbound outreach','outreach_enabled',true),
    controlRow('Automatic replies','auto_reply_enabled',true),
    controlRow('Payments','payments_enabled',true),
    controlRow('Fulfillment','fulfillment_enabled'),
    controlRow('Production deployment','production_deploy_enabled',true),
    `<div class="p14-limits"><div><span>Auto discount ceiling</span><strong>${Number(settings.max_auto_discount_percent||0)}%</strong></div><div><span>Daily outreach cap</span><strong>${Number(settings.daily_outreach_cap||0)}</strong></div></div>`,
    '<div class="p11-system-note" style="margin-top:14px">These controls are intentionally read-only in Step 2. Later steps unlock only the capability that has been built and verified.</div>'
  ].join(''):'<div class="p11-empty">Automation settings could not be loaded.</div>';

  $('autopilotQueue').innerHTML=pending.length?pending.map(actionCard).join(''):'<div class="p14-zero"><strong>Nothing needs you.</strong><span>The system has no pending owner decisions.</span></div>';

  const recent=actionRows.filter(a=>a.status!=='pending').slice(0,10);
  $('autopilotRecent').innerHTML=recent.length?recent.map(a=>`<div class="p14-recent-row"><div><strong>${esc(a.title)}</strong><small>${esc(a.action_type.replaceAll('_',' '))} · ${esc(when(a.updated_at))}</small></div><span class="p11-status ${a.status==='executed'?'ok':a.status==='error'?'bad':a.status==='rejected'?'warn':''}">${esc(a.status)}</span></div>`).join(''):'<div class="p11-empty">No owner decisions recorded yet.</div>';
}

function actionCard(a){
  const payload=a.payload&&Object.keys(a.payload).length?`<details class="p14-details"><summary>Action details</summary><pre>${esc(JSON.stringify(a.payload,null,2))}</pre></details>`:'';
  const expiry=a.expires_at?`<span>Expires ${esc(when(a.expires_at))}</span>`:'';
  return `<article class="p14-action" data-action="${esc(a.id)}">
    <div class="p14-action-top"><div class="p14-badges"><span class="p14-risk ${esc(a.risk_level)}">${esc(a.risk_level)}</span><span>${esc(a.action_type.replaceAll('_',' '))}</span></div><time>${esc(when(a.created_at))}</time></div>
    <h4>${esc(a.title)}</h4>
    ${a.summary?`<p>${esc(a.summary)}</p>`:''}
    <div class="p14-meta"><span>${esc(a.entity_type||'system')}</span>${expiry}</div>
    ${payload}
    <div class="p14-decision-row"><button class="p11-btn" type="button" data-decision="approve">Approve</button><button class="p11-btn secondary" type="button" data-decision="reject">Reject</button></div>
  </article>`;
}

async function loadAutopilot(){
  if(!session||session.user?.email?.toLowerCase()!==OWNER) return;
  const refresh=$('autopilotRefresh'); if(refresh){refresh.disabled=true;refresh.textContent='Syncing…';}
  const [actionsRes,settingsRes]=await Promise.all([
    db.from('automation_actions').select('*').order('created_at',{ascending:false}).limit(200),
    db.from('automation_settings').select('*').eq('key','global').maybeSingle()
  ]);
  if(refresh){refresh.disabled=false;refresh.textContent='Refresh';}
  if(actionsRes.error||settingsRes.error){
    console.error(actionsRes.error||settingsRes.error);
    if($('autopilotQueue')) $('autopilotQueue').innerHTML='<div class="p11-alert error">Autopilot sync failed. No action was executed.</div>';
    return;
  }
  actionRows=actionsRes.data||[];
  settings=settingsRes.data||null;
  render();
  if(!initialRouteApplied){
    initialRouteApplied=true;
    const pendingCount=actionRows.filter(a=>a.status==='pending').length;
    if(location.hash==='#autopilot'||pendingCount>0) activateTab(false);
  }
}

async function handleDecision(e){
  const button=e.target.closest('[data-decision]');
  if(!button||!session) return;
  const card=button.closest('[data-action]');
  const id=card?.dataset.action;
  const action=actionRows.find(a=>a.id===id);
  if(!id||!action||action.status!=='pending') return;
  const decision=button.dataset.decision;
  if(decision==='approve'){
    if(!confirm(`Approve this action?\n\n${action.title}\n\nApproval does not bypass the capability kill switches.`)) return;
    setCardBusy(card,true);
    const now=new Date().toISOString();
    const {error}=await db.from('automation_actions').update({status:'approved',approved_at:now,approved_by:session.user.id,updated_at:now,rejection_reason:null,rejected_at:null}).eq('id',id).eq('status','pending');
    setCardBusy(card,false);
    if(error){alert(`Approval failed: ${error.message}`);return;}
    await loadAutopilot();
    return;
  }
  if(decision==='reject'){
    const reason=prompt(`Reject: ${action.title}\n\nOptional reason:`,'');
    if(reason===null) return;
    setCardBusy(card,true);
    const now=new Date().toISOString();
    const {error}=await db.from('automation_actions').update({status:'rejected',rejected_at:now,rejection_reason:reason.trim()||null,updated_at:now}).eq('id',id).eq('status','pending');
    setCardBusy(card,false);
    if(error){alert(`Rejection failed: ${error.message}`);return;}
    await loadAutopilot();
  }
}

function setCardBusy(card,busy){
  card?.querySelectorAll('button').forEach(b=>b.disabled=busy);
  card?.classList.toggle('busy',busy);
}

async function stopEverything(){
  if(!session||!settings) return;
  if(!confirm('STOP ALL AUTOMATION?\n\nThis turns off prospecting, outreach, automatic replies, payments, fulfillment, production deployment, and the master autopilot switch.')) return;
  const btn=$('autopilotStop'); btn.disabled=true; btn.textContent='STOPPING…';
  const now=new Date().toISOString();
  const {error}=await db.from('automation_settings').update({
    autopilot_enabled:false,
    prospecting_enabled:false,
    outreach_enabled:false,
    auto_reply_enabled:false,
    payments_enabled:false,
    fulfillment_enabled:false,
    production_deploy_enabled:false,
    updated_at:now
  }).eq('key','global');
  btn.disabled=false; btn.textContent='STOP ALL AUTOMATION';
  if(error){alert(`Emergency stop failed: ${error.message}`);return;}
  await loadAutopilot();
}

async function init(){
  mount();
  const {data}=await db.auth.getSession();
  session=data.session||null;
  if(session?.user?.email?.toLowerCase()===OWNER) await loadAutopilot();
  db.auth.onAuthStateChange((_event,next)=>{
    session=next;
    if(session?.user?.email?.toLowerCase()===OWNER) setTimeout(loadAutopilot,0);
    else {actionRows=[];settings=null;render();}
  });
  pollTimer=setInterval(()=>{if(session?.user?.email?.toLowerCase()===OWNER) loadAutopilot();},30000);
  window.addEventListener('beforeunload',()=>pollTimer&&clearInterval(pollTimer),{once:true});
}

init();
