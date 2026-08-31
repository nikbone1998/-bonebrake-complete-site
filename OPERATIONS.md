# Bonebrake Web Design — Phase 13 Operations

Release: `13.0.0`
Build: `phase13-six-figure-reality`
Public application: custom static frontend + bounded Vercel Node APIs
Persistent operating layer: Supabase Postgres + Auth + Edge Functions

This document describes implemented behavior and known boundaries. A phase name or valuation target is never evidence that a feature is complete.

## Public product

Public/product surfaces include:

- `/` — BWD marketing experience, signature redesign diagnostic, selected work, persistent-first inquiry flow.
- `/work.html` and five `case-*.html` pages — editorial concept case studies explaining strategy, information architecture, UX, mobile, trust and conversion decisions without invented results.
- five distinct showcase sites — Aurelia, Northstar, Oak & Stone, Westside Auto Lab and Lakeview Dental.
- `/website-audit.html` — live structural audit with persistence, history and share tokens.
- `/audit-report.html?t=...` — tokenized, noindex audit-report viewer.
- `/proposal.html?t=...` — tokenized, noindex printable proposal overview.
- `/dashboard.html` — private owner operating console.
- `/privacy.html` and `/terms.html`.

Phase 13 preserves the Phase 12 graphite/ivory/stone/muted-bronze art direction and signature diagnostic. It does not redesign working public surfaces merely to create a new phase.

## Persistent data plane

Supabase project `usurytofnhhfxxipngdd` stores:

- `leads` — identity/contact data, source/UTM attribution, pipeline state, qualification, priority, value, follow-up, next action, notes and outcome/loss context.
- `audits` — successful/failed audits, measured/heuristic/recommendation reports, history and randomized share tokens.
- `proposals` — lead-linked scope, package, add-ons, timeline, price, status, sent/decision timestamps, client label and randomized share token.
- `projects` — lead/proposal linkage, delivery status, agreed price, deposit, balance, explicitly recorded paid amount, payment state, target launch, milestone, domain/content/revision states, next action and notes.
- `project_checklist` — durable launch-readiness items and recorded states.
- `activity` — durable lead/audit/proposal/project workflow events.
- `analytics_events` — bounded first-party funnel events.
- `content_items` — structured published business, pricing, FAQ, service and portfolio content.
- `intake_limits` — hashed request identifiers used by server-side abuse controls.

Operational tables use RLS. Anonymous operational CRUD is revoked. Owner policies require an authenticated JWT for `bonebrakewebsitedesign@gmail.com`. Public CMS reads are limited to published content. Browser assets contain only the Supabase publishable key; privileged credentials remain server-side.

## CRM and proposal workflow

The owner console continues the real CRM pipeline and adds proposal operations.

Proposal states:

`DRAFT → SENT → ACCEPTED / DECLINED / EXPIRED`

Database workflow behavior:

- proposal status changes create activity events;
- moving a proposal to `sent` records `sent_at`, moves a non-terminal lead to `proposal`, and records the next action;
- moving a proposal to `accepted` records the decision, transfers the proposal price to the lead's recorded opportunity value, moves the lead to `won`, and triggers the existing durable WON→project workflow;
- the created project links back to the accepted proposal;
- moving a proposal to `declined` records proposal-declined outcome/loss context without inventing a client reason.

A successful disposable QA exercise verified `draft → sent → accepted → won → project`, a `$4,200` proposal-value transfer, proposal/project linkage and automatic launch-checklist seeding. QA records were removed after verification.

The tokenized proposal viewer returns only proposal-facing fields through the `proposal-view` Edge Function. It deliberately excludes lead IDs, CRM records, session identity and owner data. Draft proposals are not returned. The page is a printable proposal overview, not a contract or electronic-signature system.

## Project delivery and launch readiness

Each project records:

- agreed value;
- deposit/balance;
- explicit `paid_amount` rather than inferring cash received from contract value;
- payment state;
- project stage/milestone;
- target launch;
- domain, content and revision status;
- next action.

