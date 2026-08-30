import crypto from 'node:crypto';

const MAX_BODY_BYTES = 24_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;
  if (typeof body !== 'string' || Buffer.byteLength(body) > MAX_BODY_BYTES) return {};
  try { return JSON.parse(body); } catch { return {}; }
}

function clean(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalise(payload) {
  return {
    lead_id: clean(payload.lead_id, 100) || `bwd_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`,
    created_at: clean(payload.created_at, 80) || new Date().toISOString(),
    intent: clean(payload.intent || payload.form_intent, 80),
    name: clean(payload.name, 160),
    company: clean(payload.company || payload.business, 200),
    email: clean(payload.email, 254).toLowerCase(),
    phone: clean(payload.phone, 80),
    website: clean(payload.website, 2048),
    project_type: clean(payload.project_type, 160),
    budget: clean(payload.budget, 120),
    timing: clean(payload.timing, 120),
    primary_goal: clean(payload.primary_goal || payload.goal, 500),
    description: clean(payload.description || payload.message, 5000),
    lead_source: clean(payload.lead_source, 200),
    landing_page: clean(payload.landing_page || payload.landing_path, 2048),
    referrer: clean(payload.referrer, 2048),
    utm_source: clean(payload.utm_source, 200),
    utm_medium: clean(payload.utm_medium, 200),
    utm_campaign: clean(payload.utm_campaign, 200),
    utm_content: clean(payload.utm_content, 200),
    utm_term: clean(payload.utm_term, 200)
  };
}

function safeWebhook(urlString) {
  if (!urlString) return null;
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'https:') return null;
    return url;
  } catch { return null; }
}

function signature(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ success:false, code:'method_not_allowed' });
  }

  const rawSize = typeof req.body === 'string' ? Buffer.byteLength(req.body) : Buffer.byteLength(JSON.stringify(req.body || {}));
  if (rawSize > MAX_BODY_BYTES) return res.status(413).json({ success:false, code:'payload_too_large' });

  const incoming = parseBody(req.body);
  if (clean(incoming._honey || incoming.honeypot, 200)) {
    return res.status(200).json({ success:true, accepted:true });
  }

  const lead = normalise(incoming);
  if (!lead.name || !EMAIL_RE.test(lead.email)) {
    return res.status(400).json({ success:false, code:'invalid_lead', message:'Name and a valid email address are required.' });
  }

  const loadedAt = Number(incoming.form_loaded_at || 0);
  if (loadedAt && Date.now() - loadedAt < 1200) {
    return res.status(429).json({ success:false, code:'submitted_too_quickly' });
  }

  const webhook = safeWebhook(process.env.LEAD_WEBHOOK_URL);
  if (!webhook) {
    return res.status(503).json({
      success:false,
      code:'delivery_adapter_unconfigured',
      lead_id:lead.lead_id,
      fallback:'client_provider',
      message:'Server-side lead delivery is not configured. Use the client-side provider fallback.'
    });
  }

  const body = JSON.stringify({ source:'bonebrake-web-design', version:'phase8', lead });
  const headers = { 'Content-Type':'application/json', 'User-Agent':'BonebrakeLeadAdapter/1.0' };
  if (process.env.LEAD_WEBHOOK_SECRET) headers['X-BWD-Signature'] = `sha256=${signature(process.env.LEAD_WEBHOOK_SECRET, body)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(webhook, { method:'POST', headers, body, signal:controller.signal, redirect:'error' });
    clearTimeout(timer);
    if (!response.ok) {
      console.error('lead_delivery_failed', { status:response.status, lead_id:lead.lead_id });
      return res.status(502).json({ success:false, code:'delivery_failed', lead_id:lead.lead_id, fallback:'client_provider' });
    }
    console.info('lead_delivered', { lead_id:lead.lead_id, intent:lead.intent || 'unknown' });
    return res.status(200).json({ success:true, lead_id:lead.lead_id, delivery:'webhook' });
  } catch (error) {
    clearTimeout(timer);
    console.error('lead_delivery_error', { lead_id:lead.lead_id, type:error?.name || 'error' });
    return res.status(502).json({ success:false, code:error?.name === 'AbortError' ? 'delivery_timeout' : 'delivery_error', lead_id:lead.lead_id, fallback:'client_provider' });
  }
}
