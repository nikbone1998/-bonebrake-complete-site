(()=>{
const SB='https://usurytofnhhfxxipngdd.supabase.co';
const KEY='sb_publishable_jpA7u89wOaxWcyO5NU5cGw_HkQTnOkv';
const AUDIT=`${SB}/functions/v1/audit-run`;
const TRACK=`${SB}/functions/v1/analytics-track`;
const uuid=()=>crypto.randomUUID();
let session=localStorage.getItem('bwd_session_id');if(!session){session=uuid();localStorage.setItem('bwd_session_id',session)}
const params=new URLSearchParams(location.search);const attribution={source:params.get('utm_source')||'',medium:params.get('utm_medium')||'',campaign:params.get('utm_campaign')||'',referrer:document.referrer||''};
const el=id=>document.getElementById(id);const form=el('auditForm'),submit=el('auditSubmit'),status=el('auditStatus'),result=el('auditResult');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function alert(message,type='info'){status.innerHTML=`<div class="p11-alert ${type}">${esc(message)}</div>`}
async function track(type,metadata={}){try{await fetch(TRACK,{method:'POST',headers:{'Content-Type':'application/json','apikey':KEY},body:JSON.stringify({session_id:session,event_type:type,path:location.pathname,...attribution,metadata}),keepalive:true})}catch{}}
function metric(label,value,note=''){return `<div class="p11-metric"><small>${esc(label)}</small><strong>${esc(value)}</strong>${note?`<span>${esc(note)}</span>`:''}</div>`}
function finding(kind,title,detail,statusClass=''){return `<div class="audit-finding"><div class="kind"><span class="p11-status ${statusClass}">${esc(kind)}</span></div><div><h4>${esc(title)}</h4><p>${esc(detail)}</p></div></div>`}
function render(data){
 const m=data.measured||{},metrics=m.metrics||{},findings=Array.isArray(m.findings)?m.findings:[],recs=Array.isArray(data.recommendations)?data.recommendations:[];
 el('resultTitle').textContent=m.title||'Website structural review';
 el('resultMeta').textContent=`Saved audit ${data.audit_id} · ${new Date(data.created_at).toLocaleString()}`;
 el('metricGrid').innerHTML=[
   metric('Opportunity signal',`${data.heuristic?.opportunity_score??'—'}/100','Heuristic: more structural gaps can mean more redesign opportunity'),
   metric('HTTP status',m.http_status??'—','Measured response'),
   metric('Headings',`${metrics.h1_count??0} H1 · ${metrics.h2_count??0} H2`,'Measured structure'),
   metric('Contact paths',`${metrics.tel_link_count??0} phone · ${metrics.mailto_link_count??0} email`,'Measured links')
 ].join('');
 el('measuredFindings').innerHTML=findings.length?findings.map(f=>finding('Measured',f.title||f.id,f.detail||'',f.status==='pass'?'ok':f.status==='warn'?'warn':'')).join(''):'<div class="p11-empty">No structured findings were returned.</div>';
 el('recommendations').innerHTML=recs.length?recs.map(r=>finding('Recommendation',r.title,r.detail,r.priority==='high'?'warn':'')).join(''):'<div class="p11-empty">No major structural recommendations were generated from this page.</div>';
 const cp=el('comparisonPanel'),cb=el('comparisonBody');if(data.comparison){const c=data.comparison;cp.style.display='block';cb.innerHTML=`<div class="p11-grid-3">${metric('Score change',`${c.opportunity_score_delta>0?'+':''}${c.opportunity_score_delta}`,'Compared with previous audit')}${metric('Warning change',c.warning_count_delta===null?'—':`${c.warning_count_delta>0?'+':''}${c.warning_count_delta}`,'Measured warning count')}${metric('Title changed',c.title_changed?'Yes':'No','Measured page title')}</div><p style="margin:16px 0 0;color:#6d6962;font:500 11px/1.6 system-ui,sans-serif">Previous saved audit: ${esc(new Date(c.previous_created_at).toLocaleString())}. A higher opportunity score does not mean worse business performance; it means this structural audit detected more redesign opportunities.</p>`}else{cp.style.display='none'}
 result.classList.add('show');result.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
}
form?.addEventListener('submit',async e=>{
 e.preventDefault();const url=el('auditUrl').value.trim();submit.disabled=true;submit.textContent='Inspecting…';alert('Fetching the public page and checking measurable structure.','info');track('audit_start',{url_host:(()=>{try{return new URL(url).hostname}catch{return''}})()});
 try{const res=await fetch(AUDIT,{method:'POST',headers:{'Content-Type':'application/json','apikey':KEY},body:JSON.stringify({url,session_id:session,...attribution})});const data=await res.json().catch(()=>({}));if(!res.ok||!data.ok)throw new Error(data.message||'The audit could not be completed.');alert('Audit completed and saved.','success');render(data)}catch(err){alert(err?.message||'The audit could not be completed safely.','error')}finally{submit.disabled=false;submit.textContent='Run live audit ↗'}
});
track('page_view',{page:'website-audit'});
})();