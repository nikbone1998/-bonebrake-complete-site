create unique index if not exists automation_actions_active_entity_unique
  on public.automation_actions (action_type, entity_type, entity_id)
  where entity_id is not null and status in ('pending','approved');

create or replace function public.phase14_queue_ready_prospect_audits(p_limit integer default 25)
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
    action_type, entity_type, entity_id, title, summary,
    risk_level, status, payload, proposed_by
  )
  select
    'run_prospect_audit',
    'prospect_candidate',
    p.id,
    'Audit ' || p.company_name,
    'Tier ' || p.qualification_tier || ' prospect · discovery score ' || p.discovery_score,
    'approval',
    'pending',
    jsonb_build_object(
      'candidate_id', p.id,
      'company_name', p.company_name,
      'website', p.website,
      'normalized_domain', p.normalized_domain,
      'discovery_score', p.discovery_score,
      'qualification_tier', p.qualification_tier,
      'source_system', p.source_system,
      'external_effect', 'website_audit'
    ),
    'prospect_qualification_engine'
  from public.prospect_ready_for_audit p
  where not exists (
    select 1 from public.automation_actions a
    where a.action_type='run_prospect_audit'
      and a.entity_type='prospect_candidate'
      and a.entity_id=p.id
      and a.status in ('pending','approved')
  )
  order by p.discovery_score desc, p.created_at asc
  limit least(p_limit,100);

  get diagnostics queued = row_count;
  return queued;
end $$;

revoke all on function public.phase14_queue_ready_prospect_audits(integer) from public;
revoke all on function public.phase14_queue_ready_prospect_audits(integer) from anon;
grant execute on function public.phase14_queue_ready_prospect_audits(integer) to authenticated;
