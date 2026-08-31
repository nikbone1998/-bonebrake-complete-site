-- Phase 14 paid fulfillment hardening.
create index if not exists client_intake_lead_idx on public.client_intake_requests(lead_id);
create index if not exists project_fulfillment_lead_idx on public.project_fulfillment_jobs(lead_id);

drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;
