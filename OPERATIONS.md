# Bonebrake Web Design — Phase 12 Operations

Release: `12.0.0`
Build: `phase12-six-figure-platform`
Public application: custom static frontend + bounded Vercel Node APIs
Persistent operating layer: Supabase Postgres + Auth + Edge Functions

This document describes implemented behavior and known boundaries. A phase name or valuation target is never evidence that a feature is complete.

## Public product

Primary surfaces:

- `/` — BWD marketing experience, signature redesign diagnostic, selected-work presentation, persistent-first inquiry flow.
- `/work.html` — editorial case-study index for the five clearly labeled concept projects.
- `/case-*.html` — BWD case-study narratives explaining challenge, strategy, information architecture, UX, mobile, trust and conversion decisions without fabricated client results.
- original concept showcases — Aurelia, Northstar, Oak & Stone, Westside Auto Lab and Lakeview Dental retain distinct industry-specific identities.
- `/website-audit.html` — live structural audit with persistence, history and privacy-safe share links.
- `/audit-report.html?token=...` — tokenized, noindex report viewer exposing audit findings only.
- `/dashboard.html` — noindex private owner application.
- `/privacy.html` and `/terms.html`.

Phase 12 preserves the graphite/ivory/stone/muted-bronze studio identity while adding an art-directed hero, custom browser compositions, a signature diagnostic interaction, a dedicated case-study presentation layer and a shared editorial system. Visual spectacle is not treated as business value by itself.

## Performance budget

The previous Northstar showcase was a multi-megabyte single HTML document. Phase 12 rebuilds it as a compact, responsive HVAC concept and enforces a `<100 KB` HTML budget for `northstar.html` in the predeploy gate. No Lighthouse/Core Web Vitals claims are made unless those measurements are actually collected.

## Persistent data plane

Supabase project `usurytofnhhfxxipngdd` stores:

- `leads` — inquiry identity/contact data, attribution, pipeline state, notes, follow-up, priority, estimated value, opportunity score and outcome.
- `audits` — completed/failed structural audits, report JSON, history, heuristics and random `share_token` values.
- `projects` — client delivery status, agreed price, deposit/balance, payment state, dates, milestone and notes.
- `activity` — durable lead/project/audit state events.
- `analytics_events` — first-party funnel events.
- `content_items` — published structured business, pricing, FAQ, service and portfolio records.
- `intake_limits` — hashed request identifiers for bounded public abuse controls.

Operational tables use RLS. Anonymous operational CRUD is revoked. Owner policies require an authenticated JWT whose email is `bonebrakewebsitedesign@gmail.com`. Published CMS rows are the deliberate read-only public exception. Browser assets contain only the publishable Supabase key; privileged keys remain server-side.

## Owner authentication

The dashboard uses Supabase passwordless Auth plus database RLS. Phase 12 changes owner login to `shouldCreateUser:false`; the public dashboard can request a magic link only for the pre-created authorized owner identity and cannot create arbitrary Auth users.

Authorization requires both:

1. a valid authenticated Supabase session for the owner email; and
2. owner RLS policy approval at the database layer.

The dashboard signs out any session whose email is not the authorized owner. Production authentication is not certified until the actual email-link redirect lands on the intended production dashboard and permitted data access/logout are exercised end-to-end.

## First-party inquiry flow

The primary flow remains persistence-first:

1. browser validation and anti-bot fields;
2. `lead-intake` Edge Function origin/application-key/payload/timing/rate checks;
3. normalized lead persistence;
4. activity + attribution event creation;
5. explicit success only after durable storage;
6. FormSubmit used secondarily as owner notification and as the browser emergency route if the first-party data plane fails;
7. explicit direct-contact failure state if both paths fail.

A lead must never be intentionally acknowledged as safely received before durable storage or a clearly identified backup delivery succeeds.

## Business workflow automation

Database triggers remain independent of dashboard JavaScript:

- lead status changes create activity records;
- entering `WON` creates one project for that lead if one does not already exist;
- the project inherits the lead's recorded estimated value for owner review;
- project state/payment/milestone changes create activity events.

The owner dashboard manages pipeline status, priority, estimated value, follow-up, notes, project stages, payment state, milestones, audits, analytics and structured content. Metrics distinguish recorded estimates, agreed project value and projects explicitly marked paid; they do not infer revenue that was never recorded.

## Website audit product

The safety-critical fetch engine remains Vercel `/api/audit` with HTTP/HTTPS-only targets, credential rejection, DNS/private-network validation, rebinding protection, redirect revalidation, body/time/concurrency/rate limits and HTML-only processing.

Supabase `audit-run` adds:

- persistence of successful and failed runs;
- measured / heuristic / recommendation classification;
- directional redesign-opportunity heuristic;
- previous-run comparison by host;
- activity and attribution events;
- random audit share tokens.

The `audit-report` Edge Function accepts a valid random share token and returns only sanitized public-report fields: timestamp, audited URL/host, status, heuristic score, summary and report JSON. It does **not** return requested-by identity, owner data, session IDs, lead linkage or CRM records. The share viewer is `noindex,nofollow,noarchive` and is excluded from the sitemap.

