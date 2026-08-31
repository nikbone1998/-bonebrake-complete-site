# Bonebrake Web Design — Phase 11 Operations

Release: `11.0.0`
Build: `phase11-operational-platform`
Public application: static/custom frontend + bounded Vercel Node APIs
Persistent operating layer: Supabase Postgres + Auth + Edge Functions

This document describes deployed functionality, not planned functionality. A feature is not considered complete merely because a route, UI, or integration point exists.

## Architecture

### Public experience

The existing BWD frontend and concept showcases remain the presentation layer. Phase 11 adds an additive UX layer (`phase11.css` and `site.js`) rather than replacing strong existing design work.

Public operating surfaces include:

- `/` — marketing site and first-party inquiry flow.
- `/website-audit.html` — live structural website audit with persisted reports and previous-run comparison.
- portfolio/showcase pages — Aurelia, Northstar, Oak & Stone, Westside Auto Lab, and Lakeview Dental.
- `/privacy.html` and `/terms.html`.

`/dashboard.html` is the private owner application. It is deliberately excluded from the sitemap and marked `noindex,nofollow,noarchive`. URL obscurity is not an authorization control; Supabase Auth plus database RLS is the authorization boundary.

### Persistent data plane

Supabase project `usurytofnhhfxxipngdd` stores:

- `leads` — inquiries, attribution, pipeline state, notes, follow-up, priority, estimated value, opportunity score, and outcome.
- `audits` — saved structural audits, reports, opportunity heuristics, history, and failed runs.
- `projects` — client delivery status, price, balance, payment state, dates, milestone, and notes.
- `activity` — important lead/project/audit state changes.
- `analytics_events` — first-party page/CTA/audit/inquiry funnel events.
- `content_items` — structured published business, pricing, FAQ, and future portfolio/content records.
- `intake_limits` — short-lived hashed request keys used for server-side abuse controls.

All operational tables have Row Level Security enabled. Direct anonymous access to operational data is revoked. Owner CRUD policies require an authenticated JWT whose email is `bonebrakewebsitedesign@gmail.com`. Published CMS records are the intentional exception: anonymous users receive read-only access only where `published = true`.

Privileged Supabase keys are never embedded in public browser assets. Public code uses the project's publishable key. Edge Functions use platform-provided server secrets internally.

## First-party inquiry flow

The production design is persistent-first:

1. The browser validates required HTML fields and sends the normalized inquiry to the `lead-intake` Supabase Edge Function.
2. `lead-intake` applies origin checks, publishable application-key validation, payload bounds, honeypot handling, submission-timing checks, hashed-IP rate limiting, duplicate suppression, normalization, and opportunity scoring.
3. A valid lead is written to Postgres before the browser is told the inquiry was received.
4. An activity record and first-party attribution event are recorded.
5. After durable storage succeeds, the browser attempts the existing FormSubmit route as a secondary owner notification path.
6. If the first-party data plane fails, FormSubmit is retained as an emergency delivery fallback and the UI clearly distinguishes that degraded path.
7. If both storage and backup delivery fail, the visitor is told to use the displayed email/telephone contact path. The application must never display a false success state.

The legacy Vercel `/api/lead` webhook adapter remains in the repository as a compatible provider-neutral endpoint, but it is not Phase 11's primary persistence architecture.

## Business workflow automation

Database triggers provide durable workflow behavior independent of dashboard JavaScript:

- lead status changes create activity records;
- entering `WON` creates a project exactly once for that lead if one does not already exist;
- the newly created project inherits the recorded estimated value as its initial agreed price/balance for owner review;
- project status, payment-state, and milestone changes create activity records.

The dashboard flags due follow-ups and computes current operational metrics from persisted records. It does not send unsolicited customer communication automatically.

## Owner dashboard

`/dashboard.html` uses Supabase passwordless email authentication and RLS-protected database access.

Current functions:

