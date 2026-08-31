alter table public.project_site_domains
  add column if not exists dns_requirements jsonb not null default '[]'::jsonb,
  add column if not exists dns_instructions_authoritative boolean not null default false;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='project_site_domains_dns_requirements_array_check') then
    alter table public.project_site_domains add constraint project_site_domains_dns_requirements_array_check check (jsonb_typeof(dns_requirements)='array');
  end if;
end $$;

create or replace function internal.phase14_apply_vercel_domain_state(
  p_domain_id uuid,
  p_host_status text,
  p_verified boolean,
  p_dns_requirements jsonb,
  p_vercel_response jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.project_site_domains%rowtype; stamp timestamptz:=now(); req jsonb:=coalesce(p_dns_requirements,'[]'::jsonb); first_req jsonb;
begin
  if p_host_status not in ('attached','verification_required','error') then raise exception 'invalid_host_status'; end if;
  if jsonb_typeof(req)<>'array' then raise exception 'dns_requirements_array_required'; end if;
  select * into d from public.project_site_domains where id=p_domain_id for update;
  if not found then raise exception 'domain_not_found'; end if;
  first_req:=case when jsonb_array_length(req)>0 then req->0 else null end;
  update public.project_site_domains set
    host_status=p_host_status,
    host_verified_at=case when p_verified then coalesce(host_verified_at,stamp) else host_verified_at end,
    added_to_host_at=case when p_host_status in ('attached','verification_required') then coalesce(added_to_host_at,stamp) else added_to_host_at end,
    dns_requirements=req,
    dns_instructions_authoritative=(jsonb_array_length(req)>0),
    dns_record_type=coalesce(first_req->>'type',dns_record_type),
    dns_record_name=coalesce(first_req->>'name',dns_record_name),
    dns_record_value=coalesce(first_req->>'value',dns_record_value),
    verification_data=coalesce(verification_data,'{}'::jsonb)||jsonb_build_object('vercel',coalesce(p_vercel_response,'{}'::jsonb),'vercel_verified',p_verified,'authoritative_dns_received_at',stamp),
    status=case when p_host_status='error' then 'error' when jsonb_array_length(req)>0 then 'awaiting_dns' else 'pending' end,
    ssl_status=case when p_host_status='error' then 'error' else 'pending' end,
    failure_code=case when p_host_status='error' then 'vercel_domain_attachment_failed' else null end,
    failure_message=case when p_host_status='error' then left(coalesce(p_vercel_response->>'error','Vercel domain attachment failed'),1000) else null end,
    updated_at=stamp
  where id=p_domain_id;
  insert into public.domain_onboarding_events(domain_id,project_id,event_type,source,detail)
  values(d.id,d.project_id,'vercel_domain_state_applied','vercel',jsonb_build_object('host_status',p_host_status,'verified',p_verified,'dns_requirements',req));
  return jsonb_build_object('domain_id',d.id,'project_id',d.project_id,'host_status',p_host_status,'verified',p_verified,'dns_requirements',req);
end $$;
revoke all on function internal.phase14_apply_vercel_domain_state(uuid,text,boolean,jsonb,jsonb) from public,anon,authenticated;
grant usage on schema internal to service_role;
grant execute on function internal.phase14_apply_vercel_domain_state(uuid,text,boolean,jsonb,jsonb) to service_role;

create or replace function public.phase14_apply_vercel_domain_state(
  p_domain_id uuid,
  p_host_status text,
  p_verified boolean,
  p_dns_requirements jsonb,
  p_vercel_response jsonb default '{}'::jsonb
) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
  select internal.phase14_apply_vercel_domain_state(p_domain_id,p_host_status,p_verified,p_dns_requirements,p_vercel_response)
$$;
revoke all on function public.phase14_apply_vercel_domain_state(uuid,text,boolean,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.phase14_apply_vercel_domain_state(uuid,text,boolean,jsonb,jsonb) to service_role;