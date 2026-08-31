create or replace function public.lead_workflow_trigger()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if old.status is distinct from new.status then
    insert into public.activity(entity_type, entity_id, action, detail)
    values ('lead', new.id, 'status_changed', jsonb_build_object('from',old.status,'to',new.status));
  end if;

  if new.status = 'won'
     and old.status is distinct from 'won'
     and coalesce(new.next_action,'') <> 'paid_client_onboarding' then
    if not exists (select 1 from public.projects p where p.lead_id = new.id) then
      insert into public.projects(lead_id, client_name, status, project_type, agreed_price, balance, notes)
      values (new.id, coalesce(nullif(new.company,''), new.name), 'planning', null, coalesce(new.estimated_value,0), coalesce(new.estimated_value,0), 'Created automatically when lead moved to WON.');
      insert into public.activity(entity_type, entity_id, action, detail)
      values ('lead', new.id, 'project_created_from_won_lead', jsonb_build_object('estimated_value',new.estimated_value));
    end if;
  end if;
  return new;
end;
$function$;
