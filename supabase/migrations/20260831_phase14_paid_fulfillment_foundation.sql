-- Phase 14 Bonebrake Autopilot: paid-client intake and fulfillment foundation.
-- Separates client intake, fulfillment execution, and later production release authority.

create table if not exists public.client_intake_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  client_email text,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','sent','submitted','expired','cancelled')),
  expires_at timestamptz not null,
  sent_at timestamptz,
  submitted_at timestamptz,
  answers jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists client_intake_active_project_unique
  on public.client_intake_requests(project_id)
  where status in ('pending','sent');
create index if not exists client_intake_project_idx on public.client_intake_requests(project_id, created_at desc);
create index if not exists client_intake_status_idx on public.client_intake_requests(status, expires_at);

create table if not exists public.project_fulfillment_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  intake_request_id uuid references public.client_intake_requests(id) on delete set null,
  status text not null default 'waiting_intake' check (status in ('waiting_intake','intake_ready','queued','generating','generated','qa','ready_for_review','approved','release_queued','completed','blocked','failed','cancelled')),
  build_profile text not null default 'paid_client_v1',
  requirements_snapshot jsonb not null default '{}'::jsonb,
  generation_spec jsonb not null default '{}'::jsonb,
  github_repo text,
  github_branch text,
  preview_url text,
  qa_report jsonb not null default '{}'::jsonb,
  failure_code text,
  failure_message text,
  started_at timestamptz,
  generated_at timestamptz,
  qa_completed_at timestamptz,
  approved_at timestamptz,
  completed_at timestamptz
);

create unique index if not exists project_fulfillment_active_project_unique
  on public.project_fulfillment_jobs(project_id)
  where status in ('waiting_intake','intake_ready','queued','generating','generated','qa','ready_for_review','approved','release_queued','blocked');
create index if not exists project_fulfillment_project_idx on public.project_fulfillment_jobs(project_id, created_at desc);
create index if not exists project_fulfillment_status_idx on public.project_fulfillment_jobs(status, updated_at desc);
create index if not exists project_fulfillment_intake_idx on public.project_fulfillment_jobs(intake_request_id);

alter table public.client_intake_requests enable row level security;
alter table public.project_fulfillment_jobs enable row level security;

drop policy if exists owner_all_client_intake_requests on public.client_intake_requests;
create policy owner_all_client_intake_requests on public.client_intake_requests for all to authenticated
using (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com');

drop policy if exists owner_all_project_fulfillment_jobs on public.project_fulfillment_jobs;
create policy owner_all_project_fulfillment_jobs on public.project_fulfillment_jobs for all to authenticated
using (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com');

revoke all on public.client_intake_requests from anon;
revoke all on public.project_fulfillment_jobs from anon;