Every project receives 17 launch-readiness records covering content, design, mobile QA, forms, contact data, domain, SEO/social metadata, analytics, privacy/terms, accessibility review, performance review, client approval, payment-state review, SSL and production smoke testing.

Readiness percentage is calculated only from checklist rows explicitly marked `complete` or `not_applicable`. It is never inferred from time, project status or estimated progress.

A disposable QA exercise verified project checklist state changes and a calculated `2 / 17 = 11.8%` readiness result. QA records were removed afterward.

## Client portal decision

A separate client portal is deliberately deferred. At the current business scale, a second external authentication/authorization surface adds more security and maintenance complexity than business value. Tokenized proposals plus focused internal delivery operations are the simpler professional architecture.

## Owner authentication

The dashboard uses Supabase passwordless authentication plus database RLS. Normal login uses `shouldCreateUser:false`; the public dashboard cannot create arbitrary Auth users.

Authorization requires both:

1. an authenticated Supabase session whose email is the authorized owner email; and
2. database RLS approval.

**Known boundary:** the owner identity is not yet present in `auth.users`, and the complete email → magic link → production redirect → session → RLS read/write → logout flow is therefore not yet production-certified. A temporary Phase 13 bootstrap path was disabled and its Vercel bridge removed rather than leaving an administrative backdoor active.

## First-party lead pipeline

The primary inquiry path remains persistence-first:

1. browser validation and bot fields;
2. `lead-intake` Edge Function origin/application-key/payload/timing/rate controls;
3. normalized Postgres persistence;
4. activity and attribution event creation;
5. success only after durable storage;
6. existing FormSubmit path used secondarily for owner notification/emergency delivery;
7. explicit direct-contact failure state if durable storage and backup delivery both fail.

## Website audit product

The Vercel `/api/audit` fetch engine retains public-target-only validation, credential rejection, private/link-local/metadata blocking, DNS-rebinding protection, redirect revalidation, bounded response size/time/rate/concurrency and HTML-only processing.

Supabase `audit-run` adds persistence, measured/heuristic/recommendation classification, redesign-opportunity heuristic, previous-run comparison, activity/analytics events and randomized share tokens.

The `audit-report` Edge Function returns only report-safe fields for a valid share token and does not expose requester identity, lead linkage, sessions or CRM data. No Lighthouse, Core Web Vitals, ranking, traffic, conversion, WCAG certification or business-outcome claim is fabricated.

## Analytics truthfulness

The operating funnel can combine:

`VISIT → CTA → AUDIT → INQUIRY → QUALIFIED → PROPOSAL → WON → PROJECT → PAID`

Important financial distinctions:

- lead `estimated_value` = pipeline/opportunity estimate;
- proposal `total_price` = proposed value;
- project `agreed_price` = recorded booked project value;
- project `paid_amount` = explicitly recorded cash received.

The application must not call agreed contract value paid revenue merely because a project exists.

## CMS

Structured CMS support covers business profile, pricing, FAQ, services and portfolio metadata/content. Static fallback content remains for public resilience. It is intentionally structured rather than a generic drag-and-drop builder.

## Health and observability

Vercel `GET /api/health` identifies release `13.0.0`, build `phase13-six-figure-reality`, exposes the Vercel Git commit when available, and calls Supabase `system-health`.

Supabase `system-health` calls the restricted `phase13_health_counts()` RPC and reports database reachability plus counts for leads, audits, projects, proposals, project checklist, activity, analytics and content. The RPC is `SECURITY DEFINER` because it is a server-side health probe, but execute permission is revoked from public/anon/authenticated roles and granted only to `service_role`.

Data-plane failure causes degraded `503`, not a false healthy response.

## Security baseline

Current controls include:

- HSTS, `nosniff`, SAMEORIGIN framing policy, strict-origin referrer and restrictive permissions headers;
- SSRF/private-network/DNS-rebinding protections on audits;
- request/payload/rate/timing/concurrency controls on bounded public operations;
- hashed abuse-control identifiers;
- RLS and revoked anonymous operational CRUD;
- owner identity authorization at database policy level;
- `shouldCreateUser:false` for normal dashboard auth;
- no privileged Supabase credentials in browser assets;
- tokenized audit/proposal sharing with sanitized server responses;
- dashboard/audit-report/proposal surfaces excluded from sitemap and crawler rules;
- CI scans for privileged client-credential markers;
- temporary auth bootstrap route removed/disabled after it could not be safely certified.

