const SB = 'https://usurytofnhhfxxipngdd.supabase.co';
const KEY = 'sb_publishable_jpA7u89wOaxWcyO5NU5cGw_HkQTnOkv';

async function call(name, body, origin) {
  const response = await fetch(`${SB}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', apikey:KEY, Origin:origin },
    body: JSON.stringify(body),
    redirect: 'error'
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if (process.env.VERCEL_ENV === 'production') return res.status(404).json({ ok:false, error:'preview_only' });
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'method_not_allowed' });

  const host = String(req.headers.host || 'bonebrake-complete-site-1-nick-websites.vercel.app');
  const origin = `https://${host}`;
  const marker = `phase11_${Date.now()}`;
  const sessionId = crypto.randomUUID();

  const analytics = await call('analytics-track', {
    session_id:sessionId, event_type:'page_view', path:'/phase11-smoke', source:'phase11_qa', campaign:marker, metadata:{ marker }
  }, origin);

  const lead = await call('lead-intake', {
    name:'Phase 11 QA', email:`${marker}@example.com`, phone:'312-555-0100', company:'Phase 11 QA — DELETE',
    website:'https://example.com', description:'Automated preview verification record. This row must be deleted after the Phase 11 end-to-end smoke test.',
    budget:'$5,000+', lead_source:'phase11_qa', utm_source:'phase11_qa', utm_campaign:marker,
    landing_page:'/phase11-smoke', session_id:sessionId, form_loaded_at:Date.now()-5000
  }, origin);

  const audit = await call('audit-run', {
    url:'https://example.com', requested_by:`${marker}@example.com`, session_id:sessionId,
    source:'phase11_qa', campaign:marker, referrer:origin
  }, origin);

  const ok = analytics.ok && lead.ok && audit.ok;
  return res.status(ok ? 200 : 502).json({
    ok, marker, session_id:sessionId,
    analytics:{ ok:analytics.ok, status:analytics.status, code:analytics.payload?.error || null },
    lead:{ ok:lead.ok, status:lead.status, lead_id:lead.payload?.lead_id || null, persisted:lead.payload?.persisted === true },
    audit:{ ok:audit.ok, status:audit.status, audit_id:audit.payload?.audit_id || null, opportunity_score:audit.payload?.heuristic?.opportunity_score ?? null },
  });
}
