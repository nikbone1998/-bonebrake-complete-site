do $$
declare j bigint;
begin
  select jobid into j from cron.job where jobname='bonebrake-domain-onboarding-15m';
  if j is not null then perform cron.unschedule(j); end if;
end $$;

select cron.schedule(
  'bonebrake-domain-onboarding-15m',
  '*/15 * * * *',
  $$select net.http_post(
      url:='https://usurytofnhhfxxipngdd.supabase.co/functions/v1/domain-onboarding',
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'x-bonebrake-domain-key',(select decrypted_secret from vault.decrypted_secrets where name='bonebrake_domain_onboarding_worker_secret' limit 1)
      ),
      body:='{"action":"sweep"}'::jsonb,
      timeout_milliseconds:=45000
    );$$
);