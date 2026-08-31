create extension if not exists pg_cron;

alter table public.automation_settings
  add column if not exists monitoring_enabled boolean not null default false,
  add column if not exists auto_recovery_enabled boolean not null default false,
  add column if not exists monitoring_interval_minutes integer not null default 5;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='automation_settings_monitor_interval_check') then
    alter table public.automation_settings add constraint automation_settings_monitor_interval_check check (monitoring_interval_minutes between 1 and 60);
  end if;
end $$;

create table if not exists public.automation_monitor_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  trigger_source text not null default 'cron' check (trigger_source in ('cron','manual','certification')),
  status text not null default 'running' check (status in ('running','completed','partial','failed','skipped')),
  checks_run integer not null default 0,
  incidents_seen integer not null default 0,
  recoveries_attempted integer not null default 0,
  recoveries_succeeded integer not null default 0,
  escalations_created integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  error_message text
);

create table if not exists public.automation_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  category text not null check (category in ('system','payment','automation','fulfillment','production','domain','security')),
  severity text not null check (severity in ('info','warning','error','critical')),
  status text not null default 'open' check (status in ('open','retrying','escalated','resolved','ignored')),
  entity_type text,
  entity_id uuid,
  title text not null,
  detail text,
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  auto_recoverable boolean not null default false,
  recovery_strategy text not null default 'none' check (recovery_strategy in ('none','unlock','reset_retryable','rollback','escalate')),
  recovery_attempts integer not null default 0 check (recovery_attempts >= 0),
  max_auto_attempts integer not null default 0 check (max_auto_attempts between 0 and 10),
  next_retry_at timestamptz,
  escalation_action_id uuid references public.automation_actions(id) on delete set null,
  last_payload jsonb not null default '{}'::jsonb,
  resolved_reason text
);

create table if not exists public.automation_recovery_attempts (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.automation_incidents(id) on delete cascade,
  monitor_run_id uuid references public.automation_monitor_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  strategy text not null check (strategy in ('unlock','reset_retryable','rollback','escalate')),
  status text not null default 'executing' check (status in ('queued','executing','completed','failed','skipped')),
  result jsonb not null default '{}'::jsonb,
  error_message text
);

create index if not exists automation_monitor_runs_started_idx on public.automation_monitor_runs(started_at desc);
create index if not exists automation_incidents_status_severity_idx on public.automation_incidents(status,severity,last_seen_at desc);
create index if not exists automation_incidents_entity_idx on public.automation_incidents(entity_type,entity_id) where entity_id is not null;
create index if not exists automation_incidents_retry_idx on public.automation_incidents(next_retry_at) where status in ('open','retrying');
create index if not exists automation_recovery_attempts_incident_idx on public.automation_recovery_attempts(incident_id,created_at desc);
create index if not exists automation_recovery_attempts_run_idx on public.automation_recovery_attempts(monitor_run_id) where monitor_run_id is not null;

alter table public.automation_monitor_runs enable row level security;
alter table public.automation_incidents enable row level security;
alter table public.automation_recovery_attempts enable row level security;

revoke all on public.automation_monitor_runs from anon;
revoke all on public.automation_incidents from anon;
revoke all on public.automation_recovery_attempts from anon;

grant select,insert,update,delete on public.automation_monitor_runs to authenticated;
grant select,insert,update,delete on public.automation_incidents to authenticated;
grant select,insert,update,delete on public.automation_recovery_attempts to authenticated;

drop policy if exists owner_all_automation_monitor_runs on public.automation_monitor_runs;
create policy owner_all_automation_monitor_runs on public.automation_monitor_runs for all to authenticated
  using ((select lower(auth.jwt()->>'email'))='bonebrakewebsitedesign@gmail.com')
  with check ((select lower(auth.jwt()->>'email'))='bonebrakewebsitedesign@gmail.com');

drop policy if exists owner_all_automation_incidents on public.automation_incidents;
create policy owner_all_automation_incidents on public.automation_incidents for all to authenticated
  using ((select lower(auth.jwt()->>'email'))='bonebrakewebsitedesign@gmail.com')
  with check ((select lower(auth.jwt()->>'email'))='bonebrakewebsitedesign@gmail.com');

drop policy if exists owner_all_automation_recovery_attempts on public.automation_recovery_attempts;
create policy owner_all_automation_recovery_attempts on public.automation_recovery_attempts for all to authenticated
  using ((select lower(auth.jwt()->>'email'))='bonebrakewebsitedesign@gmail.com')
  with check ((select lower(auth.jwt()->>'email'))='bonebrakewebsitedesign@gmail.com');

do $$
declare
  s text;
  existing text;
begin
  select secret_value into existing from public.integration_secrets where key='monitor_worker_secret';
  if existing is null then
    s := encode(gen_random_bytes(32),'hex');
    insert into public.integration_secrets(key,secret_value) values ('monitor_worker_secret',s)
      on conflict (key) do update set secret_value=excluded.secret_value,updated_at=now();
  else
    s := existing;
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name='bonebrake_monitor_worker_secret') then
    perform vault.create_secret(s,'bonebrake_monitor_worker_secret','Bonebrake scheduled monitoring worker credential',null);
  end if;
end $$;

update public.automation_settings
set monitoring_interval_minutes=5, updated_at=now()
where key='global';