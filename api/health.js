const BUILD = 'phase8-operational-platform';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const payload = {
    ok: true,
    service: 'bonebrake-web-design',
    build: BUILD,
    environment: process.env.VERCEL_ENV || 'unknown',
    region: process.env.VERCEL_REGION || null,
    lead_delivery: process.env.LEAD_WEBHOOK_URL ? 'webhook_adapter_configured' : 'client_provider_fallback',
    audit: 'live_heuristic',
    timestamp: new Date().toISOString()
  };

  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).json(payload);
}
