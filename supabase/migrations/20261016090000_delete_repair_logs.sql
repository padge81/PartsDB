begin;

-- Explicit permission and revision checks; direct table writes remain revoked.
create function public.delete_repair_log(log_id uuid,expected_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare prior public.repair_logs;
begin
  if auth.uid() is null or not public.workshop_active_user() then raise exception 'Active sign-in required'; end if;
  if not public.is_write_enabled() then raise exception 'Standby is read only'; end if;
  if expected_revision is null or expected_revision<0 then raise exception 'Invalid revision'; end if;
  select * into prior from public.repair_logs where id=log_id for update;
  if not found then
    if expected_revision=0 then return; end if;
    raise exception 'Repair no longer exists or access is unavailable';
  end if;
  if prior.publication_status='approved' then
    if not public.is_admin() then raise exception 'Only an administrator can delete a shared repair'; end if;
  elsif not (prior.owner_id=auth.uid() or (public.is_admin() and prior.publication_status in ('pending','returned'))) then
    raise exception 'Repair not available';
  end if;
  if prior.revision<>expected_revision then raise exception 'This repair changed. Reload before deleting.'; end if;
  if prior.publication_status<>'private' then
    insert into public.audit_log(table_name,record_id,operation,actor_id,old_values,new_values)
    values('repair_logs',prior.id::text,'DELETE',auth.uid(),to_jsonb(prior),null);
  end if;
  delete from public.repair_log_parts where repair_log_id=log_id;
  delete from public.repair_logs where id=log_id;
end $$;
revoke all on function public.delete_repair_log(uuid,integer) from public;
grant execute on function public.delete_repair_log(uuid,integer) to authenticated;
insert into public.system_metadata(key,value,updated_at) values('database_revision','0.13.0',now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;
commit;
