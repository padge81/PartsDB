begin;

create or replace function public.replace_and_deactivate_supply_type(
  old_code text,
  replacement_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  part_count integer;
  request_count integer;
  supplier_count integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  if old_code is null or not exists (
    select 1 from public.supply_types where code = old_code and is_active
  ) then
    raise exception 'Active supply type not found';
  end if;

  select count(*) into part_count from public.parts where supply_type = old_code;
  select count(*) into request_count from public.part_requests where supply_type = old_code;
  select count(*) into supplier_count from public.suppliers where supply_type = old_code;

  if part_count + request_count + supplier_count > 0 then
    if replacement_code is null or replacement_code = old_code then
      raise exception 'Select a different active replacement supply type';
    end if;
    if not exists (
      select 1 from public.supply_types where code = replacement_code and is_active
    ) then
      raise exception 'Replacement supply type is not active';
    end if;

    update public.parts set supply_type = replacement_code where supply_type = old_code;
    update public.part_requests set supply_type = replacement_code where supply_type = old_code;
    update public.suppliers set supply_type = replacement_code where supply_type = old_code;
  end if;

  update public.supply_types
  set is_active = false, updated_at = now()
  where code = old_code;

  return jsonb_build_object(
    'parts_replaced', part_count,
    'requests_replaced', request_count,
    'suppliers_replaced', supplier_count
  );
end;
$$;

revoke all on function public.replace_and_deactivate_supply_type(text, text) from public;
grant execute on function public.replace_and_deactivate_supply_type(text, text) to authenticated;

insert into public.system_metadata (key, value, updated_at)
values ('database_revision', '0.4.0', now())
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

commit;
