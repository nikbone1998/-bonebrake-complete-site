alter table public.project_release_candidates
  add column if not exists is_active boolean not null default false,
  add column if not exists activated_at timestamptz,
  add column if not exists deactivated_at timestamptz,
  add column if not exists previous_release_id uuid references public.project_release_candidates(id) on delete set null,
  add column if not exists deployment_health jsonb not null default '{}'::jsonb;

create unique index if not exists project_release_candidates_one_active_per_project_idx
  on public.project_release_candidates(project_id) where is_active = true;
create index if not exists project_release_candidates_previous_release_idx
  on public.project_release_candidates(previous_release_id) where previous_release_id is not null;
create index if not exists project_release_candidates_active_lookup_idx
  on public.project_release_candidates(project_id,status,is_active);

create table if not exists public.project_site_domains (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  hostname text not null unique,
  is_primary boolean not null default false,
  status text not null default 'pending' check (status in ('pending','awaiting_dns','verified','active','disabled','error')),
  ssl_status text not null default 'unknown' check (ssl_status in ('unknown','pending','ready','error')),
  verification_method text,
  verification_data jsonb not null default '{}'::jsonb,
  host_project_id text,
  added_to_host_at timestamptz,
  verified_at timestamptz,
  ssl_ready_at timestamptz,
  last_checked_at timestamptz,
  failure_code text,
  failure_message text,
  constraint project_site_domains_hostname_format_check check (
    hostname = lower(hostname)
    and hostname ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
    and length(hostname) <= 253
  )
);
create unique index if not exists project_site_domains_one_primary_idx
  on public.project_site_domains(project_id) where is_primary=true and status<>'disabled';
create index if not exists project_site_domains_project_idx on public.project_site_domains(project_id);
create index if not exists project_site_domains_status_idx on public.project_site_domains(status,ssl_status);
create index if not exists project_site_domains_active_lookup_idx on public.project_site_domains(hostname,status) where status='active';

alter table public.project_site_domains enable row level security;
drop policy if exists owner_all_project_site_domains on public.project_site_domains;
create policy owner_all_project_site_domains on public.project_site_domains for all to authenticated
using (lower(coalesce((select auth.jwt()->>'email'),''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce((select auth.jwt()->>'email'),''))='bonebrakewebsitedesign@gmail.com');
revoke all on public.project_site_domains from anon;
revoke all on public.project_site_domains from authenticated;
grant select,insert,update,delete on public.project_site_domains to authenticated;

create or replace view public.project_production_ready with (security_invoker=true) as
select r.id release_candidate_id,r.project_id,r.fulfillment_job_id,r.artifact_id,r.status release_status,r.qa_passed,r.payment_verified_at,r.client_approved_at,r.owner_approved_at,r.release_ready_at,d.id domain_id,d.hostname,d.is_primary,d.status domain_status,d.ssl_status,d.verified_at,d.ssl_ready_at
from public.project_release_candidates r join public.project_site_domains d on d.project_id=r.project_id
where r.status='release_ready' and r.qa_passed=true and r.payment_verified_at is not null and r.client_approved_at is not null and r.owner_approved_at is not null and d.is_primary=true and d.status in ('verified','active') and d.ssl_status='ready';