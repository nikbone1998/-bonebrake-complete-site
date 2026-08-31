create or replace function public.phase14_executive_brief_metrics(p_timezone text default 'America/Chicago')
returns jsonb
language sql
stable
set search_path=public
as $$
with p as (
  select (timezone(p_timezone, now()))::date as local_date,
         now() - interval '24 hours' as since_24h,
         now() - interval '7 days' as since_7d,
         now() - interval '30 days' as since_30d
),
revenue as (
  select
    coalesce(sum(amount_total) filter (where payment_status='paid' and (timezone(p_timezone,coalesce(completed_at,updated_at)))::date=(select local_date from p)),0)::bigint as today_cents,
    coalesce(sum(amount_total) filter (where payment_status='paid' and coalesce(completed_at,updated_at)>=(select since_7d from p)),0)::bigint as seven_day_cents,
    coalesce(sum(amount_total) filter (where payment_status='paid' and coalesce(completed_at,updated_at)>=(select since_30d from p)),0)::bigint as thirty_day_cents,
    coalesce(sum(amount_total) filter (where payment_status='paid'),0)::bigint as lifetime_cents,
    count(*) filter (where payment_status='paid' and (timezone(p_timezone,coalesce(completed_at,updated_at)))::date=(select local_date from p))::int as paid_today_count,
    count(*) filter (where payment_status='paid' and coalesce(completed_at,updated_at)>=(select since_7d from p))::int as paid_7d_count
  from stripe_checkout_sessions
),
pipeline as (
  select
    count(*)::int as total,
    count(*) filter (where (timezone(p_timezone,created_at))::date=(select local_date from p))::int as new_today,
    count(*) filter (where status='new')::int as new_open,
    count(*) filter (where status='qualified')::int as qualified,
    count(*) filter (where status='proposal')::int as proposal,
    count(*) filter (where status='won' and updated_at>=(select since_30d from p))::int as won_30d,
    count(*) filter (where status='lost' and updated_at>=(select since_30d from p))::int as lost_30d,
    coalesce(sum(estimated_value) filter (where status in ('new','qualified','proposal')),0)::numeric as open_estimated_value
  from leads
),
project_metrics as (
  select
    count(*) filter (where status not in ('complete','completed','cancelled'))::int as active,
    count(*) filter (where payment_state='paid')::int as paid,
    count(*) filter (where status='review')::int as in_review,
    count(*) filter (where status='launch_ready')::int as launch_ready,
    count(*) filter (where status in ('complete','completed') and updated_at>=(select since_30d from p))::int as completed_30d
  from projects
),
approvals as (
  select
    count(*) filter (where status='pending')::int as pending,
    count(*) filter (where status='pending' and action_type='deploy_paid_project_production')::int as pending_production,
    count(*) filter (where status='failed' and updated_at>=(select since_24h from p))::int as failed_24h,
    count(*) filter (where status='completed' and executed_at>=(select since_24h from p))::int as completed_24h,
    coalesce(extract(epoch from (now()-min(created_at) filter (where status='pending')))/3600,0)::numeric(12,1) as oldest_pending_hours
  from automation_actions
),
incident_metrics as (
  select
    count(*) filter (where status in ('open','retrying','escalated') and severity='critical')::int as critical,
    count(*) filter (where status in ('open','retrying','escalated') and severity='error')::int as error,
    count(*) filter (where status in ('open','retrying','escalated') and severity='warning')::int as warning,
    count(*) filter (where status in ('open','retrying','escalated') and severity='info')::int as info,
    count(*) filter (where resolved_at>=(select since_24h from p))::int as resolved_24h
  from automation_incidents
),
fulfillment as (
  select
    count(*) filter (where status='waiting_intake')::int as waiting_intake,
    count(*) filter (where status='intake_ready')::int as intake_ready,
    count(*) filter (where status in ('queued','generating','qa'))::int as building,
    count(*) filter (where status='ready_for_review')::int as ready_for_review,
    count(*) filter (where status='failed')::int as failed
  from project_fulfillment_jobs
),
revisions as (
  select
    count(*) filter (where status in ('pending','approved','processing'))::int as open,
    count(*) filter (where status='processing')::int as processing,
    count(*) filter (where status='failed')::int as failed
  from project_revision_requests
),
domains as (
  select
    count(*) filter (where is_primary=true and (status in ('pending','awaiting_dns') or host_status='verification_required'))::int as pending,
    count(*) filter (where status='error' or ssl_status='error')::int as failed,
    count(*) filter (where is_primary=true and status in ('verified','active') and ssl_status='ready')::int as active_ready
  from project_site_domains
),
releases as (
  select
    count(*) filter (where status='release_ready')::int as release_ready,
    count(*) filter (where status='deployed' and is_active=true)::int as active_deployed,
    count(*) filter (where status='failed' and updated_at>=(select since_24h from p))::int as failed_24h
  from project_release_candidates
),
monitor as (
  select coalesce((select jsonb_build_object(
    'status',r.status,'started_at',r.started_at,'completed_at',r.completed_at,'checks_run',r.checks_run,'incidents_seen',r.incidents_seen,
    'recoveries_attempted',r.recoveries_attempted,'recoveries_succeeded',r.recoveries_succeeded,'escalations_created',r.escalations_created
  ) from automation_monitor_runs r order by r.started_at desc limit 1),'{}'::jsonb) as last_run,
  coalesce((select sum(recoveries_succeeded)::int from automation_monitor_runs where started_at>=(select since_24h from p)),0) as recoveries_24h
)
select jsonb_build_object(
  'business_date',(select local_date from p),
  'revenue',(select to_jsonb(revenue) from revenue),
  'pipeline',(select to_jsonb(pipeline) from pipeline),
  'projects',(select to_jsonb(project_metrics) from project_metrics),
  'approvals',(select to_jsonb(approvals) from approvals),
  'incidents',(select to_jsonb(incident_metrics) from incident_metrics),
  'fulfillment',(select to_jsonb(fulfillment) from fulfillment),
  'revisions',(select to_jsonb(revisions) from revisions),
  'domains',(select to_jsonb(domains) from domains),
  'releases',(select to_jsonb(releases) from releases),
  'monitoring',(select jsonb_build_object('last_run',last_run,'recoveries_24h',recoveries_24h) from monitor)
);
$$;

revoke all on function public.phase14_executive_brief_metrics(text) from public, anon, authenticated;
grant execute on function public.phase14_executive_brief_metrics(text) to service_role;