create schema if not exists internal;
revoke all on schema internal from public;

create or replace function internal.phase14_activate_project_release(p_release_id uuid,p_domain_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_release public.project_release_candidates%rowtype;v_project public.projects%rowtype;v_domain public.project_site_domains%rowtype;v_artifact public.project_generated_artifacts%rowtype;v_job public.project_fulfillment_jobs%rowtype;v_settings public.automation_settings%rowtype;v_previous uuid;v_now timestamptz:=now();
begin
 select * into v_settings from public.automation_settings where key='global';
 if not found or not v_settings.autopilot_enabled or not v_settings.fulfillment_enabled or not v_settings.production_deploy_enabled then raise exception 'production_automation_disabled'; end if;
 select * into v_release from public.project_release_candidates where id=p_release_id for update;
 if not found or v_release.status<>'release_ready' or v_release.qa_passed is not true or v_release.payment_verified_at is null or v_release.client_approved_at is null or v_release.owner_approved_at is null or v_release.release_ready_at is null then raise exception 'release_not_ready'; end if;
 select * into v_project from public.projects where id=v_release.project_id for update;
 if not found or v_project.status='cancelled' or v_project.payment_state<>'paid' or v_project.paid_amount<v_project.agreed_price then raise exception 'paid_active_project_required'; end if;
 select * into v_domain from public.project_site_domains where id=p_domain_id and project_id=v_project.id for update;
 if not found or v_domain.is_primary is not true or v_domain.status not in ('verified','active') or v_domain.ssl_status<>'ready' then raise exception 'verified_primary_domain_required'; end if;
 select * into v_artifact from public.project_generated_artifacts where id=v_release.artifact_id and project_id=v_project.id;
 if not found or v_artifact.status<>'approved' then raise exception 'approved_artifact_required'; end if;
 select * into v_job from public.project_fulfillment_jobs where id=v_release.fulfillment_job_id and project_id=v_project.id for update;
 if not found or coalesce((v_job.qa_report->>'passed')::boolean,false) is not true then raise exception 'qa_pass_required'; end if;
 if exists(select 1 from public.project_revision_requests where project_id=v_project.id and status in ('pending','approved','processing')) then raise exception 'revision_still_open'; end if;
 select id into v_previous from public.project_release_candidates where project_id=v_project.id and is_active=true and id<>v_release.id for update;
 if v_previous is not null then update public.project_release_candidates set is_active=false,deactivated_at=v_now,updated_at=v_now where id=v_previous; end if;
 update public.project_release_candidates set status='deployed',is_active=true,activated_at=v_now,deactivated_at=null,previous_release_id=v_previous,production_deployed_at=v_now,deployment_url='https://'||v_domain.hostname,deployment_health=jsonb_build_object('status','pending_smoke_test','activated_at',v_now),failure_code=null,failure_message=null,updated_at=v_now where id=v_release.id;
 update public.project_site_domains set status='active',last_checked_at=v_now,failure_code=null,failure_message=null,updated_at=v_now where id=v_domain.id;
 update public.project_fulfillment_jobs set status='completed',completed_at=coalesce(completed_at,v_now),updated_at=v_now where id=v_job.id;
 update public.projects set status='complete',domain_status='complete',content_status='complete',revision_status='approved',current_milestone='live',next_action='monitor_production',updated_at=v_now where id=v_project.id;
 insert into public.activity(entity_type,entity_id,action,detail) values('project',v_project.id,'production_release_activated',jsonb_build_object('release_candidate_id',v_release.id,'artifact_id',v_artifact.id,'domain',v_domain.hostname,'previous_release_id',v_previous));
 return jsonb_build_object('project_id',v_project.id,'release_candidate_id',v_release.id,'artifact_id',v_artifact.id,'domain_id',v_domain.id,'deployment_url','https://'||v_domain.hostname,'previous_release_id',v_previous,'activated_at',v_now);
end$$;
revoke all on function internal.phase14_activate_project_release(uuid,uuid) from public,anon,authenticated;
grant usage on schema internal to service_role;
grant execute on function internal.phase14_activate_project_release(uuid,uuid) to service_role;

create or replace function public.phase14_activate_project_release(p_release_id uuid,p_domain_id uuid) returns jsonb language sql security invoker set search_path=public,pg_temp as $$select internal.phase14_activate_project_release(p_release_id,p_domain_id)$$;
revoke all on function public.phase14_activate_project_release(uuid,uuid) from public,anon,authenticated;
grant execute on function public.phase14_activate_project_release(uuid,uuid) to service_role;

create or replace function internal.phase14_revert_project_activation(p_release_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_release public.project_release_candidates%rowtype;v_previous public.project_release_candidates%rowtype;v_domain public.project_site_domains%rowtype;v_now timestamptz:=now();v_reason text:=left(coalesce(p_reason,'production_smoke_failed'),500);
begin
 select * into v_release from public.project_release_candidates where id=p_release_id for update;
 if not found or v_release.is_active is not true then raise exception 'active_release_required'; end if;
 select * into v_domain from public.project_site_domains where project_id=v_release.project_id and is_primary=true and status='active' for update;
 update public.project_release_candidates set is_active=false,status='failed',deactivated_at=v_now,failure_code='production_smoke_failed',failure_message=v_reason,deployment_health=jsonb_build_object('status','failed','reason',v_reason,'failed_at',v_now),updated_at=v_now where id=v_release.id;
 if v_release.previous_release_id is not null then
  select * into v_previous from public.project_release_candidates where id=v_release.previous_release_id and project_id=v_release.project_id for update;
  if found then
   update public.project_release_candidates set status='deployed',is_active=true,deactivated_at=null,deployment_health=jsonb_build_object('status','restored_after_failed_release','restored_at',v_now),updated_at=v_now where id=v_previous.id;
   if v_domain.id is not null then update public.project_site_domains set status='active',updated_at=v_now where id=v_domain.id; end if;
   update public.projects set status='complete',current_milestone='live_rollback_restored',next_action='investigate_failed_release',updated_at=v_now where id=v_release.project_id;
   insert into public.activity(entity_type,entity_id,action,detail) values('project',v_release.project_id,'production_release_rolled_back',jsonb_build_object('failed_release_id',v_release.id,'restored_release_id',v_previous.id,'reason',v_reason));
   return jsonb_build_object('rolled_back',true,'restored_release_id',v_previous.id,'failed_release_id',v_release.id);
  end if;
 end if;
 if v_domain.id is not null then update public.project_site_domains set status='verified',updated_at=v_now where id=v_domain.id; end if;
 update public.projects set status='launch_ready',domain_status='ready',current_milestone='release_failed',next_action='investigate_failed_release',updated_at=v_now where id=v_release.project_id;
 insert into public.activity(entity_type,entity_id,action,detail) values('project',v_release.project_id,'production_release_failed_no_previous',jsonb_build_object('failed_release_id',v_release.id,'reason',v_reason));
 return jsonb_build_object('rolled_back',true,'restored_release_id',null,'failed_release_id',v_release.id);
end$$;
revoke all on function internal.phase14_revert_project_activation(uuid,text) from public,anon,authenticated;
grant execute on function internal.phase14_revert_project_activation(uuid,text) to service_role;
create or replace function public.phase14_revert_project_activation(p_release_id uuid,p_reason text) returns jsonb language sql security invoker set search_path=public,pg_temp as $$select internal.phase14_revert_project_activation(p_release_id,p_reason)$$;
revoke all on function public.phase14_revert_project_activation(uuid,text) from public,anon,authenticated;
grant execute on function public.phase14_revert_project_activation(uuid,text) to service_role;