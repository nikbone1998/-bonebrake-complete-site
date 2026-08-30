# Bonebrake Web Design — Phase 8 Operations

Build target: `phase8-operational-platform`

## Production checks

- `GET /api/health` must return `ok: true`.
- `POST /api/audit` with a public HTTP/HTTPS URL must return `mode: live_heuristic` or a clear bounded error.
- Private, loopback, link-local, and local-network audit targets must be rejected.
- Lead forms keep a direct browser FormSubmit path until a server-side delivery provider is attached.
- Production and preview deployments must build without errors before promotion.

## Lead delivery

The site currently retains FormSubmit as the browser delivery path. A Vercel-to-FormSubmit QA request was blocked by the provider's Cloudflare challenge, so Phase 8 does not pretend that server-side bridge is reliable.

`POST /api/lead` is the production integration point for a future first-party/server-side lead route. Configure:

- `LEAD_WEBHOOK_URL` — HTTPS destination for normalized lead JSON.
- `LEAD_WEBHOOK_SECRET` — optional secret used to sign the request with `X-BWD-Signature: sha256=<hmac>`.

Until `LEAD_WEBHOOK_URL` exists, the endpoint intentionally returns `503 delivery_adapter_unconfigured` and tells the client to use the provider fallback. It never reports a lead as delivered when it was not.

## Website audit

`POST /api/audit` performs live structural checks without fabricating Lighthouse, Core Web Vitals, ranking, conversion, or accessibility claims. The endpoint:

- validates public HTTP/HTTPS targets;
- blocks private/local address space;
- revalidates redirects;
- limits redirects, response size, and fetch time;
- accepts HTML only;
- reports verifiable document metadata and structural heuristics.

It is an educational diagnostic, not a scientific score.

## Security baseline

Vercel sends HSTS, nosniff, SAMEORIGIN framing, strict-origin referrer policy, and a restrictive browser permissions policy. A broad CSP is intentionally deferred until the complete Phase 8 frontend bundle is attached and its inline/data/external dependencies can be inventoried without breaking the existing experience.

## Deployment discipline

1. Build operational changes on a non-production branch.
2. Verify the Vercel preview deployment.
3. Exercise `/api/health`, `/api/audit`, primary navigation, portfolio links, and form fallback behavior.
4. Review build/runtime errors.
5. Merge/promote only after the preview is healthy.
6. Re-run post-deploy smoke checks against the production alias.

## Current external/manual boundaries

- **Latest Phase 8 frontend attachment:** the newest Phase 8 artifact must replace the older repository frontend before the visual release is considered synchronized.
- **First-party lead delivery:** requires a webhook/email/CRM provider endpoint or credential. The current browser provider fallback remains intentional.
- **Custom domain/DNS:** requires domain ownership and DNS configuration when the business chooses the final domain.
- **Legal policy review:** privacy/terms can be technically published, but final legal language remains a business/legal approval responsibility.
- **Real browser/device certification:** automated checks should be complemented by final Safari/iPhone and desktop browser review before a high-stakes public launch.

No boundary above should be represented as completed until it is actually attached and verified.