The audit does not fabricate Lighthouse scores, Core Web Vitals, traffic, rankings, conversion rates, WCAG certification or business outcomes.

## Analytics / attribution

Allowed first-party event classes remain:

- `page_view`
- `cta_click`
- `audit_start`
- `audit_complete`
- `inquiry_submit`
- `inquiry_complete`

The dashboard combines events with lead/project records to show tracked sessions, CTA interactions, stored inquiries, qualification, proposals, won clients, pipeline estimates, booked project value and paid value where explicitly recorded.

## CMS

Published content now includes structured records for business profile, pricing, FAQ, core services and portfolio metadata. Homepage pricing/FAQ/contact data can refresh from published records while static HTML remains a resilient fallback. Owner edits remain RLS-protected.

The CMS intentionally remains structured rather than becoming a generic drag-and-drop site builder.

## Health / observability

`GET /api/health` identifies release `12.0.0`, build `phase12-six-figure-platform` and calls Supabase `system-health`. Healthy status requires the persistent data plane to be reachable. The response reports environment/region, release identity, data-plane status/latency/table counts, lead mode, audit mode, analytics mode, owner-operations mode and portfolio mode. Data-plane failure produces degraded `503` rather than a false healthy state.

Vercel runtime/build logs and Supabase service logs remain the primary operational diagnostics.

## Security baseline

Controls include:

- HSTS, `nosniff`, SAMEORIGIN framing, strict-origin referrer and restrictive permissions headers;
- SSRF/private-network/DNS-rebinding controls on website audits;
- payload/rate/concurrency/timing limits on public operations;
- hashed rate-limit identifiers;
- RLS and revoked anonymous operational access;
- owner identity enforced by Auth and database policy;
- `shouldCreateUser:false` on owner passwordless login;
- no privileged browser credentials;
- tokenized audit sharing with sanitized server response;
- private dashboard/share surfaces excluded from search discovery;
- predeploy scans for privileged credential markers.

A strict CSP is not claimed until the external image/CDN and inline-style dependency inventory can be verified without breaking production.

## Accessibility / responsive UX

Implemented/source-verified controls include skip links, focus-visible treatment, reduced-motion behavior, ARIA state for interactive controls, responsive audit/dashboard layouts, mobile quick actions and responsive case-study/diagnostic layouts. Phase 12 explicitly targets approximately 360/390/393/402/430px mobile widths in visual QA.

These controls are meaningful improvements but are not a formal WCAG 2.2 AA certification without actual manual assistive-technology/keyboard review.

## SEO / discovery

The sitemap now includes the public case-study index, five case-study pages, audit product and original concept showcases. The dashboard and tokenized report viewer remain excluded. Case-study pages use truthful concept labels and canonical metadata. No fake reviews, aggregate ratings, locations or results are published.

## Build / release gate

`npm run vercel-build` → `npm run predeploy` → static checks + Node tests.

Phase 12 static checks require:

- release identity `12.0.0`;
- Phase 12 CI/build identity;
- public marketing/case-study/audit/dashboard assets;
- persistent lead and analytics wiring;
- signature diagnostic/case-study routing;
- Northstar `<100 KB` budget;
- owner signup disabled;
- share-report privacy contracts;
- sitemap/private-surface separation;
- security headers and absence of privileged client credentials.

Node tests retain the audit/lead abuse controls and add Phase 12 product/auth/performance/SEO/privacy contracts. Test count is not itself considered quality; coverage is intended to protect critical behavior.

## Release discipline

1. Phase 12 source work occurs on `phase12-legitimate-110k`, not production `main`.
2. Every candidate must pass Vercel build/static/test gates.
3. Preview runtime health and data-plane health must be green.
4. Exercise homepage, work/case studies, audit, share report and dashboard unauthenticated state.
5. Exercise QA lead persistence, analytics, audit persistence/history/share retrieval and WON→project automation using clearly labeled records, then remove QA records.
6. Exercise owner authentication with the real authorized account and verify RLS-protected read/write + logout.
7. Perform responsive/browser QA where tooling permits.
8. Inspect Vercel/Supabase runtime and security advisors.
9. Remove temporary QA endpoints and credentials before final candidate verification.
10. Verify the canonical `bwdnorth.com` domain maps to the intended Vercel project/commit before production promotion.
11. Promote only a verified commit; run post-production smoke checks.
12. Roll back to the last known healthy production deployment if promotion regresses critical behavior.

## Known boundaries

- **Custom-domain mapping:** current connected Vercel project metadata does not list `bwdnorth.com`. Production cannot be called complete until DNS/project association is proven and the public domain serves the intended commit.
- **Auth redirect configuration:** the owner identity and code path are not sufficient by themselves; actual magic-link redirect/session behavior must be exercised against the intended domain.
- **Email notification:** durable Postgres storage is primary. FormSubmit remains a secondary browser notification/emergency provider, not a guaranteed server-to-server notification service.
- **Formal WCAG:** not claimed without real manual/browser/assistive review.
- **Lighthouse/CWV:** not claimed without real measurement.
- **Legal review:** published privacy/terms are not a substitute for professional legal advice.

No known boundary may be converted into a completion claim by changing documentation, version strings or the phase name.
