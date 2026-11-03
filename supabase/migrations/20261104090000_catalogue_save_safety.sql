begin;

-- Production must not depend on the optional, fictional development seed.
-- Preserve an existing display name and ID, and avoid taking another type's name.
do $$
declare default_name text := 'Unknown'; suffix integer := 0;
begin
  if exists (select 1 from public.supply_types where code = 'unknown') then
    update public.supply_types set is_active = true where code = 'unknown';
  else
    while exists (select 1 from public.supply_types where name = default_name) loop
      suffix := suffix + 1;
      default_name := 'Unknown (default ' || suffix || ')';
    end loop;
    insert into public.supply_types(code, name, description)
    values ('unknown', default_name, 'Built-in default when the supply source is not yet known.');
  end if;
end $$;

create function public.protect_unknown_supply_type()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'The built-in Unknown supply type cannot be removed';
  end if;
  if old.code = 'unknown' then
    if tg_op = 'DELETE' then
      raise exception 'The built-in Unknown supply type cannot be removed';
    end if;
    if new.code <> 'unknown' or not new.is_active then
      raise exception 'The built-in Unknown supply type must keep code unknown and remain active';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger protect_unknown_supply_type
before update or delete on public.supply_types
for each row execute function public.protect_unknown_supply_type();
create trigger protect_unknown_supply_type_truncate
before truncate on public.supply_types
for each statement execute function public.protect_unknown_supply_type();

create or replace function public.replace_and_deactivate_supply_type(old_code text, replacement_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare part_count integer; request_count integer; company_count integer;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if not public.is_write_enabled() then raise exception 'Standby is read only'; end if;
  if old_code = 'unknown' then raise exception 'The built-in Unknown supply type cannot be deactivated'; end if;
  perform 1 from public.supply_types where code = old_code and is_active for update;
  if not found then raise exception 'Supply type is not active'; end if;
  select count(*) into part_count from public.parts where supply_type = old_code;
  select count(*) into request_count from public.part_requests where supply_type = old_code;
  select count(*) into company_count from public.companies where supply_type = old_code;
  if part_count + request_count + company_count > 0 then
    if replacement_code is null or replacement_code = old_code then raise exception 'An active replacement supply type is required'; end if;
    if not exists(select 1 from public.supply_types where code = replacement_code and is_active) then raise exception 'Replacement supply type must be active'; end if;
    update public.parts set supply_type = replacement_code where supply_type = old_code;
    update public.part_requests set supply_type = replacement_code where supply_type = old_code;
    update public.companies set supply_type = replacement_code where supply_type = old_code;
  end if;
  update public.supply_types set is_active = false where code = old_code;
  return jsonb_build_object('parts_replaced', part_count, 'requests_replaced', request_count, 'companies_replaced', company_count);
end $$;
revoke all on function public.replace_and_deactivate_supply_type(text,text) from public;
grant execute on function public.replace_and_deactivate_supply_type(text,text) to authenticated;

-- One transaction for identity and roles. Replaying an acknowledged or uncertain
-- save with the same ID is safe; role failures roll back the company changes.
create function public.save_company(company jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  target_id uuid := (company->>'id')::uuid;
  selected_roles text[];
  selected_supply text := coalesce(nullif(company->>'supply_type', ''), 'unknown');
  previous_supply text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if not public.is_write_enabled() then raise exception 'Standby is read only'; end if;
  if target_id is null or jsonb_typeof(company) <> 'object' then raise exception 'Company ID is required'; end if;
  if jsonb_typeof(company->'roles') is distinct from 'array' then raise exception 'Select at least one company role'; end if;
  select array_agg(distinct value) into selected_roles from jsonb_array_elements_text(company->'roles');
  if coalesce(cardinality(selected_roles), 0) = 0 or exists (
    select 1 from unnest(selected_roles) role where role is null or role not in ('manufacturer','supplier','distributor')
  ) then raise exception 'Select valid company roles'; end if;
  select supply_type into previous_supply from public.companies where id = target_id for update;
  if not exists (select 1 from public.supply_types where code = selected_supply and (is_active or code = previous_supply)) then
    raise exception 'Choose an active supply type';
  end if;
  insert into public.companies(id, name, notes, website_url, ordering_information, supply_type, default_supplier_id, is_active)
  values (target_id, btrim(company->>'name'), nullif(btrim(company->>'notes'), ''),
    nullif(btrim(company->>'website_url'), ''), nullif(btrim(company->>'ordering_information'), ''), selected_supply,
    case when 'manufacturer' = any(selected_roles) then nullif(company->>'default_supplier_id', '')::uuid else null end,
    coalesce((company->>'is_active')::boolean, true))
  on conflict (id) do update set name = excluded.name, notes = excluded.notes, website_url = excluded.website_url,
    ordering_information = excluded.ordering_information, supply_type = excluded.supply_type,
    default_supplier_id = excluded.default_supplier_id, is_active = excluded.is_active;
  delete from public.company_roles where company_id = target_id and not (role = any(selected_roles));
  insert into public.company_roles(company_id, role)
    select target_id, unnest(selected_roles) on conflict do nothing;
  return target_id;
end $$;
revoke all on function public.save_company(jsonb) from public;
grant execute on function public.save_company(jsonb) to authenticated;

insert into public.system_metadata(key, value, updated_at)
values ('database_revision', '0.14.0', now())
on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at;

commit;
