create table if not exists public.executive_brief_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_date date not null unique,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  trigger_source text not null default 'owner_refresh' check (trigger_source in ('scheduled','owner_refresh','certification')),
  attention_level text not null default 'normal' check (attention_level in ('normal','watch','action','critical')),
  headline text not null default '',
  payload jsonb not null default '{}'::jsonb,
  generation_ms integer not null default 0 check (generation_ms >= 0)
);

create index if not exists executive_brief_generated_idx on public.executive_brief_snapshots(generated_at desc);
create index if not exists executive_brief_attention_idx on public.executive_brief_snapshots(attention_level,business_date desc);

alter table public.executive_brief_snapshots enable row level security;
revoke all on public.executive_brief_snapshots from anon;
grant select,insert,update,delete on public.executive_brief_snapshots to authenticated;
drop policy if exists owner_all_executive_brief_snapshots on public.executive_brief_snapshots;
create policy owner_all_executive_brief_snapshots on public.executive_brief_snapshots for all to authenticated
  using ((select lower(auth.jwt()->>'email'))='bonebrakewebsitedesign@gmail.com')
  with check ((select lower(auth.jwt()->>'email'))='bonebrakewebsitedesign@gmail.com');

alter table public.automation_settings
  add column if not exists executive_brief_enabled boolean not null default true,
  add column if not exists executive_brief_timezone text not null default 'America/Chicago',
  add column if not exists executive_brief_hour smallint not null default 8;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='automation_settings_executive_brief_hour_check') then
    alter table public.automation_settings add constraint automation_settings_executive_brief_hour_check check (executive_brief_hour between 0 and 23);
  end if;
end $$;

do $$
declare
  s text;
  existing text;
begin
  select secret_value into existing from public.integration_secrets where key='executive_brief_worker_secret';
  if existing is null then
    s := encode(gen_random_bytes(32),'hex');
    insert into public.integration_secrets(key,secret_value) values ('executive_brief_worker_secret',s)
      on conflict (key) do update set secret_value=excluded.secret_value,updated_at=now();
  else
    s := existing;
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name='bonebrake_executive_brief_worker_secret') then
    perform vault.create_secret(s,'bonebrake_executive_brief_worker_secret','Bonebrake scheduled executive brief worker credential',null);
  end if;
end $$;

update public.automation_settings
set executive_brief_enabled=true,
    executive_brief_timezone='America/Chicago',
    executive_brief_hour=8,
    updated_at=now()
where key='global';