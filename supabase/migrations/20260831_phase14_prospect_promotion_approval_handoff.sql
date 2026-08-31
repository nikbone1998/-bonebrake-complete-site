drop view if exists public.prospect_ready_for_promotion;
create view public.prospect_ready_for_promotion with (security_invoker=true) as
select p.id as candidate_id,p.company_name,p.website,p.normalized_domain,p.contact_name,p.email,p.phone,p.source_system,p.discovery_score,p.qualification_tier,p.audit_id,a.opportunity_score as audit_opportunity_score,
  round((p.discovery_score + coalesce(a.opportunity_score,0))::numeric / 2)::int as combined_score
from public.prospect_candidates p
join public.audits a on a.id=p.audit_id and a.status='complete'
where p.lead_id is null
  and p.qualification_tier in ('A','B')
  and p.email is not null
  and coalesce(a.opportunity_score,0) >= 55
  and round((p.discovery_score + coalesce(a.opportunity_score,0))::numeric / 2)::int >= 60;

create or replace function public.phase14_queue_ready_prospect_promotions(p_limit integer default 25)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  queued integer := 0;
begin
  if p_limit is null or p_limit < 1 then return 0; end if;

  insert into public.automation_actions(
    action_type,entity_type,entity_id,title,summary,risk_level,status,payload,proposed_by
  )
  select
    'promote_prospect_to_crm',
    'prospect_candidate',
    p.candidate_id,
    'Promote ' || p.company_name || ' to sales lead',
    'Audit passed · combined score ' || p.combined_score || ' · Tier ' || p.qualification_tier,
    'approval','pending',
    jsonb_build_object(
      'candidate_id',p.candidate_id,
      'company_name',p.company_name,
      'website',p.website,
      'contact_name',p.contact_name,
      'email',p.email,
      'phone',p.phone,
      'source_system',p.source_system,
      'discovery_score',p.discovery_score,
      'audit_opportunity_score',p.audit_opportunity_score,
      'combined_score',p.combined_score,
      'qualification_tier',p.qualification_tier,
      'external_effect','crm_promotion_only'
    ),
    'prospect_qualification_engine'
  from public.prospect_ready_for_promotion p
  where not exists (
    select 1 from public.automation_actions a
    where a.action_type='promote_prospect_to_crm'
      and a.entity_type='prospect_candidate'
      and a.entity_id=p.candidate_id
      and a.status in ('pending','approved')
  )
  order by p.combined_score desc
  limit least(p_limit,100);

  get diagnostics queued = row_count;
  return queued;
end $$;

revoke all on function public.phase14_queue_ready_prospect_promotions(integer) from public;
revoke all on function public.phase14_queue_ready_prospect_promotions(integer) from anon;
grant execute on function public.phase14_queue_ready_prospect_promotions(integer) to authenticated;
