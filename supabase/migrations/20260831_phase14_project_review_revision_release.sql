create table if not exists public.project_revision_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  fulfillment_job_id uuid references public.project_fulfillment_jobs(id) on delete cascade,
  artifact_id uuid references public.project_generated_artifacts(id) on delete set null,
  submitted_by text not null check (submitted_by in ('client','owner','qa','system')),
  request_text text not null check (length(request_text) between 1 and 12000),
  structured_request jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','processing','applied','rejected','failed','cancelled')),
  applied_artifact_id uuid references public.project_generated_artifacts(id) on delete set null,
  processed_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.project_release_candidates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  fulfillment_job_id uuid not null references public.project_fulfillment_jobs(id) on delete cascade,
  artifact_id uuid not null references public.project_generated_artifacts(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','client_review','client_approved','owner_approved','release_ready','deploying','deployed','blocked','failed','cancelled')),
  qa_passed boolean not null default false,
  qa_report jsonb not null default '{}'::jsonb,
  payment_verified_at timestamptz,
  client_approved_at timestamptz,
  owner_approved_at timestamptz,
  release_ready_at timestamptz,
  production_deployed_at timestamptz,
  deployment_url text,
  failure_code text,
  failure_message text,
  metadata jsonb not null default '{}'::jsonb,
  unique(project_id, artifact_id)
);

create index if not exists project_revision_requests_project_idx on public.project_revision_requests(project_id, created_at desc);
create index if not exists project_revision_requests_job_idx on public.project_revision_requests(fulfillment_job_id, status);
create index if not exists project_revision_requests_artifact_idx on public.project_revision_requests(artifact_id);
create index if not exists project_release_candidates_project_idx on public.project_release_candidates(project_id, status);
create index if not exists project_release_candidates_job_idx on public.project_release_candidates(fulfillment_job_id, status);
create index if not exists project_release_candidates_artifact_idx on public.project_release_candidates(artifact_id);

alter table public.project_revision_requests enable row level security;
alter table public.project_release_candidates enable row level security;

revoke all on public.project_revision_requests from anon;
revoke all on public.project_release_candidates from anon;
grant select, insert, update, delete on public.project_revision_requests to authenticated;
grant select, insert, update, delete on public.project_release_candidates to authenticated;

drop policy if exists owner_all_project_revision_requests on public.project_revision_requests;
create policy owner_all_project_revision_requests on public.project_revision_requests
for all to authenticated
using (lower(coalesce((select auth.jwt()) ->> 'email','')) = 'bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce((select auth.jwt()) ->> 'email','')) = 'bonebrakewebsitedesign@gmail.com');

drop policy if exists owner_all_project_release_candidates on public.project_release_candidates;
create policy owner_all_project_release_candidates on public.project_release_candidates
for all to authenticated
using (lower(coalesce((select auth.jwt()) ->> 'email','')) = 'bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce((select auth.jwt()) ->> 'email','')) = 'bonebrakewebsitedesign@gmail.com');