create or replace function public.phase14_pilot_readiness(p_plan_id uuid)
returns jsonb
language plpgsql
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
  if not p.auth_security_reviewed then v_blockers:=v_blockers||jsonb_build_array('auth_security_review_required'); end if;

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

  update public.pilot_activation_plans
     set readiness=v_checks,blockers=v_blockers,
         status=case when jsonb_array_length(v_blockers)=0 then 'ready' else 'blocked' end,
         updated_at=now()
   where id=p_plan_id and status in ('prepared','blocked','ready');

  return jsonb_build_object('ready',jsonb_array_length(v_blockers)=0,'checks',v_checks,'blockers',v_blockers);
end $$;

revoke execute on function public.phase14_pilot_readiness(uuid) from public,anon;
grant execute on function public.phase14_pilot_readiness(uuid) to authenticated,service_role;
