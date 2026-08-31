drop policy if exists owner_all_executive_brief_snapshots on public.executive_brief_snapshots;
create policy owner_all_executive_brief_snapshots on public.executive_brief_snapshots for all to authenticated
  using (lower((select auth.jwt())->>'email')='bonebrakewebsitedesign@gmail.com')
  with check (lower((select auth.jwt())->>'email')='bonebrakewebsitedesign@gmail.com');