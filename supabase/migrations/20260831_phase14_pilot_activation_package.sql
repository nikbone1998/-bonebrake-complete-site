create table if not exists public.pilot_activation_plans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null default 'First Customer Pilot',
  status text not null default 'prepared' check (status in ('prepared','blocked','ready','armed','active','halted','completed','cancelled')),
  max_paid_projects smallint not null default 1 check (max_paid_projects = 1),
  max_concurrent_projects smallint not null default 1 check (max_concurrent_projects = 1),
  checkout_mode text not null default 'single_customer' check (checkout_mode = 'single_customer'),
  allow_prospecting boolean not null default false check (allow_prospecting = false),
  allow_outreach boolean not null default false check (allow_outreach = false),
  allow_auto_reply boolean not null default false check (allow_auto_reply = false),
  allow_automatic_production boolean not null default false check (allow_automatic_production = false),
  allow_payments boolean not null default true,
  allow_fulfillment boolean not null default true,
  ci_green boolean not null default false,
  vercel_worker_route_ready boolean not null default false,
  ai_runtime_certified boolean not null default false,
  single_customer_checkout_ready boolean not null default false,
  domain_launch_path_ready boolean not null default false,
  auth_security_reviewed boolean not null default false,
  readiness jsonb not null default '{}'::jsonb,
  blockers jsonb not null default '[]'::jsonb check (jsonb_typeof(blockers)='array'),
  claimed_checkout_session_id text unique,
  claimed_project_id uuid unique references public.projects(id) on delete set null,
  owner_approved_at timestamptz,
  armed_at timestamptz,
  activated_at timestamptz,
  halted_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists pilot_one_open_plan_idx
  on public.pilot_activation_plans ((true))
  where status in ('prepared','blocked','ready','armed','active');

