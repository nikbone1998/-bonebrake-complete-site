# Bonebrake Web Design — Phase 14 Operations

Release: `14.0.0`
Build: `phase14-six-figure-certification`
Public application: custom static frontend + bounded Vercel Node APIs
Persistent operating layer: Supabase Postgres + Auth + Edge Functions

This runbook describes implemented behavior and certification state. A phase number or valuation target is never evidence that a system is complete.

## Public product

Public/product surfaces include:

- `/` — premium BWD marketing experience, signature redesign diagnostic, selected work, persistent-first inquiry flow.
- `/work.html` and five `case-*.html` pages — editorial concept case studies explaining strategy, information architecture, UX, mobile, trust and conversion decisions without invented results.
- five distinct showcase sites — Aurelia, Northstar, Oak & Stone, Westside Auto Lab and Lakeview Dental.
- `/website-audit.html` — live structural audit with persistence, history and share tokens.
- `/audit-report.html?t=...` — tokenized, noindex audit-report viewer.
- `/proposal.html?t=...` — tokenized, noindex printable proposal overview.
- `/dashboard.html` — private owner operating console.
- `/privacy.html` and `/terms.html`.

Phase 14 preserves the proven Phase 12/13 public design and operating surfaces. The purpose of this release is certification and cleanup rather than adding visual complexity.

## Persistent operating data

Supabase project `usurytofnhhfxxipngdd` stores:

- `leads` — contact data, source/UTM attribution, pipeline state, qualification, priority, value, follow-up, next action, notes and outcome context.
- `audits` — successful/failed audits, measured/heuristic/recommendation reports, history and randomized share tokens.
- `proposals` — lead-linked scope, package, add-ons, timeline, price, status, sent/decision timestamps, client label and randomized share token.
- `projects` — lead/proposal linkage, delivery status, agreed price, deposit, balance, explicitly recorded paid amount, payment state, target launch, milestone, domain/content/revision states, next action and notes.
- `project_checklist` — durable launch-readiness items and recorded states.
- `activity` — durable lead/audit/proposal/project workflow events.
- `analytics_events` — bounded first-party funnel events.
- `content_items` — structured published business, pricing, FAQ, service and portfolio content.
- `intake_limits` — hashed request identifiers used by server-side abuse controls.

Operational tables use RLS. Anonymous operational CRUD is revoked. Owner policies require an authenticated JWT for `bonebrakewebsitedesign@gmail.com`. Public CMS reads are limited to published content. Browser assets contain only the Supabase publishable key; privileged credentials remain server-side.

## CRM, proposals and delivery

Proposal states:

`DRAFT → SENT → ACCEPTED / DECLINED / EXPIRED`

Durable database behavior includes:

- proposal status changes create activity events;
- sending a proposal records `sent_at`, moves a non-terminal lead to proposal state and records the next action;
- accepting a proposal records the decision, transfers the proposal price to the lead's recorded opportunity value, moves the lead to won, and triggers the durable WON→project workflow;
- the created project links back to the accepted proposal;
- declining a proposal records a declined outcome without inventing a client reason.

Disposable QA previously verified `draft → sent → accepted → won → project`, a `$4,200` value transfer, proposal/project linkage and automatic launch-checklist seeding. QA records and their activity history were removed.

The tokenized proposal viewer exposes only proposal-facing fields through `proposal-view`. It excludes lead IDs, CRM records, session identity and owner data. It is a printable proposal overview, not a contract or electronic-signature system.

## Project delivery and launch readiness

Projects distinguish agreed value, deposit, balance and explicit `paid_amount`; unpaid contract value is not presented as paid revenue. Projects also store payment state, stage/milestone, target launch, domain/content/revision state and next action.

Each project receives 17 durable launch-readiness records covering content, design, mobile QA, forms, contact data, domain, SEO/social metadata, analytics, privacy/terms, accessibility review, performance review, client approval, payment-state review, SSL and production smoke testing.

Readiness is calculated only from stored checklist rows explicitly marked complete or not applicable. It is never inferred from time or guessed percentage completion.

## Owner authentication

The dashboard uses Supabase passwordless Auth plus database RLS. Normal login uses `shouldCreateUser:false`, so the dashboard cannot create arbitrary users.

Phase 14 successfully completed the one-time owner identity bootstrap for `BonebrakeWebsiteDesign@gmail.com`. The bootstrap was invoked once through a temporary `pg_net` database connection, returned success, then the following cleanup occurred immediately:

- the owner-bootstrap Edge Function was replaced with a `410 bootstrap_disabled` implementation;
- the temporary GitHub/Vercel bootstrap bridge was deleted;
- the temporary `pg_net` extension/schema was removed;
- a separate fixed-owner magic-link QA function successfully requested a login link targeting `https://bwdnorth.com/dashboard.html`;
- that QA function was then replaced with a `410 qa_disabled` implementation;
- the temporary `pg_net` extension/schema used for that request was removed.

Authorization still requires both a valid Supabase owner session and database RLS approval.

### Owner authentication certification boundary

The Supabase Auth service accepted the real fixed-owner magic-link request, but the Gmail account connected to this ChatGPT session is not the `BonebrakeWebsiteDesign@gmail.com` owner inbox, so actual email receipt could not be inspected here. The available browser environment also cannot yet complete the email-link → browser session → RLS read/write → refresh → logout cycle. That final interactive sequence remains unclaimed until it is actually exercised.

## First-party lead pipeline

Primary inquiry flow remains persistence-first:

1. browser validation and bot fields;
2. `lead-intake` origin/application-key/payload/timing/rate controls;
3. normalized Postgres persistence;
4. activity and attribution event creation;
5. success only after durable storage;
6. FormSubmit retained secondarily for notification/emergency delivery;
7. explicit direct-contact failure state if durable storage and backup delivery both fail.

