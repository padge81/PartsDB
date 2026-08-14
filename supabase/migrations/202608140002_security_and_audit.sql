begin;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin' and p.is_active from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id text;
begin
  row_id := coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'));
  insert into public.audit_log (
    table_name, record_id, operation, actor_id, old_values, new_values
  )
  values (
    tg_table_name,
    row_id,
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_parts after insert or update or delete on public.parts
for each row execute function public.write_audit_log();
create trigger audit_machines after insert or update or delete on public.machines
for each row execute function public.write_audit_log();
create trigger audit_machine_revisions after insert or update or delete on public.machine_revisions
for each row execute function public.write_audit_log();
create trigger audit_manufacturers after insert or update or delete on public.manufacturers
for each row execute function public.write_audit_log();
create trigger audit_suppliers after insert or update or delete on public.suppliers
for each row execute function public.write_audit_log();
create trigger audit_part_suppliers after insert or update or delete on public.part_suppliers
for each row execute function public.write_audit_log();

create or replace function public.record_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.request_history (
      request_id, from_status, to_status, changed_by, notes
    )
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      auth.uid(),
      new.review_notes
    );
  end if;
  return new;
end;
$$;

create trigger part_request_status_history
after insert or update of status on public.part_requests
for each row execute function public.record_request_status_change();

alter table public.profiles enable row level security;
alter table public.manufacturers enable row level security;
alter table public.machines enable row level security;
alter table public.machine_revisions enable row level security;
alter table public.tags enable row level security;
alter table public.machine_tags enable row level security;
alter table public.parts enable row level security;
alter table public.part_machine_revisions enable row level security;
alter table public.part_tags enable row level security;
alter table public.suppliers enable row level security;
alter table public.part_suppliers enable row level security;
alter table public.part_images enable row level security;
alter table public.commonly_ordered_parts enable row level security;
alter table public.part_requests enable row level security;
alter table public.request_images enable row level security;
alter table public.request_history enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_read_self_or_admin on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role = 'user');

create policy profiles_admin_all on public.profiles
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy manufacturers_read on public.manufacturers
for select to authenticated using (is_active or public.is_admin());
create policy manufacturers_admin on public.manufacturers
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy machines_read on public.machines
for select to authenticated using (is_active or public.is_admin());
create policy machines_admin on public.machines
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy machine_revisions_read on public.machine_revisions
for select to authenticated using (is_active or public.is_admin());
create policy machine_revisions_admin on public.machine_revisions
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy tags_read on public.tags
for select to authenticated using (true);
create policy tags_admin on public.tags
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy machine_tags_read on public.machine_tags
for select to authenticated using (true);
create policy machine_tags_admin on public.machine_tags
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy parts_read on public.parts
for select to authenticated using (status = 'active' or public.is_admin());
create policy parts_admin on public.parts
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy part_machine_revisions_read on public.part_machine_revisions
for select to authenticated using (true);
create policy part_machine_revisions_admin on public.part_machine_revisions
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy part_tags_read on public.part_tags
for select to authenticated using (true);
create policy part_tags_admin on public.part_tags
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy suppliers_read on public.suppliers
for select to authenticated using (is_active or public.is_admin());
create policy suppliers_admin on public.suppliers
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy part_suppliers_read on public.part_suppliers
for select to authenticated using (is_active or public.is_admin());
create policy part_suppliers_admin on public.part_suppliers
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy part_images_read on public.part_images
for select to authenticated using (true);
create policy part_images_admin on public.part_images
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy commonly_ordered_read on public.commonly_ordered_parts
for select to authenticated using (true);
create policy commonly_ordered_admin on public.commonly_ordered_parts
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy part_requests_read_own_or_admin on public.part_requests
for select to authenticated
using (requested_by = auth.uid() or public.is_admin());

create policy part_requests_create_own on public.part_requests
for insert to authenticated
with check (requested_by = auth.uid() and status = 'draft');

create policy part_requests_update_own_draft on public.part_requests
for update to authenticated
using (requested_by = auth.uid() and status = 'draft')
with check (
  requested_by = auth.uid()
  and status in ('draft', 'pending', 'cancelled')
  and reviewed_by is null
  and reviewed_at is null
  and approved_part_id is null
);

create policy part_requests_admin on public.part_requests
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy request_images_read_own_or_admin on public.request_images
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.part_requests r
    where r.id = request_id and r.requested_by = auth.uid()
  )
);

create policy request_images_create_own on public.request_images
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1 from public.part_requests r
    where r.id = request_id
      and r.requested_by = auth.uid()
      and r.status = 'draft'
  )
);

create policy request_images_delete_own_draft on public.request_images
for delete to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.part_requests r
    where r.id = request_id
      and r.requested_by = auth.uid()
      and r.status = 'draft'
  )
);

create policy request_history_read_own_or_admin on public.request_history
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.part_requests r
    where r.id = request_id and r.requested_by = auth.uid()
  )
);

create policy audit_log_admin_read on public.audit_log
for select to authenticated using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('part-images', 'part-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('request-images', 'request-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy storage_images_read on storage.objects
for select to authenticated
using (bucket_id in ('part-images', 'request-images'));

create policy storage_request_images_upload on storage.objects
for insert to authenticated
with check (bucket_id = 'request-images' and owner_id = auth.uid()::text);

create policy storage_request_images_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'request-images'
  and (owner_id = auth.uid()::text or public.is_admin())
);

create policy storage_part_images_admin_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'part-images' and public.is_admin());

create policy storage_part_images_admin_update on storage.objects
for update to authenticated
using (bucket_id = 'part-images' and public.is_admin())
with check (bucket_id = 'part-images' and public.is_admin());

create policy storage_part_images_admin_delete on storage.objects
for delete to authenticated
using (bucket_id = 'part-images' and public.is_admin());

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

commit;
