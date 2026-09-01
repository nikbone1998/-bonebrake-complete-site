import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/+esm';

const db=createClient('https://usurytofnhhfxxipngdd.supabase.co','sb_publishable_jpA7u89wOaxWcyO5NU5cGw_HkQTnOkv',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const OWNER='bonebrakewebsitedesign@gmail.com';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v?new Date(v).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';
let cache={prospects:[],runs:[],designs:[],outreach:[],commands:[],projects:[]};
let fingerprint='';
let reloading=false;

function activeView(){return document.querySelector('.view.active')?.id?.replace(/^view-/,'')||'home'}
function saveView(){sessionStorage.setItem('bonebrake-control-view',activeView())}
function restoreView(){const v=sessionStorage.getItem('bonebrake-control-view');if(!v||v==='home')return;setTimeout(()=>{document.querySelector(`[data-view="${CSS.escape(v)}"]`)?.click()},250)}

function ensureSearchUI(){
  if(document.getElementById('globalSearchBtn'))return;
  const btn=document.createElement('button');btn.id='globalSearchBtn';btn.className='btn ghost';btn.type='button';btn.innerHTML='⌕ Search';btn.style.cssText='position:fixed;right:18px;top:16px;z-index:26;box-shadow:0 8px 26px rgba(0,0,0,.24)';
  document.body.appendChild(btn);
  const dialog=document.createElement('dialog');dialog.id='globalSearchModal';dialog.className='modal';dialog.innerHTML='<div class="modal-card" style="width:min(760px,calc(100% - 20px));padding-top:22px"><button class="modal-close" id="globalSearchClose">×</button><div class="eyebrow">GLOBAL SEARCH</div><h2 style="margin:8px 0 16px">Find anything in Autopilot</h2><input id="globalSearchInput" type="search" autocomplete="off" placeholder="Company, domain, owner, email, city, Gmail ID, commit…" style="width:100%;padding:14px 15px;border:1px solid rgba(255,255,255,.14);border-radius:14px;background:#070a0f;color:white;outline:none"><div id="globalSearchResults" style="margin-top:13px;max-height:60vh;overflow:auto"></div></div>';
  document.body.appendChild(dialog);
  btn.addEventListener('click',()=>{dialog.showModal();setTimeout(()=>document.getElementById('globalSearchInput')?.focus(),50)});
  document.getElementById('globalSearchClose').addEventListener('click',()=>dialog.close());
  document.getElementById('globalSearchInput').addEventListener('input',e=>renderSearch(e.target.value));
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
  if(matchMedia('(max-width:760px)').matches)btn.style.cssText='position:fixed;right:76px;top:calc(11px + env(safe-area-inset-top));z-index:26;padding:8px 10px;font-size:11px';
}

function result(type,title,detail,action,id){return `<button class="global-result" data-search-action="${esc(action)}" data-search-id="${esc(id||'')}" style="display:grid;width:100%;grid-template-columns:82px 1fr;gap:12px;text-align:left;padding:13px 7px;border:0;border-bottom:1px solid rgba(255,255,255,.08);background:transparent;color:white;cursor:pointer"><span class="eyebrow">${esc(type)}</span><span><strong style="display:block;font-size:13px">${esc(title)}</strong><small style="display:block;margin-top:4px;color:#8f9bad;line-height:1.4">${esc(detail)}</small></span></button>`}
function searchable(v,q){return String(v??'').toLowerCase().includes(q)}
function renderSearch(raw){
  const q=raw.trim().toLowerCase(),host=document.getElementById('globalSearchResults');if(!host)return;
  if(q.length<2){host.innerHTML='<div class="empty">Type at least two characters.</div>';return}
  const rows=[];
  cache.prospects.filter(p=>[p.company_name,p.normalized_domain,p.contact_name,p.contact_title,p.email,p.phone,p.city,p.region,p.industry,p.status,p.rejection_reason].some(v=>searchable(v,q))).slice(0,12).forEach(p=>rows.push(result('PROSPECT',p.company_name,`${p.normalized_domain||''} · ${p.status||''} · ${p.email||''}`,'prospect',p.id)));
  cache.designs.filter(d=>[d.title,d.version,d.github_commit,d.preview_path,d.generation_reason].some(v=>searchable(v,q))).slice(0,10).forEach(d=>rows.push(result('WEBSITE',d.title||d.version,`${d.version||''} · commit ${d.github_commit?.slice(0,12)||'—'}`,'design',d.id)));
  cache.outreach.filter(o=>[o.contact_name,o.recipient,o.subject,o.gmail_message_id,o.gmail_thread_id,o.classification,o.status].some(v=>searchable(v,q))).slice(0,10).forEach(o=>rows.push(result('OUTREACH',o.subject||o.event_type,`${o.recipient||''} · Gmail ${o.gmail_message_id||'—'}`,'outreach',o.prospect_candidate_id)));
  cache.runs.filter(r=>[r.prospect_name,r.status,r.stage,r.current_action,r.result_summary,r.github_commit,r.gmail_message_id].some(v=>searchable(v,q))).slice(0,8).forEach(r=>rows.push(result('RUN',r.prospect_name||r.status,`${r.status||''} · ${fmt(r.started_at)} · ${r.result_summary||''}`,'runs',r.id)));
  cache.commands.filter(c=>[c.action_type,c.command,c.execution_status].some(v=>searchable(v,q))).slice(0,6).forEach(c=>rows.push(result('COMMAND',String(c.action_type||'').replaceAll('_',' '),`${c.execution_status||''} · ${fmt(c.created_at)}`,'approvals',c.id)));
  cache.projects.filter(p=>[p.client_name,p.project_type,p.status,p.payment_state,p.current_milestone].some(v=>searchable(v,q))).slice(0,6).forEach(p=>rows.push(result('PROJECT',p.client_name,`${p.status||''} · ${p.payment_state||''} · ${p.current_milestone||''}`,'home',p.id)));
  host.innerHTML=rows.length?rows.slice(0,30).join(''):'<div class="empty">No matching Control Center records.</div>';
}

function handleResult(e){
  const b=e.target.closest('[data-search-action]');if(!b)return;
  const action=b.dataset.searchAction,id=b.dataset.searchId;
  document.getElementById('globalSearchModal')?.close();
  if(action==='prospect'){
    document.querySelector('[data-view="prospects"]')?.click();
    setTimeout(()=>{const card=document.querySelector(`[data-prospect-id="${CSS.escape(id)}"]`);if(card)card.click();else{const input=document.getElementById('prospectSearch');if(input){const p=cache.prospects.find(x=>x.id===id);input.value=p?.company_name||'';input.dispatchEvent(new Event('input',{bubbles:true}))}}},100);
    return;
  }
  if(action==='design'){
    document.querySelector('[data-view="websites"]')?.click();
    setTimeout(()=>document.querySelector(`[data-design-id="${CSS.escape(id)}"]`)?.click(),100);return;
  }
  if(action==='outreach'){document.querySelector('[data-view="outreach"]')?.click();return}
  document.querySelector(`[data-view="${CSS.escape(action)}"]`)?.click();
}

async function fetchCache(){
  const [p,r,d,o,c,pr]=await Promise.all([
    db.from('prospect_candidates').select('*').order('updated_at',{ascending:false}).limit(1000),
    db.from('autopilot_control_runs').select('*').order('started_at',{ascending:false}).limit(500),
    db.from('prospect_design_versions').select('*').order('updated_at',{ascending:false}).limit(500),
    db.from('prospect_outreach_events').select('*').order('updated_at',{ascending:false}).limit(1000),
    db.from('control_center_commands').select('*').order('updated_at',{ascending:false}).limit(300),
    db.from('projects').select('*').order('updated_at',{ascending:false}).limit(300)
  ]);
  cache={prospects:p.data||[],runs:r.data||[],designs:d.data||[],outreach:o.data||[],commands:c.data||[],projects:pr.data||[]};
  const newest=(arr,a='updated_at',b='created_at')=>arr.reduce((m,x)=>Math.max(m,new Date(x[a]||x[b]||0).getTime()||0),0);
  return [cache.prospects.length,newest(cache.prospects),cache.runs.length,newest(cache.runs,'completed_at','started_at'),cache.designs.length,newest(cache.designs),cache.outreach.length,newest(cache.outreach),cache.commands.length,newest(cache.commands),cache.projects.length,newest(cache.projects)].join('|');
}

async function pollForChanges(){
  const {data:{session}}=await db.auth.getSession();if((session?.user?.email||'').toLowerCase()!==OWNER)return;
  const next=await fetchCache();
  if(fingerprint&&next!==fingerprint&&!reloading){
    reloading=true;saveView();
    const toast=document.createElement('div');toast.textContent='New Autopilot activity · refreshing…';toast.style.cssText='position:fixed;left:50%;bottom:calc(78px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:80;padding:10px 13px;border:1px solid rgba(95,156,255,.3);border-radius:999px;background:#111a28;color:#dce8f8;font:700 11px system-ui;box-shadow:0 10px 30px rgba(0,0,0,.35)';document.body.appendChild(toast);
    setTimeout(()=>location.reload(),650);return;
  }
  fingerprint=next;
}

async function boot(){
  const {data:{session}}=await db.auth.getSession();if((session?.user?.email||'').toLowerCase()!==OWNER)return;
  ensureSearchUI();document.addEventListener('click',handleResult);fingerprint=await fetchCache();restoreView();
  setInterval(()=>{if(document.visibilityState==='visible'&&!document.querySelector('dialog[open]'))pollForChanges()},20000);
}

setTimeout(boot,950);
db.auth.onAuthStateChange(()=>setTimeout(boot,400));
