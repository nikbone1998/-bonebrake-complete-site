create schema if not exists internal;

create or replace function internal.phase14_invoke_retry_worker(p_trigger text default 'cron')
returns bigint
language plpgsql
security definer
set search_path=pg_catalog,public,vault,net
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='bonebrake_retry_engine_worker_secret' limit 1;
  if v_secret is null then raise exception 'retry_worker_secret_unavailable'; end if;
  select net.http_post(
    url:='https://usurytofnhhfxxipngdd.supabase.co/functions/v1/retry-run',
    headers:=jsonb_build_object('Content-Type','application/json','x-bonebrake-retry-key',v_secret),
    body:=jsonb_build_object('trigger_source',coalesce(nullif(p_trigger,''),'cron'))
  ) into v_request_id;
  return v_request_id;
end $$;
revoke all on function internal.phase14_invoke_retry_worker(text) from public,anon,authenticated;
grant execute on function internal.phase14_invoke_retry_worker(text) to service_role;

do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname='bonebrake-retry-engine-1m';
exception when others then null; end $$;
select cron.schedule('bonebrake-retry-engine-1m','* * * * *',$$select internal.phase14_invoke_retry_worker('cron');$$);