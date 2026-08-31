create table if not exists public.prospect_preview_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  prospect_candidate_id uuid references public.prospect_candidates(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','generating','generated','qa','ready_for_review','approved','failed','cancelled')),
  source_url text,
  normalized_domain text,
  generation_profile text not null default 'local_service_v1',
  content_snapshot jsonb not null default '{}'::jsonb,
  build_spec jsonb not null default '{}'::jsonb,
  repository text,
  branch_name text,
  preview_url text,
  qa_report jsonb not null default '{}'::jsonb,
  qa_status text not null default 'not_started' check (qa_status in ('not_started','running','passed','failed','needs_review')),
  error_message text,
  generated_at timestamptz,
  qa_completed_at timestamptz,
  approved_at timestamptz
);

alter table public.prospect_preview_jobs enable row level security;
drop policy if exists owner_all_prospect_preview_jobs on public.prospect_preview_jobs;
create policy owner_all_prospect_preview_jobs on public.prospect_preview_jobs
for all
using (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com')
with check (lower(coalesce((select auth.jwt())->>'email',''))='bonebrakewebsitedesign@gmail.com');

create index if not exists prospect_preview_jobs_status_idx on public.prospect_preview_jobs(status,created_at desc);
create index if not exists prospect_preview_jobs_lead_idx on public.prospect_preview_jobs(lead_id);
create unique index if not exists prospect_preview_jobs_active_candidate_unique
  on public.prospect_preview_jobs(prospect_candidate_id)
  where prospect_candidate_id is not null and status in ('queued','generating','generated','qa','ready_for_review','approved');

drop view if exists public.prospect_ready_for_preview;
create view public.prospect_ready_for_preview with (security_invoker=true) as
select p.id as candidate_id,p.lead_id,p.company_name,p.website,p.normalized_domain,p.contact_name,p.email,p.phone,p.industry,p.city,p.region,p.source_system,p.discovery_score,p.qualification_tier,l.opportunity_score as crm_opportunity_score,l.status as lead_status,l.next_action
from public.prospect_candidates p
join public.leads l on l.id=p.lead_id
where l.status='qualified'
  and l.next_action='prepare_preview'
  and p.lead_id is not null
  and not exists (
    select 1 from public.prospect_preview_jobs j
    where j.prospect_candidate_id=p.id
      and j.status in ('queued','generating','generated','qa','ready_for_review','approved')
  );

create or replace function public.phase14_queue_ready_previews(p_limit integer default 10)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  job_id uuid;
  queued integer := 0;
begin
  if p_limit is null or p_limit < 1 then return 0; end if;
  for r in select * from public.prospect_ready_for_preview order by crm_opportunity_score desc nulls last limit least(p_limit,50)
  loop
    insert into public.prospect_preview_jobs(prospect_candidate_id,lead_id,status,source_url,normalized_domain,content_snapshot,build_spec)
    values(
      r.candidate_id,r.lead_id,'queued',r.website,r.normalized_domain,
      jsonb_build_object('company_name',r.company_name,'contact_name',r.contact_name,'email',r.email,'phone',r.phone,'industry',r.industry,'city',r.city,'region',r.region),
      jsonb_build_object('profile','local_service_v1','source_system',r.source_system,'discovery_score',r.discovery_score,'qualification_tier',r.qualification_tier,'crm_opportunity_score',r.crm_opportunity_score)
    ) returning id into job_id;

    insert into public.automation_actions(action_type,entity_type,entity_id,title,summary,risk_level,status,payload,proposed_by)
    values(
      'build_prospect_preview','prospect_preview_job',job_id,
      'Build preview for '||r.company_name,
      'Qualified sales lead · prepare personalized website preview',
      'approval','pending',
      jsonb_build_object('preview_job_id',job_id,'candidate_id',r.candidate_id,'lead_id',r.lead_id,'company_name',r.company_name,'website',r.website,'generation_profile','local_service_v1','external_effect','preview_generation_only'),
      'preview_factory'
    );
    queued := queued + 1;
  end loop;
  return queued;
end $$;

revoke all on function public.phase14_queue_ready_previews(integer) from public;
revoke all on function public.phase14_queue_ready_previews(integer) from anon;
grant execute on function public.phase14_queue_ready_previews(integer) to authenticated;
