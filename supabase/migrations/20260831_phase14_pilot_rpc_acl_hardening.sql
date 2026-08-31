revoke execute on function public.phase14_claim_pilot_checkout(uuid,text) from public,anon,authenticated;
revoke execute on function public.phase14_bind_pilot_project(uuid,text,uuid) from public,anon,authenticated;
revoke execute on function public.phase14_activate_single_customer_pilot(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.phase14_halt_single_customer_pilot(uuid,text) from public,anon,authenticated;

grant execute on function public.phase14_claim_pilot_checkout(uuid,text) to service_role;
grant execute on function public.phase14_bind_pilot_project(uuid,text,uuid) to service_role;
grant execute on function public.phase14_activate_single_customer_pilot(uuid,uuid) to service_role;
grant execute on function public.phase14_halt_single_customer_pilot(uuid,text) to service_role;