Latest Supabase security advisor shows only the intentional informational notice that `intake_limits` has RLS with no client policy. That table is intended to have no client access. Latest performance advisor has no warnings after optimizing new owner policies; remaining notices are unused-index informational findings on a nearly empty database.

## Accessibility and performance

Existing skip-link/focus/reduced-motion/ARIA/responsive work is preserved. Phase 13 adds bounded responsive dashboard/proposal surfaces and print styling.

Northstar remains protected by the `<100 KB` HTML regression budget. Phase 13 also budgets its additive CSS/dashboard/proposal assets. These are source/build safeguards, not fabricated Lighthouse or Core Web Vitals claims.

Formal WCAG 2.2 AA certification and real browser/Lighthouse measurements are not claimed without actual browser/assistive verification.

## SEO and private discovery

The public sitemap includes the marketing site, audit, work/case-study pages and concept showcases. `dashboard.html`, `audit-report.html` and `proposal.html` are excluded from the sitemap, marked noindex where applicable, and disallowed in `robots.txt` as defense in depth. No fake reviews, locations, aggregate ratings or outcomes are published.

## Build / release gate

`npm run vercel-build` → `npm run predeploy` → static integrity checks + Node tests.

Phase 13 checks require:

- release `13.0.0` / build `phase13-six-figure-reality`;
- existing Phase 12 diagnostic and five case studies;
- persistent-first lead and analytics wiring;
- audit share privacy;
- owner arbitrary-signup disabled;
- proposal + project-checklist dashboard wiring;
- tokenized/noindex proposal viewer with no private-field dependencies;
- explicit paid amount and recorded-state launch readiness;
- Northstar and Phase 13 asset byte budgets;
- private-surface search exclusion;
- no temporary owner-bootstrap bridge;
- security headers and no privileged browser credentials.

A verified Phase 13 Vercel preview on commit `813268eb51df483e5ae57a54a696e70fd5b5070d` completed its build with 37 required-file/static contracts and 29/29 tests passing. Any later documentation/release-cleanup commit must receive a new green preview before replacing that candidate as the verified source of truth.

## Release discipline

1. Phase 13 work occurs on `phase13-six-figure-reality`, not production `main`.
2. GitHub and Vercel predeploy gates must be green.
3. Preview `/api/health` and Supabase data-plane health must be healthy.
4. Exercise public homepage, case studies, audit, tokenized report/proposal states and dashboard unauthenticated state.
5. Use clearly labeled disposable QA data for destructive workflow tests; remove it afterward.
6. Complete owner magic-link/RLS/logout certification before counting owner auth complete.
7. Perform real desktop/mobile browser QA when browser tooling can reach the preview.
8. Review Vercel runtime errors and Supabase advisors after QA.
9. Promote only a verified commit.
10. Confirm `bwdnorth.com` serves the intended commit before production certification.

## Known boundaries

- **Production domain:** the connected Vercel project still does not list `bwdnorth.com` as a project domain. The public custom domain currently serves an older release. Production mapping must be resolved before Phase 13 can be production-certified.
- **Owner authentication:** the authorized owner Auth identity does not yet exist; end-to-end magic-link/RLS/logout certification remains incomplete.
- **Browser QA:** source/build responsive controls are real, but multi-viewport screenshot/interaction certification remains incomplete until browser tooling can exercise the protected preview.
- **Email notification:** Postgres persistence is primary; FormSubmit remains secondary browser notification/emergency delivery rather than guaranteed server-to-server notification.
- **Formal accessibility / Lighthouse / CWV:** not claimed without real measurements/review.
- **Client portal:** deliberately not implemented because its current business utility does not justify the additional external auth surface.
- **Legal review:** published privacy/terms and proposal language are not a substitute for professional legal review.

No known boundary may be converted into a completed claim by changing documentation, version strings, branch names or valuation targets.
