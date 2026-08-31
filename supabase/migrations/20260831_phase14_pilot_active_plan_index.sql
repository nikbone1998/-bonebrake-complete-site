create index if not exists automation_settings_pilot_active_plan_idx
  on public.automation_settings(pilot_active_plan_id)
  where pilot_active_plan_id is not null;
