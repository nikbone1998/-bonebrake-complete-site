import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/+esm'

const SB='https://usurytofnhhfxxipngdd.supabase.co'
const KEY='sb_publishable_jpA7u89wOaxWcyO5NU5cGw_HkQTnOkv'
const OWNER='bonebrakewebsitedesign@gmail.com'
const db=createClient(SB,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})
const $=id=>document.getElementById(id)
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n||0))
const when=v=>v?new Date(v).toLocaleString():'—'
const dateInput=v=>v?new Date(v).toISOString().slice(0,10):''
const statuses=['new','reviewing','qualified','preview_created','contacted','consultation','proposal','won','lost']
const projectStatuses=['planning','active','review','launch_ready','complete','paused','cancelled']
const paymentStates=['unpaid','deposit_paid','partial','paid','refunded']
let state={leads:[],projects:[],audits:[],activity:[],events:[],content:[]}

function note(target,message,type='info'){target.innerHTML=`<div class="p11-alert ${type}">${esc(message)}</div>`}
function metric(label,value,noteText=''){return `<div class="p11-metric"><small>${esc(label)}</small><strong>${esc(value)}</strong>${noteText?`<span>${esc(noteText)}</span>`:''}</div>`}
function optionList(values,current){return values.map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(v.replaceAll('_',' '))}</option>`).join('')}
function statusRank(s){return statuses.indexOf(s)}

async function ensureOwner(session){
 const email=session?.user?.email?.toLowerCase()||''
 if(email!==OWNER){if(session) await db.auth.signOut();$('loginView').hidden=false;$('appView').hidden=true;$('signOutBtn').hidden=true;return false}
 $('loginView').hidden=true;$('appView').hidden=false;$('signOutBtn').hidden=false;return true
}

async function loadAll(){
 $('syncNote').textContent='Syncing live operational data…'
 const [leads,projects,audits,activity,events,content]=await Promise.all([
  db.from('leads').select('*').order('created_at',{ascending:false}).limit(500),
  db.from('projects').select('*').order('created_at',{ascending:false}).limit(300),
  db.from('audits').select('id,created_at,url,normalized_host,requested_by,status,opportunity_score,summary,report').order('created_at',{ascending:false}).limit(200),
  db.from('activity').select('*').order('created_at',{ascending:false}).limit(100),
  db.from('analytics_events').select('*').order('created_at',{ascending:false}).limit(3000),
  db.from('content_items').select('*').order('type').order('title')
 ])
 const errors=[leads.error,projects.error,audits.error,activity.error,events.error,content.error].filter(Boolean)
 if(errors.length){$('syncNote').textContent='One or more operational queries failed.';console.error(errors);return}
 state={leads:leads.data||[],projects:projects.data||[],audits:audits.data||[],activity:activity.data||[],events:events.data||[],content:content.data||[]}
 $('syncNote').textContent=`Live sync · ${new Date().toLocaleTimeString()}`
 renderAll()
}

function renderAll(){renderMetrics();renderFollowups();renderActivity();renderPipeline();renderLeads();renderProjects();renderAudits();renderAnalytics();renderContent()}
function renderMetrics(){
 const active=state.leads.filter(l=>!['won','lost'].includes(l.status)).length
 const qualified=state.leads.filter(l=>statusRank(l.status)>=statusRank('qualified')&&!['won','lost'].includes(l.status)).length
 const due=state.leads.filter(l=>l.follow_up_at&&new Date(l.follow_up_at)<=new Date()&&!['won','lost'].includes(l.status)).length
 const proposals=state.leads.filter(l=>l.status==='proposal').length
 const activeProjects=state.projects.filter(p=>['planning','active','review','launch_ready'].includes(p.status)).length
 const pipeline=state.leads.filter(l=>!['won','lost'].includes(l.status)).reduce((s,l)=>s+Number(l.estimated_value||0),0)
 const won=state.projects.reduce((s,p)=>s+Number(p.agreed_price||0),0)
 $('overviewMetrics').innerHTML=[metric('New leads',state.leads.filter(l=>l.status==='new').length),metric('Active leads',active),metric('Qualified',qualified),metric('Follow-ups due',due),metric('Proposals',proposals),metric('Active projects',activeProjects),metric('Pipeline value',money(pipeline),'Recorded estimates'),metric('Recorded project value',money(won),'Agreed prices')].join('')
}
function renderFollowups(){const due=state.leads.filter(l=>l.follow_up_at&&new Date(l.follow_up_at)<=new Date()&&!['won','lost'].includes(l.status)).sort((a,b)=>new Date(a.follow_up_at)-new Date(b.follow_up_at));$('followUps').innerHTML=due.length?due.slice(0,10).map(l=>`<div class="audit-finding"><div class="kind"><span class="p11-status warn">${esc(l.priority)}</span></div><div><h4>${esc(l.company||l.name)}</h4><p>${esc(l.email)} · due ${esc(when(l.follow_up_at))}</p></div></div>`).join(''):'<div class="p11-empty">No overdue follow-ups.</div>'}
function renderActivity(){$('recentActivity').innerHTML=state.activity.length?state.activity.slice(0,10).map(a=>`<div class="audit-finding"><div class="kind">${esc(a.entity_type)}</div><div><h4>${esc(a.action.replaceAll('_',' '))}</h4><p>${esc(when(a.created_at))}</p></div></div>`).join(''):'<div class="p11-empty">No recorded activity yet.</div>'}
function renderPipeline(){const board=$('pipelineBoard');board.innerHTML=statuses.map(s=>{const rows=state.leads.filter(l=>l.status===s);return `<section class="pipeline-col"><div class="pipeline-col-head"><span>${esc(s.replaceAll('_',' '))}</span><span>${rows.length}</span></div>${rows.slice(0,12).map(l=>`<div class="pipeline-card"><strong>${esc(l.company||l.name)}</strong><small>${esc(l.email)}</small><small>${money(l.estimated_value)} · score ${l.opportunity_score||0}</small></div>`).join('')}</section>`}).join('')}

function renderLeads(filter=''){let rows=state.leads;const q=filter.trim().toLowerCase();if(q)rows=rows.filter(l=>[l.name,l.company,l.email,l.website,l.status].some(v=>String(v||'').toLowerCase().includes(q)));$('leadTableWrap').innerHTML=rows.length?`<table class="p11-table"><thead><tr><th>Lead</th><th>Status</th><th>Priority</th><th>Value</th><th>Follow-up</th><th>Attribution</th><th>Notes</th><th></th></tr></thead><tbody>${rows.map(l=>`<tr data-lead="${l.id}"><td><strong>${esc(l.company||l.name)}</strong><br><a href="mailto:${esc(l.email)}">${esc(l.email)}</a>${l.phone?`<br>${esc(l.phone)}`:''}${l.website?`<br><a href="${esc(l.website)}" target="_blank" rel="noopener">website ↗</a>`:''}<br><small>Score ${l.opportunity_score||0} · ${esc(when(l.created_at))}</small></td><td><select data-field="status">${optionList(statuses,l.status)}</select></td><td><select data-field="priority">${optionList(['low','normal','high','urgent'],l.priority)}</select></td><td><input data-field="estimated_value" type="number" min="0" step="100" value="${Number(l.estimated_value||0)}"></td><td><input data-field="follow_up_at" type="date" value="${dateInput(l.follow_up_at)}"></td><td>${esc(l.utm_source||l.source||'direct')}<br><small>${esc(l.utm_campaign||l.landing_page||'')}</small></td><td><input data-field="notes" value="${esc(l.notes||'')}" placeholder="Add note"></td><td><button class="p11-btn secondary save-lead" type="button">Save</button></td></tr>`).join('')}</tbody></table>`:'<div class="p11-empty">No matching leads.</div>'}

function renderProjects(){$('projectTableWrap').innerHTML=state.projects.length?`<table class="p11-table"><thead><tr><th>Client</th><th>Status</th><th>Payment</th><th>Value</th><th>Milestone</th><th>Launch</th><th></th></tr></thead><tbody>${state.projects.map(p=>`<tr data-project="${p.id}"><td><strong>${esc(p.client_name)}</strong><br><small>${esc(p.project_type||'')}</small></td><td><select data-field="status">${optionList(projectStatuses,p.status)}</select></td><td><select data-field="payment_state">${optionList(paymentStates,p.payment_state)}</select></td><td>${money(p.agreed_price)}<br><small>Balance ${money(p.balance)}</small></td><td><input data-field="current_milestone" value="${esc(p.current_milestone||'')}" placeholder="Current milestone"></td><td><input data-field="target_launch" type="date" value="${p.target_launch||''}"></td><td><button class="p11-btn secondary save-project" type="button">Save</button></td></tr>`).join('')}</tbody></table>`:'<div class="p11-empty">No projects recorded yet. Moving a lead to WON will create one automatically.</div>'}

function renderAudits(){$('auditTableWrap').innerHTML=state.audits.length?`<table class="p11-table"><thead><tr><th>Website</th><th>Status</th><th>Opportunity</th><th>Warnings</th><th>Saved</th></tr></thead><tbody>${state.audits.map(a=>`<tr><td><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.normalized_host)} ↗</a></td><td><span class="p11-status ${a.status==='complete'?'ok':'bad'}">${esc(a.status)}</span></td><td>${a.opportunity_score??'—'}</td><td>${a.summary?.warning_count??'—'}</td><td>${esc(when(a.created_at))}</td></tr>`).join('')}</tbody></table>`:'<div class="p11-empty">No saved audits yet.</div>'}

function renderAnalytics(){
 const sessions=new Set(state.events.filter(e=>e.event_type==='page_view').map(e=>e.session_id)).size
 const ctas=state.events.filter(e=>e.event_type==='cta_click').length
 const inquiries=state.leads.length
 const won=state.leads.filter(l=>l.status==='won').length
 const qualified=state.leads.filter(l=>statusRank(l.status)>=statusRank('qualified')||l.status==='won').length
 $('analyticsMetrics').innerHTML=[metric('Tracked sessions',sessions),metric('CTA clicks',ctas),metric('Inquiries',inquiries),metric('Won clients',won)].join('')
 const sources=new Map();state.leads.forEach(l=>{const k=l.utm_source||l.source||'direct / unknown';sources.set(k,(sources.get(k)||0)+1)});$('sourceSummary').innerHTML=sources.size?[...sources.entries()].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="audit-finding"><div class="kind">Source</div><div><h4>${esc(k)}</h4><p>${v} lead${v===1?'':'s'}</p></div></div>`).join(''):'<div class="p11-empty">No lead attribution yet.</div>'
 const counts={};state.events.forEach(e=>counts[e.event_type]=(counts[e.event_type]||0)+1);counts['qualified_leads']=qualified;counts['won_clients']=won;$('eventSummary').innerHTML=Object.entries(counts).map(([k,v])=>`<div class="audit-finding"><div class="kind">Funnel</div><div><h4>${esc(k.replaceAll('_',' '))}</h4><p>${v}</p></div></div>`).join('')||'<div class="p11-empty">No funnel events yet.</div>'
}

