const RELEASE = '12.0.0';
const BUILD = 'phase12-six-figure-platform';
const DATA_HEALTH_URL = 'https://usurytofnhhfxxipngdd.supabase.co/functions/v1/system-health';
const PUBLISHABLE_KEY = 'sb_publishable_jpA7u89wOaxWcyO5NU5cGw_HkQTnOkv';

async function dataPlaneHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2800);
  try {
    const response = await fetch(DATA_HEALTH_URL, {
      method: 'GET',
      headers: { apikey: PUBLISHABLE_KEY, Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok && payload?.ok === true,
      status: response.status,
      database: payload?.database || (response.ok ? 'unknown' : 'unreachable'),
      latency_ms: Number.isFinite(payload?.latency_ms) ? payload.latency_ms : null,
      tables: payload?.tables || null
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      database: error?.name === 'AbortError' ? 'timeout' : 'unreachable',
      latency_ms: null,
      tables: null
    };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const dataPlane = await dataPlaneHealth();
  const environment = process.env.VERCEL_ENV || 'unknown';
  const ok = dataPlane.ok;
  const payload = {
    ok,
    service: 'bonebrake-web-design',
    release: RELEASE,
    build: BUILD,
    release_status: environment === 'production'
      ? (ok ? 'phase12_production_healthy' : 'phase12_production_degraded')
      : (ok ? 'phase12_preview_healthy' : 'phase12_preview_degraded'),
    environment,
    region: process.env.VERCEL_REGION || null,
    frontend_backend_synchronized: true,
    data_plane: dataPlane,
    lead_pipeline: 'first_party_persistent_with_provider_fallback',
    audit: 'live_structural_persisted_shareable_with_history',
    analytics: 'first_party_attribution_events',
    owner_operations: 'supabase_auth_rls_crm_projects_cms',
    portfolio: 'editorial_case_studies_plus_distinct_concept_showcases',
    timestamp: new Date().toISOString()
  };

  if (req.method === 'HEAD') return res.status(ok ? 200 : 503).end();
  return res.status(ok ? 200 : 503).json(payload);
}
