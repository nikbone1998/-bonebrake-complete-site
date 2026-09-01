-- Phase 14: Bonebrake Autopilot Control Center.
-- Owner-only operational records for hourly runs, immutable prospect design versions,
-- outreach evidence, and contextual ChatGPT command handoff.
-- Historical/customer data is intentionally NOT embedded in this public migration.

create table if not exists public.autopilot_control_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  trigger_source text not null default 'manual',
  status text not null default 'running' check (status in ('running','discovering','researching','scoring','building','qa','emailing','logging','completed','skipped','failed','cancelled')),
  stage text check (stage is null or stage in ('discover','research','score','build','qa','email','log')),
  current_action text,
  prospect_candidate_id uuid references public.prospect_candidates(id) on delete set null,
  prospect_name text,
  candidates_considered integer not null default 0 check (candidates_considered >= 0),
  candidates_qualified integer not null default 0 check (candidates_qualified >= 0),
  strict_score integer check (strict_score is null or strict_score between 0 and 100),
  website_score numeric(4,2) check (website_score is null or website_score between 0 and 10),
  concept_score numeric(4,2) check (concept_score is null or concept_score between 0 and 10),
  redesign_delta numeric(4,2),
  result_summary text,
  github_commit text,
  gmail_message_id text,
  gmail_thread_id text,
  metadata jsonb not null default '{}'::jsonb,
  error_message text
);

create index if not exists autopilot_control_runs_started_idx on public.autopilot_control_runs(started_at desc);
create index if not exists autopilot_control_runs_prospect_idx on public.autopilot_control_runs(prospect_candidate_id);

create table if not exists public.prospect_design_versions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  prospect_candidate_id uuid not null references public.prospect_candidates(id) on delete cascade,
  version text not null,
  title text,
  generation_reason text,
  original_url text,
  preview_path text not null,
  artifact_path text,
  desktop_screenshot_path text,
  mobile_screenshot_path text,
  outreach_sample_path text,
  github_commit text,
  current_site_score numeric(4,2) check (current_site_score is null or current_site_score between 0 and 10),
  concept_score numeric(4,2) check (concept_score is null or concept_score between 0 and 10),
  redesign_delta numeric(4,2),
  qa_report jsonb not null default '{}'::jsonb,
  source_facts jsonb not null default '[]'::jsonb,
  source_assets jsonb not null default '[]'::jsonb,
  shown_to_prospect boolean not null default false,
  attached_to_outreach boolean not null default false,
  client_approved boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  unique(prospect_candidate_id,version)
);

create index if not exists prospect_design_versions_prospect_idx on public.prospect_design_versions(prospect_candidate_id,created_at desc);

create table if not exists public.prospect_outreach_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  prospect_candidate_id uuid not null references public.prospect_candidates(id) on delete cascade,
  design_version_id uuid references public.prospect_design_versions(id) on delete set null,
  event_type text not null check (event_type in ('prepared','sent','reply','replied','interested','declined','unsubscribe','suppressed','delivery_failed','note')),
  status text,
  recipient text,
  sender text,
  contact_name text,
  subject text,
  message_body text,
  summary text,
  classification text,
  gmail_message_id text,
  gmail_thread_id text,
  sample_path text,
  sample_filename text,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists prospect_outreach_gmail_message_uq on public.prospect_outreach_events(gmail_message_id) where gmail_message_id is not null;
create index if not exists prospect_outreach_prospect_idx on public.prospect_outreach_events(prospect_candidate_id,created_at desc);

create table if not exists public.control_center_commands (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  prospect_candidate_id uuid references public.prospect_candidates(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  design_version_id uuid references public.prospect_design_versions(id) on delete set null,
  action_type text not null,
  command text not null,
  approval_status text not null default 'draft' check (approval_status in ('draft','awaiting_approval','approved','rejected','not_required')),
  execution_status text not null default 'waiting_for_chatgpt' check (execution_status in ('draft','waiting_for_chatgpt','executing','completed','failed','rejected')),
  external_effect boolean not null default false,
  requested_by text not null default 'owner_ui',
  executed_at timestamptz,
  result jsonb,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists control_center_commands_created_idx on public.control_center_commands(created_at desc);

alter table public.autopilot_control_runs enable row level security;
alter table public.prospect_design_versions enable row level security;
alter table public.prospect_outreach_events enable row level security;
alter table public.control_center_commands enable row level security;

revoke all on public.autopilot_control_runs,public.prospect_design_versions,public.prospect_outreach_events,public.control_center_commands from anon;
grant select,insert,update,delete on public.autopilot_control_runs,public.prospect_design_versions,public.prospect_outreach_events,public.control_center_commands to authenticated;

drop policy if exists owner_all_autopilot_control_runs on public.autopilot_control_runs;
create policy owner_all_autopilot_control_runs on public.autopilot_control_runs for all to authenticated
using (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com');

drop policy if exists owner_all_prospect_design_versions on public.prospect_design_versions;
create policy owner_all_prospect_design_versions on public.prospect_design_versions for all to authenticated
using (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com');

drop policy if exists owner_all_prospect_outreach_events on public.prospect_outreach_events;
create policy owner_all_prospect_outreach_events on public.prospect_outreach_events for all to authenticated
using (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com');

drop policy if exists owner_all_control_center_commands on public.control_center_commands;
create policy owner_all_control_center_commands on public.control_center_commands for all to authenticated
using (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com');

update public.automation_settings
set config=coalesce(config,'{}'::jsonb)||jsonb_build_object('sales_autopilot_schedule',jsonb_build_object('frequency','hourly','minute',12,'source','ChatGPT scheduled task')),
    updated_at=now();