function renderContent(){$('contentList').innerHTML=state.content.length?state.content.map(c=>`<button type="button" class="content-pick" data-content="${c.id}" style="display:block;width:100%;text-align:left;border:0;border-bottom:1px solid rgba(17,17,15,.08);padding:13px 4px;background:none;cursor:pointer"><strong>${esc(c.title)}</strong><br><small>${esc(c.type)} · ${c.published?'published':'draft'}</small></button>`).join(''):'<div class="p11-empty">No structured content.</div>'}
function pickContent(id){const c=state.content.find(x=>x.id===id);if(!c)return;const f=$('contentForm');f.elements.id.value=c.id;f.elements.title.value=c.title;f.elements.payload.value=JSON.stringify(c.payload,null,2);f.elements.published.checked=!!c.published}

$('loginForm')?.addEventListener('submit',async e=>{e.preventDefault();const email=$('loginEmail').value.trim().toLowerCase();if(email!==OWNER){note($('loginStatus'),'This dashboard is restricted to the authorized owner account.','error');return}const btn=$('loginBtn');btn.disabled=true;btn.textContent='Sending…';const {error}=await db.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:`${location.origin}${location.pathname}`}});if(error)note($('loginStatus'),error.message,'error');else note($('loginStatus'),'Secure sign-in link sent. Open it from the owner inbox on this device.','success');btn.disabled=false;btn.textContent='Send secure sign-in link ↗'})
$('signOutBtn')?.addEventListener('click',async()=>{await db.auth.signOut();location.reload()})

