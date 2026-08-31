alter table public.automation_settings
  add column if not exists retry_engine_enabled boolean not null default false,
  add column if not exists auto_retry_enabled boolean not null default false,
  add column if not exists retry_interval_minutes integer not null default 1 check (retry_interval_minutes between 1 and 60);

create table if not exists public.automation_retry_policies (
  action_type text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  executor_path text not null,
  enabled boolean not null default true,
  auto_retry boolean not null default false,
  max_attempts integer not null default 0 check (max_attempts between 0 and 10),
  base_delay_seconds integer not null default 60 check (base_delay_seconds between 5 and 86400),
  max_delay_seconds integer not null default 1800 check (max_delay_seconds between 5 and 86400),
  backoff_multiplier numeric(4,2) not null default 2.0 check (backoff_multiplier between 1 and 10),
  jitter_percent integer not null default 15 check (jitter_percent between 0 and 50),
  reset_strategy text not null default 'none' check (reset_strategy in ('none','reset_generation_job')),
  non_retryable_error_patterns text[] not null default '{}'::text[],
  notes text
);

create table if not exists public.automation_retry_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  action_id uuid not null unique references public.automation_actions(id) on delete cascade,
  action_type text not null references public.automation_retry_policies(action_type) on update cascade,
  status text not null default 'scheduled' check (status in ('scheduled','waiting','dispatching','succeeded','exhausted','manual','cancelled')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 100),
  max_attempts integer not null default 0 check (max_attempts between 0 and 10),
  next_attempt_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  last_http_status integer,
  last_response jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  dead_lettered_at timestamptz,
  escalation_action_id uuid references public.automation_actions(id) on delete set null
);
create index if not exists automation_retry_jobs_due_idx on public.automation_retry_jobs(status,next_attempt_at) where status in ('scheduled','waiting');
create index if not exists automation_retry_jobs_action_type_idx on public.automation_retry_jobs(action_type,status);
create index if not exists automation_retry_jobs_escalation_idx on public.automation_retry_jobs(escalation_action_id) where escalation_action_id is not null;

create table if not exists public.automation_retry_attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  retry_job_id uuid not null references public.automation_retry_jobs(id) on delete cascade,
  action_id uuid not null references public.automation_actions(id) on delete cascade,
  attempt_number integer not null check (attempt_number between 1 and 100),
  scheduled_for timestamptz,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'dispatching' check (status in ('dispatching','succeeded','failed','skipped')),
  delay_seconds integer,
  http_status integer,
  error_message text,
  response jsonb not null default '{}'::jsonb,
  unique(retry_job_id,attempt_number)
);
create index if not exists automation_retry_attempts_action_idx on public.automation_retry_attempts(action_id,created_at desc);

create table if not exists public.automation_dead_letters (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retry_job_id uuid not null unique references public.automation_retry_jobs(id) on delete cascade,
  action_id uuid not null references public.automation_actions(id) on delete cascade,
  action_type text not null,
  reason text not null,
  error_message text,
  payload_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','resolved','ignored')),
  escalation_action_id uuid references public.automation_actions(id) on delete set null,
  resolved_at timestamptz,
  resolution text
);
create index if not exists automation_dead_letters_status_idx on public.automation_dead_letters(status,created_at desc);
create index if not exists automation_dead_letters_escalation_idx on public.automation_dead_letters(escalation_action_id) where escalation_action_id is not null;

alter table public.automation_retry_policies enable row level security;
alter table public.automation_retry_jobs enable row level security;
alter table public.automation_retry_attempts enable row level security;
alter table public.automation_dead_letters enable row level security;

