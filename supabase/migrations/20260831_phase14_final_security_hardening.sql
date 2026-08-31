-- Phase 14 final security hardening: least privilege for Data API and RPC surfaces.

alter default privileges for role postgres in schema public revoke all privileges on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all privileges on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all privileges on functions from public, anon, authenticated, service_role;

revoke truncate, references, trigger, maintain on all tables in schema public from anon, authenticated, service_role;

revoke all privileges on table public.automation_actions from anon;
revoke all privileges on table public.automation_settings from anon;
revoke all privileges on table public.pilot_activation_events from anon;
revoke all privileges on table public.pilot_activation_plans from anon;
revoke all privileges on table public.prospect_candidates from anon;
revoke all privileges on table public.prospect_import_runs from anon;
revoke all privileges on table public.prospect_preview_jobs from anon;
revoke all privileges on table public.stripe_catalog from anon;
revoke all privileges on table public.stripe_checkout_sessions from anon;
revoke all privileges on table public.stripe_payment_events from anon;

revoke all privileges on table public.content_items from anon;
grant select on table public.content_items to anon;

revoke all privileges on table public.project_production_ready from anon;
revoke all privileges on table public.prospect_ready_for_audit from anon;
revoke all privileges on table public.prospect_ready_for_preview from anon;
revoke all privileges on table public.prospect_ready_for_promotion from anon;

drop policy if exists owner_all_prospect_preview_jobs on public.prospect_preview_jobs;
create policy owner_all_prospect_preview_jobs on public.prospect_preview_jobs
for all to authenticated
using (lower(coalesce(((select auth.jwt())->>'email'),''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce(((select auth.jwt())->>'email'),''))='bonebrakewebsitedesign@gmail.com');

revoke execute on function public.lead_workflow_trigger() from public, anon, authenticated;
revoke execute on function public.phase14_enforce_external_effects_lock() from public, anon, authenticated;
revoke execute on function public.phase14_enforce_pilot_checkout_session() from public, anon, authenticated;
revoke execute on function public.phase14_enforce_pilot_scope() from public, anon, authenticated;
revoke execute on function public.phase14_queue_production_deploy_action() from public, anon, authenticated;
revoke execute on function public.phase14_queue_production_when_domain_ready() from public, anon, authenticated;
revoke execute on function public.phase14_score_prospect_candidate() from public, anon, authenticated;
revoke execute on function public.project_checklist_workflow_trigger() from public, anon, authenticated;
revoke execute on function public.project_workflow_trigger() from public, anon, authenticated;
revoke execute on function public.proposal_workflow_trigger() from public, anon, authenticated;
revoke execute on function public.seed_project_checklist() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.phase14_pilot_readiness(uuid) from anon;