document.querySelectorAll('.dashboard-tabs button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.dashboard-tabs button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.dashboard-view').forEach(v=>v.classList.toggle('active',v.id===`view-${b.dataset.tab}`))}))
$('leadSearch')?.addEventListener('input',e=>renderLeads(e.target.value))
$('leadTableWrap')?.addEventListener('click',async e=>{const btn=e.target.closest('.save-lead');if(!btn)return;const row=btn.closest('[data-lead]');const id=row.dataset.lead;const fields={};row.querySelectorAll('[data-field]').forEach(i=>fields[i.dataset.field]=i.value||null);fields.estimated_value=Number(fields.estimated_value||0);fields.follow_up_at=fields.follow_up_at?new Date(`${fields.follow_up_at}T17:00:00`).toISOString():null;btn.disabled=true;const {error}=await db.from('leads').update(fields).eq('id',id);btn.disabled=false;if(error){alert(error.message);return}await loadAll()})
$('projectTableWrap')?.addEventListener('click',async e=>{const btn=e.target.closest('.save-project');if(!btn)return;const row=btn.closest('[data-project]');const id=row.dataset.project;const fields={};row.querySelectorAll('[data-field]').forEach(i=>fields[i.dataset.field]=i.value||null);btn.disabled=true;const {error}=await db.from('projects').update(fields).eq('id',id);btn.disabled=false;if(error){alert(error.message);return}await loadAll()})
$('projectForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;const fd=new FormData(f);const agreed=Number(fd.get('agreed_price')||0);const payload={client_name:String(fd.get('client_name')||'').trim(),project_type:String(fd.get('project_type')||'').trim()||null,agreed_price:agreed,balance:agreed,target_launch:fd.get('target_launch')||null,notes:String(fd.get('notes')||'').trim()||null};const {error}=await db.from('projects').insert(payload);if(error)note($('projectStatus'),error.message,'error');else{note($('projectStatus'),'Project created.','success');f.reset();await loadAll()}})
$('contentList')?.addEventListener('click',e=>{const b=e.target.closest('[data-content]');if(b)pickContent(b.dataset.content)})
$('contentForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;const id=f.elements.id.value;if(!id){note($('contentStatus'),'Choose a content item first.','error');return}let payload;try{payload=JSON.parse(f.elements.payload.value)}catch{note($('contentStatus'),'The JSON payload is invalid.','error');return}const {error}=await db.from('content_items').update({title:f.elements.title.value.trim(),payload,published:f.elements.published.checked}).eq('id',id);if(error)note($('contentStatus'),error.message,'error');else{note($('contentStatus'),'Content saved. Public published content will refresh on the site.','success');await loadAll();pickContent(id)}})

db.auth.onAuthStateChange(async(_event,session)=>{if(await ensureOwner(session))await loadAll()})
const {data:{session}}=await db.auth.getSession();if(await ensureOwner(session))await loadAll()
