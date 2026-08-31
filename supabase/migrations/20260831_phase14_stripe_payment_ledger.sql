-- Phase 14 Bonebrake Autopilot: Stripe payment ledger and package mapping.
-- Live payment-link URLs and webhook signing secrets are intentionally NOT stored in this public repository.

create table if not exists public.stripe_catalog (
  package_key text primary key,
  product_name text not null,
  stripe_product_id text not null unique,
  stripe_price_id text not null unique,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd',
  payment_link_id text unique,
  payment_link_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text unique,
  stripe_customer_id text,
  stripe_payment_link_id text,
  package_key text not null references public.stripe_catalog(package_key),
  lead_id uuid references public.leads(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  customer_email text,
  customer_name text,
  customer_phone text,
  company text,
  website text,
  amount_total integer not null default 0 check (amount_total >= 0),
  currency text not null default 'usd',
  checkout_status text not null default 'complete' check (checkout_status in ('open','complete','expired')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','no_payment_required')),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.stripe_payment_events (
  stripe_event_id text primary key,
  event_type text not null,
  object_id text,
  livemode boolean not null default true,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received','processing','processed','ignored','failed')),
  error_message text,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.integration_secrets (
  key text primary key,
  secret_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stripe_checkout_sessions add column if not exists customer_phone text;
alter table public.stripe_checkout_sessions add column if not exists website text;

alter table public.stripe_payment_events drop constraint if exists stripe_payment_events_status_check;
alter table public.stripe_payment_events add constraint stripe_payment_events_status_check
  check (status in ('received','processing','processed','ignored','failed'));

alter table public.stripe_catalog enable row level security;
alter table public.stripe_checkout_sessions enable row level security;
alter table public.stripe_payment_events enable row level security;
alter table public.integration_secrets enable row level security;

drop policy if exists owner_read_stripe_catalog on public.stripe_catalog;
create policy owner_read_stripe_catalog on public.stripe_catalog for select to authenticated
using (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com');

drop policy if exists owner_read_stripe_checkout_sessions on public.stripe_checkout_sessions;
create policy owner_read_stripe_checkout_sessions on public.stripe_checkout_sessions for select to authenticated
using (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com');

drop policy if exists owner_read_stripe_payment_events on public.stripe_payment_events;
create policy owner_read_stripe_payment_events on public.stripe_payment_events for select to authenticated
using (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com');

revoke all on public.integration_secrets from anon, authenticated;
revoke insert, update, delete on public.stripe_catalog from anon, authenticated;
revoke insert, update, delete on public.stripe_checkout_sessions from anon, authenticated;
revoke insert, update, delete on public.stripe_payment_events from anon, authenticated;

create index if not exists stripe_checkout_sessions_package_idx on public.stripe_checkout_sessions(package_key);
create index if not exists stripe_checkout_sessions_lead_idx on public.stripe_checkout_sessions(lead_id);
create index if not exists stripe_checkout_sessions_project_idx on public.stripe_checkout_sessions(project_id);
create index if not exists stripe_checkout_sessions_payment_status_idx on public.stripe_checkout_sessions(payment_status, completed_at desc);
create index if not exists stripe_payment_events_status_idx on public.stripe_payment_events(status, received_at desc);

insert into public.stripe_catalog(package_key,product_name,stripe_product_id,stripe_price_id,amount_cents,currency,payment_link_id)
values
  ('website_rebuild','Bonebrake Website Rebuild','prod_VAwH44Gcmpls3t','price_1UAaOjBhmu69OYtbTRN2UM5S',199500,'usd','plink_1UAaTPBhmu69OYtbdSLYKp7k'),
  ('website_rebuild_pro','Bonebrake Website Rebuild Pro','prod_VAwHN5StD96gw7','price_1UAaOpBhmu69OYtb71Q5swdH',299500,'usd','plink_1UAaTVBhmu69OYtbeQZpZLVe')
on conflict (package_key) do update set
  product_name=excluded.product_name,
  stripe_product_id=excluded.stripe_product_id,
  stripe_price_id=excluded.stripe_price_id,
  amount_cents=excluded.amount_cents,
  currency=excluded.currency,
  payment_link_id=excluded.payment_link_id,
  updated_at=now();