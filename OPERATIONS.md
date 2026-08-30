# Bonebrake Web Design — Phase 8 Operations

Operations build: `phase8-operational-platform`
Frontend target: `phase8-operational-platform`

## Production checks

- `GET /api/health` must return `ok: true` and separately report operations/front-end release state.
- `POST /api/audit` with a public HTTP/HTTPS URL must return `mode: live_heuristic` or a clear bounded error.
- Private, loopback, link-local, metadata, local-network, credential-bearing, and unsafe redirect targets must be rejected.
- Lead forms keep a direct browser FormSubmit path until a server-side delivery provider is attached.
- Vercel runs `npm run vercel-build` -> static checks + the Node test suite before every successful build.
- Production and preview deployments must build without errors before promotion.

## Release integrity

The health endpoint deliberately distinguishes the Phase 8 operations layer from the frontend release. Until the canonical Phase 8 frontend bundle is attached, it reports:

- `operations_build: phase8-operational-platform`
- `frontend_build: pre-phase8-production-repo`
- `frontend_synchronized: false`
- `release_status: phase8_operations_live_frontend_sync_pending`

Do not change that to `phase8_complete` merely because APIs or infrastructure are healthy. The visual/source bundle must actually be synchronized and verified first.

## Lead delivery

The site currently retains FormSubmit as the browser delivery path. A Vercel-to-FormSubmit QA request was blocked by the provider's Cloudflare challenge, so Phase 8 does not pretend that server-side bridge is reliable.

`POST /api/lead` is the production integration point for a future first-party/server-side lead route. Configure:

- `LEAD_WEBHOOK_URL` — HTTPS destination for normalized lead JSON.
- `LEAD_WEBHOOK_SECRET` — optional secret used to sign the request with `X-BWD-Signature: sha256=<hmac>`.

The adapter also sends the lead ID as `Idempotency-Key` and `X-BWD-Lead-Id`, imposes payload/timing/rate/concurrency bounds, and never reports delivery unless the configured destination returns success.

Until `LEAD_WEBHOOK_URL` exists, the endpoint intentionally returns `503 delivery_adapter_unconfigured` and tells the client to use the provider fallback.

## Website audit

`POST /api/audit` performs live structural checks without fabricating Lighthouse, Core Web Vitals, ranking, conversion, or accessibility claims. The endpoint:

- validates public HTTP/HTTPS targets;
- resolves and rejects private/special address space;
- pins the outbound socket to the exact public IP that passed validation, closing the DNS-rebinding gap between validation and connection;
- repeats validation and address pinning on every redirect;
- limits redirects, response size, request time, per-instance request rate, and concurrent audits;
- requests uncompressed HTML only and accepts HTML/XHTML responses only;
- reports verifiable document metadata and structural heuristics.

It is an educational diagnostic, not a scientific score.

## Security baseline

Vercel sends HSTS, nosniff, SAMEORIGIN framing, strict-origin referrer policy, and a restrictive browser permissions policy. The audit endpoint protects against private-network access and DNS rebinding. Lead and audit endpoints have bounded payload/work controls.

A broad CSP is intentionally deferred until the complete Phase 8 frontend bundle is attached and its inline/data/external dependencies can be inventoried without breaking the existing experience.

## Deployment discipline

1. Make operational changes on a non-production branch.
2. Let Vercel execute the predeploy suite on that branch.
3. Do not promote a branch unless the final branch commit is `READY`.
4. Exercise `/api/health` and inspect build/runtime errors.
5. Merge by fast-forward only after the preview is healthy.
6. Confirm the canonical production alias points to the expected commit.
7. Re-run post-deploy health/error checks.
8. If production regresses, roll back to the last known `READY` production deployment before debugging forward.

## Current external/manual boundaries

- **Latest Phase 8 frontend attachment:** the canonical newer frontend artifact must replace the older repository frontend before the visual release is considered synchronized.
- **First-party lead delivery:** requires a webhook/email/CRM provider endpoint or credential. The current browser provider fallback remains intentional.
- **Custom domain/DNS:** requires domain ownership and DNS configuration when the business chooses the final domain.
- **Legal policy review:** privacy/terms can be technically published, but final legal language remains a business/legal approval responsibility.
- **Real browser/device certification:** automated checks should be complemented by final Safari/iPhone and desktop browser review before a high-stakes public launch.

No boundary above should be represented as completed until it is actually attached and verified.
