create or replace function public.phase14_enforce_pilot_checkout_session()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare
  s public.automation_settings%rowtype;
  p public.pilot_activation_plans%rowtype;
  expected_link text;
  expected_package text;
begin
  select * into s from public.automation_settings where key='global';
  if not coalesce(s.pilot_mode_enabled,false) then return new; end if;
  if s.pilot_active_plan_id is null then raise exception 'pilot_active_plan_required'; end if;

  select * into p from public.pilot_activation_plans where id=s.pilot_active_plan_id for update;
  if not found or p.status<>'active' then raise exception 'pilot_plan_not_active'; end if;
  expected_link:=p.metadata->>'payment_link_id';
  expected_package:=p.metadata->>'package_key';
  if expected_link is null or new.stripe_payment_link_id is distinct from expected_link then
    raise exception 'pilot_payment_link_not_authorized';
  end if;
  if expected_package is not null and new.package_key is distinct from expected_package then
    raise exception 'pilot_package_not_authorized';
  end if;

  if new.payment_status='paid' and new.project_id is not null then
    if p.claimed_checkout_session_id is null then
      update public.pilot_activation_plans
         set claimed_checkout_session_id=new.stripe_checkout_session_id,
             claimed_project_id=new.project_id,
             updated_at=now()
       where id=p.id;
      insert into public.pilot_activation_events(plan_id,event_type,severity,detail)
      values(p.id,'first_paid_project_claimed','warning',jsonb_build_object(
        'checkout_session_id',new.stripe_checkout_session_id,
        'project_id',new.project_id,
        'payment_link_id',new.stripe_payment_link_id
      ));
    elsif p.claimed_checkout_session_id<>new.stripe_checkout_session_id or p.claimed_project_id<>new.project_id then
      raise exception 'pilot_capacity_reached';
    end if;
    update public.automation_settings set payments_enabled=false,updated_at=now() where key='global';
  end if;
  return new;
end $$;

drop trigger if exists phase14_pilot_checkout_session_guard on public.stripe_checkout_sessions;
create trigger phase14_pilot_checkout_session_guard
before insert or update on public.stripe_checkout_sessions
for each row execute function public.phase14_enforce_pilot_checkout_session();
