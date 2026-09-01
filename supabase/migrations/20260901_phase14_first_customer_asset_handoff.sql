create table if not exists public.client_project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  intake_request_id uuid references public.client_intake_requests(id) on delete set null,
  storage_bucket text not null default 'client-project-assets',
  storage_path text not null unique,
  asset_token text not null unique,
  asset_kind text not null check (asset_kind in ('logo','photo')),
  original_filename text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 5242880),
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_project_assets_project_idx
  on public.client_project_assets(project_id, status, created_at);

alter table public.client_project_assets enable row level security;
revoke all privileges on table public.client_project_assets from public, anon, authenticated;
grant select, insert, update, delete on table public.client_project_assets to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'client-project-assets',
  'client-project-assets',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
