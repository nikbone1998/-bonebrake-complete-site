import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/+esm';

const db=createClient('https://usurytofnhhfxxipngdd.supabase.co','sb_publishable_jpA7u89wOaxWcyO5NU5cGw_HkQTnOkv',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const OWNER='bonebrakewebsitedesign@gmail.com';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v?new Date(v).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';
const sampleSrc=v=>window.BONEBRAKE_SAMPLE_ARCHIVES?.[v]||v||'';
let ext={prospects:[],outreach:[],designs:[],commands:[],settings:null};

const prospect=id=>ext.prospects.find(x=>x.id===id);
const design=id=>ext.designs.find(x=>x.id===id);
const tone=s=>/fail|reject|declin|unsubscribe|suppress/i.test(s)?'bad':/pending|waiting|draft/i.test(s)?'warn':/sent|reply|interest|complete|approved/i.test(s)?'ok':'info';
const pill=s=>`<span class="status-pill ${tone(s)}">${esc(String(s||'unknown').replaceAll('_',' ').toUpperCase())}</span>`;

function ensureSurfaces(){
  const side=document.getElementById('sideNav');
  if(side&&!side.querySelector('[data-view="outreach"]')){
    const btn=document.createElement('button');btn.dataset.view='outreach';btn.innerHTML='<span>✉</span>Outreach';
    const replies=side.querySelector('[data-view="replies"]');side.insertBefore(btn,replies||null);
  }
  const shell=document.querySelector('.content-shell');
  if(shell&&!document.getElementById('view-outreach')){
    const section=document.createElement('section');section.className='view';section.id='view-outreach';section.innerHTML='<div class="page-head"><div><div class="eyebrow">EMAIL OUTREACH CENTER</div><h1>What prospects received</h1><p>Exact sent message, recipient, Gmail evidence, linked design, and proof sample.</p></div></div><div id="outreachCenterList"></div>';
    const replies=document.getElementById('view-replies');shell.insertBefore(section,replies||null);
  }
  const approvals=document.getElementById('view-approvals');
  if(approvals&&!document.getElementById('commandQueuePanel')){
    const panel=document.createElement('section');panel.className='panel';panel.id='commandQueuePanel';panel.style.marginTop='16px';panel.innerHTML='<div class="panel-head"><div><span class="eyebrow">COMMAND QUEUE</span><h2>ChatGPT handoff audit</h2></div></div><div id="commandQueueList"></div>';
    approvals.appendChild(panel);
  }
}

function renderOutreach(){
  const host=document.getElementById('outreachCenterList');if(!host)return;
  const rows=ext.outreach.filter(x=>['prepared','sent','reply','replied','interested','declined','unsubscribe','suppressed','delivery_failed'].includes(x.event_type));
  host.innerHTML=rows.length?rows.map(o=>{const p=prospect(o.prospect_candidate_id),d=design(o.design_version_id),sample=o.sample_path?sampleSrc(o.sample_path):'';return `<section class="panel" style="margin-bottom:12px"><div class="panel-head"><div><div class="eyebrow">${esc(p?.company_name||'PROSPECT')} · ${esc(fmt(o.created_at))}</div><h2>${esc(o.subject||String(o.event_type).replaceAll('_',' '))}</h2></div>${pill(o.classification||o.status||o.event_type)}</div><div class="detail-grid"><div class="detail-box"><h3>Recipient & Gmail evidence</h3><p><strong>${esc(o.contact_name||'Business contact')}</strong><br>${esc(o.recipient||'—')}<br>Message: ${esc(o.gmail_message_id||'not recorded')}<br>Thread: ${esc(o.gmail_thread_id||'not recorded')}</p>${o.gmail_message_id?`<a class="btn ghost" target="_blank" rel="noopener" href="https://mail.google.com/mail/u/0/#all/${encodeURIComponent(o.gmail_message_id)}">Open in Gmail</a>`:''}</div><div class="detail-box"><h3>Linked website</h3><p>${d?`${esc(d.title||p?.company_name||'Concept')} · ${esc(d.version)}<br>Commit ${esc((d.github_commit||'not recorded').slice(0,12))}`:'No design linked to this event.'}</p>${d?`<button class="btn primary" data-design-id="${d.id}">View What They Saw</button>`:''}</div></div><div class="detail-box" style="margin-top:12px"><h3>Exact message</h3><p style="white-space:pre-wrap">${esc(o.message_body||o.summary||'Message body not persisted.')}</p></div>${sample?`<div class="detail-box" style="margin-top:12px"><h3>Visual sample sent</h3><img class="sample-image" src="${esc(sample)}" alt="Archived outreach visual sample"><p>${esc(o.sample_filename||'Outreach sample')} · ${esc(o.metadata?.original_mime||'image')}</p></div>`:`<div class="detail-box" style="margin-top:12px"><h3>Visual sample</h3><p>${o.event_type==='sent'?'No visual attachment was recorded for this message.':'No sent sample attached to this event.'}</p></div>`}</section>`}).join(''):'<div class="empty">No outreach events recorded yet.</div>';
}

function renderCommands(){
  const host=document.getElementById('commandQueueList');if(!host)return;
  host.innerHTML=ext.commands.length?ext.commands.slice(0,30).map(c=>`<div class="queue-item"><span>⌘</span><div><strong>${esc(String(c.action_type).replaceAll('_',' '))}</strong><small>${esc(c.command)}</small><small>${esc(fmt(c.created_at))} · ${esc(c.requested_by||'owner')}</small></div>${pill(c.execution_status)}</div>`).join(''):'<div class="empty">No ChatGPT commands have been queued from the app yet.</div>';
}

function renderHostingHealth(){
  const grid=document.getElementById('healthGrid');if(!grid||grid.querySelector('[data-ext-health="vercel"]'))return;
  const p=ext.settings?.config?.control_center_preview||{};
  const vercel=p.status==='blocked_by_vercel_daily_deployment_limit'?['Vercel preview','warning','Daily preview deployment quota reached; source/CI remain ready.']:['Vercel preview','unknown','No current preview certification recorded.'];
  const lastSent=ext.outreach.find(x=>x.event_type==='sent'&&x.gmail_message_id);
  const gmail=lastSent?['Gmail','healthy',`Latest verified send ${fmt(lastSent.created_at)}`]:['Gmail','unknown','No verified Control Center send record yet.'];
  const cards=[vercel,gmail];
  cards.forEach(([name,state,detail],i)=>{const el=document.createElement('div');el.className='health-card';el.dataset.extHealth=i?'gmail':'vercel';el.innerHTML=`<strong>${esc(name)}</strong><small>${esc(detail)}</small><div class="health-state ${state}">${state.toUpperCase()}</div>`;grid.appendChild(el)});
}

async function loadExtensions(){
  const {data:{session}}=await db.auth.getSession();if((session?.user?.email||'').toLowerCase()!==OWNER)return;
  ensureSurfaces();
  const [p,o,d,c,s]=await Promise.all([
    db.from('prospect_candidates').select('id,company_name,normalized_domain').order('updated_at',{ascending:false}).limit(1000),
    db.from('prospect_outreach_events').select('*').order('created_at',{ascending:false}).limit(1000),
    db.from('prospect_design_versions').select('*').order('created_at',{ascending:false}).limit(500),
    db.from('control_center_commands').select('*').order('created_at',{ascending:false}).limit(300),
    db.from('automation_settings').select('config').limit(1).maybeSingle()
  ]);
  ext={prospects:p.data||[],outreach:o.data||[],designs:d.data||[],commands:c.data||[],settings:s.data||null};
  renderOutreach();renderCommands();renderHostingHealth();
}

setTimeout(loadExtensions,800);
setInterval(loadExtensions,30000);
db.auth.onAuthStateChange(()=>setTimeout(loadExtensions,300));
