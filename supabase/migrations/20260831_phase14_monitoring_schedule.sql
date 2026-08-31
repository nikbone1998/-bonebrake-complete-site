do $$
declare
  j bigint;
begin
  for j in select jobid from cron.job where jobname='bonebrake-monitoring-5m' loop
    perform cron.unschedule(j);
  end loop;
end $$;

select cron.schedule(
  'bonebrake-monitoring-5m',
  '*/5 * * * *',
  $cmd$
  select net.http_post(
    url:='https://usurytofnhhfxxipngdd.supabase.co/functions/v1/monitoring-run',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-bonebrake-monitor-key',(
        select decrypted_secret
        from vault.decrypted_secrets
        where name='bonebrake_monitor_worker_secret'
        limit 1
      )
    ),
    body:='{"trigger_source":"cron"}'::jsonb,
    timeout_milliseconds:=30000
  );
  $cmd$
);

update public.automation_settings
set monitoring_enabled=true,
    auto_recovery_enabled=true,
    monitoring_interval_minutes=5,
    updated_at=now()
where key='global';