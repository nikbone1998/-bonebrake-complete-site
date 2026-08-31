# Phase 14 — First Customer Pilot

## Purpose
Run exactly one real paid Bonebrake Website Rebuild customer through the certified Phase 14 operating system while keeping autonomous prospecting, outreach, auto-replies, reusable multi-customer checkout, and automatic production deployment disabled.

## Hard scope
- Maximum paid projects: **1**
- Maximum concurrent projects: **1**
- Sales mode: **manual/inbound only**
- Prospecting: **OFF**
- Outreach: **OFF**
- Auto reply: **OFF**
- Production deployment: **OFF until its separate owner launch approval**
- Monitoring, recovery, retry engine, executive brief, and domain onboarding: **ON**
- Pilot checkout: the dedicated inactive $1,995 Payment Link configured with Stripe `restrictions.completed_sessions.limit=1`

## Preparation state
`external_effects_locked=true` must remain enabled while the pilot is only being prepared. The First Customer Pilot plan must report zero readiness blockers before it can be armed.

Required readiness checks:
1. Phase 14 CI green.
2. No open critical/error monitoring incidents.
3. No open retry dead letters.
4. No existing open customer project.
5. No failed automation action in the prior 24 hours.
6. Monitoring + safe recovery enabled.
7. Retry engine enabled.
8. Executive Brief enabled.
9. Domain onboarding enabled.
10. Vercel AI worker route deployed.
11. Supabase → Vercel AI worker → AI Gateway model POST path certified.
12. Single-customer checkout path verified.
13. Domain launch path verified.

## Arm
Arming is **not activation**.

`pilot-control` refreshes readiness. If and only if blockers are empty, it changes the plan to `armed` and creates one pending `activate_single_customer_pilot` approval card.

No business-effect switch changes during arm.

## Activate
Only after explicit owner approval of the activation card may `pilot-control` invoke the service-role-only activation RPC.

Activation performs one transactional scope change:
- `external_effects_locked=false`
- `pilot_mode_enabled=true`
- `autopilot_enabled=true`
- `payments_enabled=true`
- `fulfillment_enabled=true`
- Prospecting/Outreach/Auto Reply/Production remain false.
- Daily outreach cap remains 0.

The database pilot-scope trigger continuously reasserts these restrictions.

## Checkout
Only the pilot Payment Link identified in the active plan is accepted for automatic pilot processing.

Stripe independently enforces one completed session. The database also verifies the Payment Link ID/package against the active plan. When the first paid project is linked:
- checkout session ID is bound to the plan;
- project ID is bound to the plan;
- a pilot event is recorded;
- `payments_enabled` is automatically forced back to false.

Any different checkout/project is rejected by the pilot-capacity guard.

## Fulfillment
The one claimed project continues through the normal paid flow:
Payment → intake → build prep → AI preview → QA → owner review → client review/revisions → client approval → owner release approval.

The pilot does not loosen any normal paid-project, QA, revision, or release requirement.

## Production launch
Pilot mode itself never permits automatic production deployment. Once the project reaches the normal release-ready boundary, production remains a separate explicit owner decision under the existing production gate and domain/SSL requirements.

## Emergency halt
At any time, owner Pilot Control can invoke the emergency halt. It immediately:
- restores `external_effects_locked=true`;
- disables Pilot Mode;
- disables Autopilot, Prospecting, Outreach, Auto Reply, Payments, Fulfillment, and Production;
- resets the outreach cap to 0;
- records the halt reason.

Monitoring/recovery/brief infrastructure stays available for diagnosis.

## Abort conditions
Halt immediately for any of the following:
- unexpected second payment or second project;
- payment/project amount mismatch;
- critical/error monitoring incident affecting the pilot;
- exhausted retry/dead letter on the pilot path;
- AI output fails deterministic safety QA;
- preview/client-review token anomaly;
- domain ownership/SSL ambiguity;
- production smoke-test failure;
- any state that cannot be reconciled deterministically.

## Completion
After the first real customer is fully launched and stable, capture the pilot findings before expanding limits or enabling prospecting/outreach. Do not convert pilot controls into higher-volume settings merely because the first transaction succeeded.