- overview metrics for lead state, follow-ups, proposals, projects, recorded pipeline value, and recorded project value;
- full lead pipeline from `NEW` through `WON`/`LOST`;
- lead search and edits for status, priority, estimated value, follow-up date, and notes;
- lightweight project creation and project state/payment/milestone updates;
- saved audit review;
- first-party source/funnel summaries;
- structured CMS editing for published records;
- owner sign-out.

This is intentionally a focused BWD operating console, not a recreation of Salesforce, HubSpot, Asana, or an accounting platform.

## Website audit product

The safety-critical fetch engine remains Vercel `/api/audit`. It:

- accepts only public HTTP/HTTPS targets;
- rejects credential-bearing URLs;
- resolves and rejects private, loopback, link-local, metadata, documentation, multicast, and other unsafe address ranges;
- pins outbound connections to the validated public address to reduce DNS-rebinding risk;
- repeats validation after redirects;
- limits redirects, body size, execution time, rate, and concurrency;
- accepts HTML/XHTML only;
- records verifiable metadata and structural observations.

The Supabase `audit-run` Edge Function wraps that safe fetch engine with persistence and report logic. It:

- rate limits public audit usage;
- stores completed and failed runs;
- labels results as **measured**, **heuristic**, or **recommendation**;
- creates a directional redesign-opportunity signal from observed structural gaps;
- compares the current run with the last saved audit for the same host when one exists;
- records audit activity and attribution events.

The system does **not** fabricate Lighthouse scores, Core Web Vitals, rankings, traffic, conversion rates, accessibility certification, or business results. The opportunity signal is not a scientific site-quality score.

## Analytics and attribution

The public site creates a random local session UUID and captures available UTM/referrer context. The bounded `analytics-track` Edge Function persists allowed event classes:

- `page_view`
- `cta_click`
- `audit_start`
- `audit_complete`
- `inquiry_submit`
- `inquiry_complete`

The dashboard combines event and lead records to answer basic operating questions about source, inquiry volume, qualification, won clients, and recorded pipeline/revenue values. It is intentionally first-party and does not claim visitor identity when none is known.

## CMS/content operations

Published `content_items` are read through Supabase's Data API under an anonymous, read-only RLS policy. The current homepage can refresh pricing, FAQ copy, and business contact details from structured records while retaining its static HTML as a resilient fallback.

Owner edits happen through the authenticated dashboard and are subject to owner-only RLS.

## Health and observability

Vercel `GET /api/health` identifies release `11.0.0` and calls the Supabase `system-health` function with a short timeout. A healthy response requires the persistent data plane to be reachable. The endpoint reports:

- Vercel environment and region;
- release/build identity;
- data-plane status/latency and operational table counts;
- first-party lead-pipeline mode;
- audit mode;
- analytics mode;
- owner-operations authorization mode.

If the persistent data plane is unavailable, `/api/health` returns a degraded `503`; it must not report healthy merely because static HTML still loads.

Operational failures are also visible in Vercel runtime logs and Supabase project/service logs. Edge functions use bounded request handling and structured error labels rather than swallowing persistence failures.

## Security baseline

Current controls include:

- HSTS, `nosniff`, SAMEORIGIN framing policy, strict-origin referrer policy, and restrictive browser permissions policy from Vercel;
- SSRF/private-network/DNS-rebinding controls on live audit fetches;
- payload, rate, concurrency, and timing bounds on relevant public operations;
- hashed rate-limit identifiers rather than storing raw client IPs in application tables;
- RLS on persistent operational tables;
- anonymous operational-table access revoked;
- owner authorization tied to authenticated identity at the database policy layer;
- public browser code contains only a publishable Supabase key;
- dashboard omitted from crawler discovery;
- predeploy scans reject privileged credential markers in client assets.

A strict Content Security Policy remains deferred for this candidate because the existing portfolio relies on inline styles/data URLs and external image hosts, and the new authenticated dashboard currently loads the pinned Supabase client from jsDelivr. A broad/unverified CSP that breaks production is not treated as security progress. CSP should be introduced only after the preview dependency inventory and browser verification are complete.

