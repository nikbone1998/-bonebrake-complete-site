create index if not exists automation_incidents_escalation_action_idx on public.automation_incidents(escalation_action_id) where escalation_action_id is not null;

drop policy if exists owner_all_automation_monitor_runs on public.automation_monitor_runs;
create policy owner_all_automation_monitor_runs on public.automation_monitor_runs for all to authenticated
  using (lower((select auth.jwt())->>'email')='bonebrakewebsitedesign@gmail.com')
  with check (lower((select auth.jwt())->>'email')='bonebrakewebsitedesign@gmail.com');

drop policy if exists owner_all_automation_incidents on public.automation_incidents;
create policy owner_all_automation_incidents on public.automation_incidents for all to authenticated
  using (lower((select auth.jwt())->>'email')='bonebrakewebsitedesign@gmail.com')
  with check (lower((select auth.jwt())->>'email')='bonebrakewebsitedesign@gmail.com');

drop policy if exists owner_all_automation_recovery_attempts on public.automation_recovery_attempts;
create policy owner_all_automation_recovery_attempts on public.automation_recovery_attempts for all to authenticated
  using (lower((select auth.jwt())->>'email')='bonebrakewebsitedesign@gmail.com')
  with check (lower((select auth.jwt())->>'email')='bonebrakewebsitedesign@gmail.com');