alter table public.pilot_activation_plans enable row level security;
drop policy if exists owner_all_pilot_activation_plans on public.pilot_activation_plans;
create policy owner_all_pilot_activation_plans on public.pilot_activation_plans
for all to authenticated
using (lower(coalesce(((select auth.jwt())->>'email'),''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce(((select auth.jwt())->>'email'),''))='bonebrakewebsitedesign@gmail.com');

create table if not exists public.pilot_activation_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  plan_id uuid not null references public.pilot_activation_plans(id) on delete cascade,
  event_type text not null,
  severity text not null default 'info' check (severity in ('info','warning','error','critical')),
  detail jsonb not null default '{}'::jsonb
);
create index if not exists pilot_activation_events_plan_created_idx on public.pilot_activation_events(plan_id,created_at desc);
alter table public.pilot_activation_events enable row level security;
drop policy if exists owner_all_pilot_activation_events on public.pilot_activation_events;
create policy owner_all_pilot_activation_events on public.pilot_activation_events
for all to authenticated
using (lower(coalesce(((select auth.jwt())->>'email'),''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce(((select auth.jwt())->>'email'),''))='bonebrakewebsitedesign@gmail.com');

alter table public.automation_settings add column if not exists pilot_mode_enabled boolean not null default false;
alter table public.automation_settings add column if not exists pilot_active_plan_id uuid references public.pilot_activation_plans(id) on delete set null;
alter table public.automation_settings add column if not exists pilot_max_paid_projects smallint not null default 1 check (pilot_max_paid_projects = 1);
alter table public.automation_settings add column if not exists pilot_max_concurrent_projects smallint not null default 1 check (pilot_max_concurrent_projects = 1);

create or replace function public.phase14_enforce_external_effects_lock()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  if coalesce(old.external_effects_locked,false) or coalesce(new.external_effects_locked,false) then
    new.autopilot_enabled:=false;
    new.prospecting_enabled:=false;
    new.outreach_enabled:=false;
    new.auto_reply_enabled:=false;
    new.payments_enabled:=false;
    new.fulfillment_enabled:=false;
    new.production_deploy_enabled:=false;
    new.daily_outreach_cap:=0;
    new.pilot_mode_enabled:=false;
    new.pilot_active_plan_id:=null;
  end if;
  return new;
end $$;

create or replace function public.phase14_enforce_pilot_scope()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare v_claimed text;
begin
  if coalesce(new.pilot_mode_enabled,false) then
    new.prospecting_enabled:=false;
    new.outreach_enabled:=false;
    new.auto_reply_enabled:=false;
    new.production_deploy_enabled:=false;
    new.daily_outreach_cap:=0;
    new.pilot_max_paid_projects:=1;
    new.pilot_max_concurrent_projects:=1;
    if new.pilot_active_plan_id is null then
      new.autopilot_enabled:=false;
      new.payments_enabled:=false;
      new.fulfillment_enabled:=false;
    else
      select claimed_checkout_session_id into v_claimed from public.pilot_activation_plans where id=new.pilot_active_plan_id;
      if v_claimed is not null then new.payments_enabled:=false; end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists phase14_pilot_scope_guard on public.automation_settings;
create trigger phase14_pilot_scope_guard before insert or update on public.automation_settings
for each row execute function public.phase14_enforce_pilot_scope();

create or replace function public.phase14_pilot_readiness(p_plan_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  p public.pilot_activation_plans%rowtype;
  s public.automation_settings%rowtype;
  v_open_incidents int:=0;
  v_open_dead_letters int:=0;
  v_open_projects int:=0;
  v_failed_actions int:=0;
  v_blockers jsonb:='[]'::jsonb;
  v_checks jsonb;
begin
  select * into p from public.pilot_activation_plans where id=p_plan_id;
  if not found then raise exception 'pilot_plan_not_found'; end if;
  select * into s from public.automation_settings where key='global';
  select count(*) into v_open_incidents from public.automation_incidents where status='open' and severity in ('critical','error');
  select count(*) into v_open_dead_letters from public.automation_dead_letters where status='open';
  select count(*) into v_open_projects from public.projects where status not in ('complete','cancelled');
  select count(*) into v_failed_actions from public.automation_actions where status='failed' and updated_at >= now()-interval '24 hours';

  if not coalesce(s.external_effects_locked,false) then v_blockers:=v_blockers||jsonb_build_array('external_effects_lock_must_be_on_while_preparing'); end if;
  if coalesce(s.autopilot_enabled,false) or coalesce(s.prospecting_enabled,false) or coalesce(s.outreach_enabled,false) or coalesce(s.auto_reply_enabled,false) or coalesce(s.payments_enabled,false) or coalesce(s.fulfillment_enabled,false) or coalesce(s.production_deploy_enabled,false) then v_blockers:=v_blockers||jsonb_build_array('business_effect_switches_must_be_off_before_arming'); end if;
  if not coalesce(s.monitoring_enabled,false) or not coalesce(s.auto_recovery_enabled,false) then v_blockers:=v_blockers||jsonb_build_array('monitoring_and_recovery_required'); end if;
  if not coalesce(s.retry_engine_enabled,false) or not coalesce(s.auto_retry_enabled,false) then v_blockers:=v_blockers||jsonb_build_array('retry_engine_required'); end if;
  if not coalesce(s.executive_brief_enabled,false) then v_blockers:=v_blockers||jsonb_build_array('executive_brief_required'); end if;
  if not coalesce(s.domain_onboarding_enabled,false) then v_blockers:=v_blockers||jsonb_build_array('domain_onboarding_required'); end if;
  if v_open_incidents>0 then v_blockers:=v_blockers||jsonb_build_array('critical_or_error_incidents_open'); end if;
  if v_open_dead_letters>0 then v_blockers:=v_blockers||jsonb_build_array('dead_letters_open'); end if;
  if v_open_projects>0 then v_blockers:=v_blockers||jsonb_build_array('existing_open_project_present'); end if;
  if v_failed_actions>0 then v_blockers:=v_blockers||jsonb_build_array('failed_automation_action_in_last_24h'); end if;
  if not p.ci_green then v_blockers:=v_blockers||jsonb_build_array('ci_not_certified'); end if;
  if not p.vercel_worker_route_ready then v_blockers:=v_blockers||jsonb_build_array('vercel_worker_route_not_ready'); end if;
  if not p.ai_runtime_certified then v_blockers:=v_blockers||jsonb_build_array('ai_runtime_post_not_certified'); end if;
  if not p.single_customer_checkout_ready then v_blockers:=v_blockers||jsonb_build_array('single_customer_checkout_not_ready'); end if;
  if not p.domain_launch_path_ready then v_blockers:=v_blockers||jsonb_build_array('domain_launch_path_not_ready'); end if;

  v_checks:=jsonb_build_object(
    'external_effects_locked',coalesce(s.external_effects_locked,false),
    'business_effect_switches_off',not(coalesce(s.autopilot_enabled,false) or coalesce(s.prospecting_enabled,false) or coalesce(s.outreach_enabled,false) or coalesce(s.auto_reply_enabled,false) or coalesce(s.payments_enabled,false) or coalesce(s.fulfillment_enabled,false) or coalesce(s.production_deploy_enabled,false)),
    'monitoring_ready',coalesce(s.monitoring_enabled,false) and coalesce(s.auto_recovery_enabled,false),
    'retry_ready',coalesce(s.retry_engine_enabled,false) and coalesce(s.auto_retry_enabled,false),
    'brief_ready',coalesce(s.executive_brief_enabled,false),
    'domain_onboarding_ready',coalesce(s.domain_onboarding_enabled,false),
    'open_incidents',v_open_incidents,'open_dead_letters',v_open_dead_letters,'open_projects',v_open_projects,'failed_actions_24h',v_failed_actions,
    'ci_green',p.ci_green,'vercel_worker_route_ready',p.vercel_worker_route_ready,'ai_runtime_certified',p.ai_runtime_certified,
    'single_customer_checkout_ready',p.single_customer_checkout_ready,'domain_launch_path_ready',p.domain_launch_path_ready,'auth_security_reviewed',p.auth_security_reviewed,
    'max_paid_projects',p.max_paid_projects,'max_concurrent_projects',p.max_concurrent_projects,'checkout_mode',p.checkout_mode
  );

  update public.pilot_activation_plans set readiness=v_checks,blockers=v_blockers,
    status=case when jsonb_array_length(v_blockers)=0 then 'ready' else 'blocked' end,updated_at=now()
  where id=p_plan_id and status in ('prepared','blocked','ready');
  return jsonb_build_object('ready',jsonb_array_length(v_blockers)=0,'checks',v_checks,'blockers',v_blockers);
end $$;
revoke all on function public.phase14_pilot_readiness(uuid) from public;
grant execute on function public.phase14_pilot_readiness(uuid) to authenticated,service_role;

create or replace function public.phase14_claim_pilot_checkout(p_plan_id uuid,p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare p public.pilot_activation_plans%rowtype; s public.automation_settings%rowtype;
begin
  if p_session_id is null or length(trim(p_session_id))<10 then raise exception 'valid_checkout_session_required'; end if;
  select * into s from public.automation_settings where key='global' for update;
  if not found or not s.pilot_mode_enabled or s.pilot_active_plan_id is distinct from p_plan_id then raise exception 'pilot_not_active'; end if;
  select * into p from public.pilot_activation_plans where id=p_plan_id for update;
  if not found or p.status<>'active' or p.max_paid_projects<>1 then raise exception 'pilot_plan_not_active'; end if;
  if p.claimed_checkout_session_id is null then
    update public.pilot_activation_plans set claimed_checkout_session_id=p_session_id,updated_at=now() where id=p.id;
    insert into public.pilot_activation_events(plan_id,event_type,detail) values(p.id,'checkout_claimed',jsonb_build_object('checkout_session_id',p_session_id));
  elsif p.claimed_checkout_session_id<>p_session_id then
    raise exception 'pilot_capacity_reached';
  end if;
  update public.automation_settings set payments_enabled=false,updated_at=now() where key='global';
  return jsonb_build_object('ok',true,'plan_id',p.id,'checkout_session_id',p_session_id,'payments_disabled_after_claim',true);
end $$;
revoke all on function public.phase14_claim_pilot_checkout(uuid,text) from public;
grant execute on function public.phase14_claim_pilot_checkout(uuid,text) to service_role;

create or replace function public.phase14_bind_pilot_project(p_plan_id uuid,p_session_id text,p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare p public.pilot_activation_plans%rowtype;
begin
  select * into p from public.pilot_activation_plans where id=p_plan_id for update;
  if not found or p.status<>'active' or p.claimed_checkout_session_id is distinct from p_session_id then raise exception 'pilot_checkout_not_claimed'; end if;
  if p.claimed_project_id is null then
    update public.pilot_activation_plans set claimed_project_id=p_project_id,updated_at=now() where id=p.id;
    insert into public.pilot_activation_events(plan_id,event_type,detail) values(p.id,'project_bound',jsonb_build_object('project_id',p_project_id,'checkout_session_id',p_session_id));
  elsif p.claimed_project_id<>p_project_id then
    raise exception 'pilot_project_already_bound';
  end if;
  return jsonb_build_object('ok',true,'plan_id',p.id,'project_id',p_project_id);
end $$;
revoke all on function public.phase14_bind_pilot_project(uuid,text,uuid) from public;
grant execute on function public.phase14_bind_pilot_project(uuid,text,uuid) to service_role;

create schema if not exists internal;
create or replace function internal.phase14_activate_single_customer_pilot(p_plan_id uuid,p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare p public.pilot_activation_plans%rowtype; a public.automation_actions%rowtype; r jsonb;
begin
  select * into p from public.pilot_activation_plans where id=p_plan_id for update;
  if not found or p.status<>'armed' then raise exception 'pilot_plan_not_armed'; end if;
  r:=public.phase14_pilot_readiness(p_plan_id);
  if coalesce((r->>'ready')::boolean,false) is not true then raise exception 'pilot_readiness_failed'; end if;
  select * into a from public.automation_actions where id=p_action_id for update;
  if not found or a.action_type<>'activate_single_customer_pilot' or a.entity_type<>'pilot_activation_plan' or a.entity_id<>p_plan_id or a.status<>'approved' then raise exception 'approved_pilot_activation_action_required'; end if;
  if p.claimed_checkout_session_id is not null or p.claimed_project_id is not null then raise exception 'pilot_already_claimed'; end if;
  update public.automation_settings set external_effects_locked=false,updated_at=now() where key='global';
  update public.automation_settings set pilot_mode_enabled=true,pilot_active_plan_id=p.id,pilot_max_paid_projects=1,pilot_max_concurrent_projects=1,
    autopilot_enabled=true,payments_enabled=true,fulfillment_enabled=true,prospecting_enabled=false,outreach_enabled=false,auto_reply_enabled=false,
    production_deploy_enabled=false,daily_outreach_cap=0,updated_at=now() where key='global';
  update public.pilot_activation_plans set status='active',activated_at=now(),updated_at=now() where id=p.id;
  update public.automation_actions set status='completed',executed_at=now(),updated_at=now(),result=jsonb_build_object('pilot_plan_id',p.id,'scope','single_customer','payments',true,'fulfillment',true,'production',false,'outreach',false) where id=a.id;
  insert into public.pilot_activation_events(plan_id,event_type,severity,detail) values(p.id,'pilot_activated','warning',jsonb_build_object('payments_enabled',true,'fulfillment_enabled',true,'prospecting_enabled',false,'outreach_enabled',false,'production_enabled',false));
  return jsonb_build_object('ok',true,'plan_id',p.id,'status','active');
end $$;
revoke all on function internal.phase14_activate_single_customer_pilot(uuid,uuid) from public,anon,authenticated;
grant execute on function internal.phase14_activate_single_customer_pilot(uuid,uuid) to service_role;

create or replace function internal.phase14_halt_single_customer_pilot(p_plan_id uuid,p_reason text default 'manual_halt')
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  update public.automation_settings set external_effects_locked=true,pilot_mode_enabled=false,pilot_active_plan_id=null,
    autopilot_enabled=false,prospecting_enabled=false,outreach_enabled=false,auto_reply_enabled=false,payments_enabled=false,fulfillment_enabled=false,
    production_deploy_enabled=false,daily_outreach_cap=0,updated_at=now() where key='global';
  update public.pilot_activation_plans set status=case when status='completed' then status else 'halted' end,
    halted_at=case when status='completed' then halted_at else now() end,updated_at=now() where id=p_plan_id;
  insert into public.pilot_activation_events(plan_id,event_type,severity,detail) values(p_plan_id,'pilot_halted','warning',jsonb_build_object('reason',left(coalesce(p_reason,'manual_halt'),500)));
  return jsonb_build_object('ok',true,'plan_id',p_plan_id,'external_effects_locked',true);
end $$;
revoke all on function internal.phase14_halt_single_customer_pilot(uuid,text) from public,anon,authenticated;
grant execute on function internal.phase14_halt_single_customer_pilot(uuid,text) to service_role;

create or replace function public.phase14_activate_single_customer_pilot(p_plan_id uuid,p_action_id uuid)
returns jsonb language sql security definer set search_path=public,pg_temp
as $$ select internal.phase14_activate_single_customer_pilot(p_plan_id,p_action_id); $$;
revoke all on function public.phase14_activate_single_customer_pilot(uuid,uuid) from public,anon,authenticated;
grant execute on function public.phase14_activate_single_customer_pilot(uuid,uuid) to service_role;

create or replace function public.phase14_halt_single_customer_pilot(p_plan_id uuid,p_reason text default 'manual_halt')
returns jsonb language sql security definer set search_path=public,pg_temp
as $$ select internal.phase14_halt_single_customer_pilot(p_plan_id,p_reason); $$;
revoke all on function public.phase14_halt_single_customer_pilot(uuid,text) from public,anon,authenticated;
grant execute on function public.phase14_halt_single_customer_pilot(uuid,text) to service_role;