The Supabase security advisor identified a pre-existing callable `SECURITY DEFINER` helper (`public.rls_auto_enable()`); execute privileges were revoked from public, anonymous, and authenticated roles before Phase 11 application work continued.

## Accessibility and UX

Phase 11 adds:

- a keyboard skip link;
- visible `:focus-visible` treatment;
- `aria-expanded` state on mobile menu/FAQ controls;
- a reduced-motion path when `prefers-reduced-motion` is enabled;
- responsive audit/dashboard layouts;
- a mobile quick-action bar for call, audit, and project inquiry;
- persistent-first form status messaging that distinguishes success, degraded backup delivery, and failure.

Automated/source checks do not constitute a formal WCAG certification. Final production review must still include actual keyboard and device/browser use.

## SEO/discovery

Phase 11 adds:

- `robots.txt` with explicit dashboard exclusion;
- `sitemap.xml` for public canonical pages;
- canonical and social metadata on the audit product;
- crawler isolation for the owner dashboard.

The existing public concept projects remain clearly presented as concepts; no client revenue, conversion, traffic, or testimonial outcomes may be invented.

## Build and test gates

Vercel runs:

`npm run vercel-build` → `npm run predeploy` → static integrity checks + Node tests.

Static checks require the Phase 11 operating assets, release identity, data-plane health wiring, first-party lead/analytics wiring, crawler files, security headers, and absence of privileged credential markers in client assets.

Node tests retain the existing audit/lead abuse controls and add Phase 11 contracts for:

- synchronized cross-system health and degraded health behavior;
- persistent-first inquiry wiring;
- saved audit/history wiring and truthful audit language;
- authenticated dashboard data access;
- no privileged Supabase client credentials;
- sitemap/robots dashboard isolation;
- focus and reduced-motion support.

## Release discipline

1. All Phase 11 source work occurs on `phase11-legitimate-100k`, not directly on production `main`.
2. Vercel must build that branch successfully.
3. Inspect build logs; a failed static check or test blocks promotion.
4. Exercise the preview homepage, audit page, dashboard unauthenticated state, and `/api/health`.
5. Verify critical mobile/desktop navigation and form/audit error states.
6. Verify first-party lead persistence using a clearly labeled QA record, then remove the QA record.
7. Verify a saved audit and history behavior using a non-sensitive public test site, then remove QA rows if appropriate.
8. Verify anonymous operational data cannot be read.
9. Inspect Vercel and Supabase runtime/security errors after exercising the preview.
10. Only then merge/promote the verified commit.
11. Confirm the canonical public domain serves the expected commit before calling Phase 11 production-complete.
12. Re-run production smoke/health checks after promotion.
13. If production regresses, restore the last known READY deployment and debug forward on a branch.

## Known boundaries that must remain explicit

- **Custom-domain mapping:** the connected Vercel project currently exposes Vercel aliases in connector metadata; `bwdnorth.com` has not yet been proven through the connected Vercel project metadata to map to the Phase 11 Git integration. Do not claim production promotion until that relationship is verified.
- **Owner magic-link end-to-end:** the dashboard architecture and RLS are implemented, but production owner sign-in is not certified until the authorized owner completes a real magic-link sign-in and the dashboard successfully reads/writes permitted data in a browser.
- **Email notification:** durable database storage is primary. FormSubmit is a secondary browser notification/emergency route; it is not counted as a guaranteed server-to-server notification provider.
- **Formal accessibility compliance:** improvements and automated/source checks are real, but no formal WCAG certification is claimed.
- **Performance/CWV:** no Lighthouse/Core Web Vitals result is claimed unless those measurements are actually collected in the target production environment.
- **Legal review:** privacy/terms are published technical documents, not a substitute for professional legal review.

No boundary above may be converted into a completed claim by changing wording, version strings, or phase labels.
