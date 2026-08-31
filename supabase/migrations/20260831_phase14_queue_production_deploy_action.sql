create or replace function public.phase14_queue_production_deploy_action()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_name text;
begin
 if new.status='release_ready' and old.status is distinct from new.status then
  select client_name into v_name from public.projects where id=new.project_id;
  if not exists(select 1 from public.automation_actions where action_type='deploy_paid_project_production' and entity_type='project' and entity_id=new.project_id and status in ('pending','approved','executing')) then
   insert into public.automation_actions(action_type,entity_type,entity_id,title,summary,risk_level,status,proposed_by,payload)
   values('deploy_paid_project_production','project',new.project_id,'Deploy production for '||coalesce(v_name,'paid client'),'Release passed payment, QA, client approval, and owner release approval. Production requires a verified SSL-ready primary domain, explicit owner deployment approval, and the Production Deployment switch.','approval','pending','release_gate',jsonb_build_object('project_id',new.project_id,'fulfillment_job_id',new.fulfillment_job_id,'artifact_id',new.artifact_id,'release_candidate_id',new.id,'external_effect','activate_verified_production_domain','requires_production_switch',true));
  end if;
 end if;
 return new;
end$$;
revoke all on function public.phase14_queue_production_deploy_action() from public,anon,authenticated;
drop trigger if exists phase14_queue_production_deploy_action on public.project_release_candidates;
create trigger phase14_queue_production_deploy_action after update of status on public.project_release_candidates for each row execute function public.phase14_queue_production_deploy_action();