## Website audit product

Vercel `/api/audit` retains public-target validation, credential rejection, private/link-local/metadata blocking, DNS-rebinding protection, redirect revalidation, bounded response size/time/rate/concurrency and HTML-only processing.

Supabase `audit-run` adds persistence, measured/heuristic/recommendation classification, redesign-opportunity heuristic, previous-run comparison, activity/analytics events and randomized share tokens. `audit-report` returns only report-safe fields and does not expose requester identity, lead linkage, sessions or CRM data.

No Lighthouse, Core Web Vitals, ranking, traffic, conversion, WCAG certification or business-outcome claim is fabricated.

## Analytics truthfulness

The operating funnel can combine:

`VISIT → CTA → AUDIT → INQUIRY → QUALIFIED → PROPOSAL → WON → PROJECT → PAID`

Financial terms are deliberately distinct:

- lead `estimated_value` = pipeline/opportunity estimate;
- proposal `total_price` = proposed value;
- project `agreed_price` = booked project value;
- project `paid_amount` = explicitly recorded cash received.

## CMS

Structured CMS support covers business profile, pricing, FAQ, services and portfolio metadata/content. Static fallback content remains for public resilience. It is intentionally structured rather than a generic drag-and-drop builder.

## Health and observability

Vercel `GET /api/health` identifies release `14.0.0`, build `phase14-six-figure-certification`, exposes `VERCEL_GIT_COMMIT_SHA` when available, and calls Supabase `system-health`.

Supabase `system-health` reports database reachability and operating capability/count information. Data-plane failure causes degraded `503`, not a false healthy response.

## Security baseline

Controls include:

- HSTS, `nosniff`, SAMEORIGIN framing policy, strict-origin referrer and restrictive permissions headers;
- SSRF/private-network/DNS-rebinding protections on audits;
- request/payload/rate/timing/concurrency controls on bounded public operations;
- hashed abuse-control identifiers;
- RLS and revoked anonymous operational CRUD;
- owner identity authorization at database policy level;
- normal dashboard auth with `shouldCreateUser:false`;
- no privileged Supabase credentials in browser assets;
- tokenized audit/proposal sharing with sanitized server responses;
- private dashboard/audit-report/proposal surfaces excluded from public discovery;
- CI scans for privileged client-credential markers and temporary bootstrap routes.

The latest security-advisor state prior to Phase 14 showed no exposed operational-data finding; `intake_limits` intentionally has RLS and no client policy. Previously reported owner-policy performance warnings were corrected. Unused-index informational notices are retained because the operational database is nearly empty and those indexes protect intended future queries.

## Performance and accessibility

Northstar retains its `<100 KB` HTML regression budget. Phase 13 CSS/dashboard/proposal additions retain byte budgets in Phase 14. Skip-link, focus-visible, reduced-motion, ARIA and responsive controls remain protected by source/build tests.

These are meaningful implementation safeguards, not fabricated Lighthouse/Core Web Vitals or WCAG certification. Multi-viewport browser and assistive-technology certification remains separate.

## SEO and private discovery

The public sitemap includes the marketing site, audit, work/case-study pages and concept showcases. `dashboard.html`, `audit-report.html` and `proposal.html` are excluded from the sitemap and disallowed in `robots.txt`; tokenized pages are also marked noindex where applicable. No fake reviews, locations, aggregate ratings or outcomes are published.

## Phase 14 build / release gate

`npm run vercel-build` → `npm run predeploy` → static certification checks + Node tests.

Phase 14 requires:

- release `14.0.0` / build `phase14-six-figure-certification`;
- dedicated Phase 14 CI on Phase 14 branches;
- no Phase 12/13 CI workflow in the final Phase 14 candidate;
- no temporary owner-bootstrap or login-QA bridge in repository code;
- existing diagnostic, five case studies, first-party lead/analytics wiring, audit share privacy, proposal/project/checklist operations and explicit paid amount preserved;
- owner normal login fixed to `shouldCreateUser:false`;
- private-route crawler isolation;
- Northstar and operating-asset byte budgets;
- security headers and no privileged browser credentials;
- health commit traceability and explicit unresolved-certification state until production/browser checks are complete.

## Production domain

The canonical desired chain is:

`Git commit → Vercel build → Vercel production deployment → bwdnorth.com`

The current Git-connected project is `bonebrake-complete-site-1` (`prj_aamMF6oLvfO6DnkLPEAcdBjnNRXo`). Its project-domain list does not include `bwdnorth.com`. Several earlier production-looking Bonebrake Vercel projects were also inspected and did not list the custom domain. Public `https://bwdnorth.com/` remains reachable but serves the older BWD release.

The domain must be attached to the intended Vercel project (or the actual current hosting/DNS relationship must be otherwise proven) before Phase 14 may be called production-certified.

## Certification boundaries

The following are deliberately not converted into completion claims:

- **Production domain:** `bwdnorth.com` is not yet traceably attached to the intended Git-connected Vercel project.
- **Owner interactive session:** owner identity exists and magic-link request is accepted, but actual owner-inbox receipt plus browser session/RLS/logout cycle has not been exercised in this environment.
- **Browser QA:** multi-viewport screenshot/interaction testing at 1440/1280/1024 and 430/402/393/390/360 remains incomplete until browser tooling can reach and interact with the candidate.
- **Lighthouse/CWV/formal WCAG:** not claimed without real measurements/review.
- **Email notification:** Postgres persistence is primary; FormSubmit remains a secondary browser notification/emergency path.
- **Client portal:** deliberately not implemented because its current utility does not justify another external auth surface.
- **Legal review:** privacy/terms/proposal language are not a substitute for professional legal advice.

No certification boundary may be erased by changing version strings, documentation, branch names or valuation targets.
