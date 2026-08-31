-- Phase 14 Bonebrake Autopilot: one-time AI build-worker credentials and preview artifacts.
-- Worker tokens are server-only. Generated sites remain preview-only until a separate release approval.

create table if not exists public.generation_worker_tokens (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action_id uuid not null references public.automation_actions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  fulfillment_job_id uuid not null references public.project_fulfillment_jobs(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'issued' check (status in ('issued','claimed','expired','cancelled')),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claim_count integer not null default 0 check (claim_count >= 0),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists generation_worker_tokens_action_idx on public.generation_worker_tokens(action_id, created_at desc);
create index if not exists generation_worker_tokens_project_idx on public.generation_worker_tokens(project_id, created_at desc);
create index if not exists generation_worker_tokens_job_idx on public.generation_worker_tokens(fulfillment_job_id, created_at desc);
create index if not exists generation_worker_tokens_status_idx on public.generation_worker_tokens(status, expires_at);

create table if not exists public.project_generated_artifacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  fulfillment_job_id uuid not null references public.project_fulfillment_jobs(id) on delete cascade,
  source_action_id uuid references public.automation_actions(id) on delete set null,
  version integer not null default 1 check (version > 0),
  status text not null default 'generated' check (status in ('generated','review','approved','rejected','archived')),
  title text,
  summary text,
  html text not null,
  content_sha256 text not null,
  qa_notes jsonb not null default '[]'::jsonb,
  preview_token_hash text not null unique,
  preview_expires_at timestamptz not null,
  approved_at timestamptz,
  rejected_at timestamptz
);

create unique index if not exists project_generated_artifact_version_unique on public.project_generated_artifacts(fulfillment_job_id, version);
create index if not exists project_generated_artifacts_project_idx on public.project_generated_artifacts(project_id, created_at desc);
create index if not exists project_generated_artifacts_job_idx on public.project_generated_artifacts(fulfillment_job_id, created_at desc);
create index if not exists project_generated_artifacts_status_idx on public.project_generated_artifacts(status, updated_at desc);

alter table public.generation_worker_tokens enable row level security;
alter table public.project_generated_artifacts enable row level security;

revoke all on public.generation_worker_tokens from anon, authenticated;
revoke all on public.project_generated_artifacts from anon;

drop policy if exists owner_all_project_generated_artifacts on public.project_generated_artifacts;
create policy owner_all_project_generated_artifacts on public.project_generated_artifacts for all to authenticated
using (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com');
