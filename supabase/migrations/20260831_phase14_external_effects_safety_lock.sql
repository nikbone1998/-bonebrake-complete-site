alter table public.automation_settings
  add column if not exists external_effects_locked boolean not null default false;

create or replace function public.phase14_enforce_external_effects_lock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(old.external_effects_locked,false)
     or coalesce(new.external_effects_locked,false) then
    new.autopilot_enabled := false;
    new.prospecting_enabled := false;
    new.outreach_enabled := false;
    new.auto_reply_enabled := false;
    new.payments_enabled := false;
    new.fulfillment_enabled := false;
    new.production_deploy_enabled := false;
    new.daily_outreach_cap := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists phase14_external_effects_lock_guard
  on public.automation_settings;

create trigger phase14_external_effects_lock_guard
before update on public.automation_settings
for each row execute function public.phase14_enforce_external_effects_lock();
