create index if not exists automation_dead_letters_action_idx on public.automation_dead_letters(action_id);

drop policy if exists owner_all_automation_retry_policies on public.automation_retry_policies;
create policy owner_all_automation_retry_policies on public.automation_retry_policies for all to authenticated
using (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com');

drop policy if exists owner_all_automation_retry_jobs on public.automation_retry_jobs;
create policy owner_all_automation_retry_jobs on public.automation_retry_jobs for all to authenticated
using (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com');

drop policy if exists owner_all_automation_retry_attempts on public.automation_retry_attempts;
create policy owner_all_automation_retry_attempts on public.automation_retry_attempts for all to authenticated
using (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com');

drop policy if exists owner_all_automation_dead_letters on public.automation_dead_letters;
create policy owner_all_automation_dead_letters on public.automation_dead_letters for all to authenticated
using (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com');