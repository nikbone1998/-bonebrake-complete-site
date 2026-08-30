const OPERATIONS_BUILD = 'phase8-operational-platform';
const FRONTEND_BUILD = 'pre-phase8-production-repo';
const FRONTEND_TARGET = 'phase8-operational-platform';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const frontendSynchronized = FRONTEND_BUILD === FRONTEND_TARGET;
  const payload = {
    ok: true,
    service: 'bonebrake-web-design',
    operations_build: OPERATIONS_BUILD,
    frontend_build: FRONTEND_BUILD,
    frontend_target: FRONTEND_TARGET,
    frontend_synchronized: frontendSynchronized,
    release_status: frontendSynchronized ? 'phase8_complete' : 'phase8_operations_live_frontend_sync_pending',
    environment: process.env.VERCEL_ENV || 'unknown',
    region: process.env.VERCEL_REGION || null,
    lead_delivery: process.env.LEAD_WEBHOOK_URL ? 'webhook_adapter_configured' : 'client_provider_fallback',
    audit: 'live_heuristic',
    timestamp: new Date().toISOString()
  };

  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).json(payload);
}
