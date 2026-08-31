drop policy if exists owner_all_project_site_domains on public.project_site_domains;
create policy owner_all_project_site_domains on public.project_site_domains
for all to authenticated
using (lower(coalesce(((select auth.jwt()) ->> 'email'),'')) = 'bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce(((select auth.jwt()) ->> 'email'),'')) = 'bonebrakewebsitedesign@gmail.com');