drop policy if exists owner_all_automation_retry_policies on public.automation_retry_policies;
create policy owner_all_automation_retry_policies on public.automation_retry_policies for all to authenticated
using (lower(coalesce((select auth.jwt()->>'email'),''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce((select auth.jwt()->>'email'),''))='bonebrakewebsitedesign@gmail.com');
drop policy if exists owner_all_automation_retry_jobs on public.automation_retry_jobs;
create policy owner_all_automation_retry_jobs on public.automation_retry_jobs for all to authenticated
using (lower(coalesce((select auth.jwt()->>'email'),''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce((select auth.jwt()->>'email'),''))='bonebrakewebsitedesign@gmail.com');
drop policy if exists owner_all_automation_retry_attempts on public.automation_retry_attempts;
create policy owner_all_automation_retry_attempts on public.automation_retry_attempts for all to authenticated
using (lower(coalesce((select auth.jwt()->>'email'),''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce((select auth.jwt()->>'email'),''))='bonebrakewebsitedesign@gmail.com');
drop policy if exists owner_all_automation_dead_letters on public.automation_dead_letters;
create policy owner_all_automation_dead_letters on public.automation_dead_letters for all to authenticated
using (lower(coalesce((select auth.jwt()->>'email'),''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce((select auth.jwt()->>'email'),''))='bonebrakewebsitedesign@gmail.com');

revoke all on public.automation_retry_policies, public.automation_retry_jobs, public.automation_retry_attempts, public.automation_dead_letters from anon;
revoke all on public.automation_retry_policies, public.automation_retry_jobs, public.automation_retry_attempts, public.automation_dead_letters from authenticated;
grant select,insert,update,delete on public.automation_retry_policies, public.automation_retry_jobs, public.automation_retry_attempts, public.automation_dead_letters to authenticated;

insert into public.automation_retry_policies(action_type,executor_path,enabled,auto_retry,max_attempts,base_delay_seconds,max_delay_seconds,backoff_multiplier,jitter_percent,reset_strategy,non_retryable_error_patterns,notes)
values
 ('run_prospect_audit','/functions/v1/autopilot-execute',true,true,3,60,900,2.0,20,'none',array['candidate_id_missing','prospect_not_found','prospect_not_qualified','prospect_website_missing'],'Safe bounded retry of an already-approved audit action.'),
 ('promote_prospect_to_crm','/functions/v1/autopilot-execute',true,true,2,60,600,2.0,15,'none',array['candidate_id_missing','prospect_no_longer_ready_for_promotion','valid_email_required','prospect_not_found'],'CRM promotion is idempotent through candidate/lead linkage.'),
 ('start_paid_project_fulfillment','/functions/v1/autopilot-execute',true,false,0,60,600,2.0,0,'none',array[]::text[],'Manual only because fulfillment start can issue a new client intake credential.'),
 ('prepare_paid_project_build','/functions/v1/autopilot-execute',true,true,3,30,600,2.0,15,'none',array['valid_project_id_required','project_not_found','project_not_fully_paid','submitted_client_intake_required','fulfillment_job_not_ready'],'Build preparation is internal and idempotently queues generation.'),
 ('generate_paid_project_build','/functions/v1/generate-project-build',true,true,3,120,1800,2.0,20,'reset_generation_job',array['generation_targets_invalid','paid_project_required','queued_generation_spec_required','preview_only_spec_required','ai_builder_url_invalid'],'AI generation may retry transient worker/network/model failures; each attempt remains preview-only.'),
 ('apply_paid_project_revision','/functions/v1/apply-project-revision',true,false,0,120,1800,2.0,0,'none',array[]::text[],'Manual only until revision versioning is certified idempotent across partial failures.'),
 ('review_paid_project_preview','/functions/v1/project-release-execute',true,false,0,60,600,2.0,0,'none',array[]::text[],'Owner review decision is never replayed automatically.'),
 ('approve_paid_project_release','/functions/v1/project-release-execute',true,false,0,60,600,2.0,0,'none',array[]::text[],'Owner release authority is never replayed automatically.'),
 ('deploy_paid_project_production','/functions/v1/production-deploy-execute',true,false,0,60,600,2.0,0,'none',array[]::text[],'Production deployment is never automatically retried.'),
 ('attach_client_domain_to_vercel','external:vercel-domain-write',true,false,0,60,600,2.0,0,'none',array[]::text[],'External domain attachment remains explicit/manual until a domain-write bridge exists.'),
 ('review_failed_payment','manual:payment-reconciliation',true,false,0,60,600,2.0,0,'none',array[]::text[],'Payment failures require reconciliation.'),
 ('review_refunded_project','manual:refund-reconciliation',true,false,0,60,600,2.0,0,'none',array[]::text[],'Refunds are never replayed automatically.')
on conflict(action_type) do update set executor_path=excluded.executor_path,enabled=excluded.enabled,auto_retry=excluded.auto_retry,max_attempts=excluded.max_attempts,base_delay_seconds=excluded.base_delay_seconds,max_delay_seconds=excluded.max_delay_seconds,backoff_multiplier=excluded.backoff_multiplier,jitter_percent=excluded.jitter_percent,reset_strategy=excluded.reset_strategy,non_retryable_error_patterns=excluded.non_retryable_error_patterns,notes=excluded.notes,updated_at=now();

do $$
declare v_secret text;
begin
  select secret_value into v_secret from public.integration_secrets where key='retry_engine_worker_secret';
  if v_secret is null then
    v_secret:=encode(gen_random_bytes(32),'hex');
    insert into public.integration_secrets(key,secret_value,created_at,updated_at) values('retry_engine_worker_secret',v_secret,now(),now())
    on conflict(key) do update set secret_value=excluded.secret_value,updated_at=now();
  end if;
  if not exists(select 1 from vault.decrypted_secrets where name='bonebrake_retry_engine_worker_secret') then
    perform vault.create_secret(v_secret,'bonebrake_retry_engine_worker_secret','Bonebrake Phase 14 retry engine worker credential');
  end if;
end $$;

update public.automation_settings set retry_engine_enabled=true,auto_retry_enabled=true,retry_interval_minutes=1,updated_at=now() where key='global';