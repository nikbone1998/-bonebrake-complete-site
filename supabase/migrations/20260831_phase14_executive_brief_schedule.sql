do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname='bonebrake-executive-brief-hourly' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'bonebrake-executive-brief-hourly',
  '7 * * * *',
  $$
  select net.http_post(
    url := 'https://usurytofnhhfxxipngdd.supabase.co/functions/v1/executive-brief',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-bonebrake-brief-key',(select decrypted_secret from vault.decrypted_secrets where name='bonebrake_executive_brief_worker_secret' limit 1)
    ),
    body := '{"trigger_source":"scheduled"}'::jsonb
  );
  $$
);