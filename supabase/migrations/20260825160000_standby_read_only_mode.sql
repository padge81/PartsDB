begin;

insert into public.system_metadata (key, value, updated_at)
values ('site_mode', 'live', now())
on conflict (key) do nothing;

create or replace function public.is_write_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select metadata.value in ('live', 'maintenance')
     from public.system_metadata metadata
     where metadata.key = 'site_mode'),
    true
  );
$$;

revoke all on function public.is_write_enabled() from public;
grant execute on function public.is_write_enabled() to authenticated;

create or replace function public.set_site_mode(new_mode text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if new_mode not in ('live', 'standby', 'maintenance') then
    raise exception 'Invalid site mode';
  end if;

  insert into public.system_metadata (key, value, updated_at)
  values ('site_mode', new_mode, now())
  on conflict (key) do update
  set value = excluded.value,
      updated_at = excluded.updated_at;

  return new_mode;
end;
$$;

revoke all on function public.set_site_mode(text) from public;
grant execute on function public.set_site_mode(text) to authenticated;

do $$
declare
  protected_table text;
begin
  foreach protected_table in array array[
    'profiles', 'supply_types', 'companies', 'company_roles',
    'machine_categories', 'machines', 'categories', 'parts',
    'part_requests', 'part_suppliers', 'part_machines', 'part_categories',
    'part_order_groups', 'part_order_group_members',
    'machine_images', 'part_images', 'request_images'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'standby_' || protected_table || '_insert', protected_table);
    execute format('drop policy if exists %I on public.%I', 'standby_' || protected_table || '_update', protected_table);
    execute format('drop policy if exists %I on public.%I', 'standby_' || protected_table || '_delete', protected_table);

    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (public.is_write_enabled())',
      'standby_' || protected_table || '_insert', protected_table
    );
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (public.is_write_enabled()) with check (public.is_write_enabled())',
      'standby_' || protected_table || '_update', protected_table
    );
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (public.is_write_enabled())',
      'standby_' || protected_table || '_delete', protected_table
    );
  end loop;
end;
$$;

drop policy if exists standby_storage_insert on storage.objects;
drop policy if exists standby_storage_update on storage.objects;
drop policy if exists standby_storage_delete on storage.objects;

create policy standby_storage_insert on storage.objects
as restrictive for insert to authenticated
with check (
  bucket_id not in ('part-images', 'request-images', 'machine-images')
  or public.is_write_enabled()
);

create policy standby_storage_update on storage.objects
as restrictive for update to authenticated
using (
  bucket_id not in ('part-images', 'request-images', 'machine-images')
  or public.is_write_enabled()
)
with check (
  bucket_id not in ('part-images', 'request-images', 'machine-images')
  or public.is_write_enabled()
);

create policy standby_storage_delete on storage.objects
as restrictive for delete to authenticated
using (
  bucket_id not in ('part-images', 'request-images', 'machine-images')
  or public.is_write_enabled()
);

insert into public.system_metadata (key, value, updated_at)
values ('database_revision', '0.8.0', now())
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

commit;
