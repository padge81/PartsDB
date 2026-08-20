begin;

create table public.machine_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint machine_categories_name_not_blank check (btrim(name) <> '')
);

create unique index machine_categories_name_unique_ci on public.machine_categories (lower(btrim(name)));

alter table public.machines
  add column category_id uuid references public.machine_categories(id) on delete set null;

create index machines_category_id_idx on public.machines(category_id);
create index machines_name_trgm_idx on public.machines using gin (name gin_trgm_ops);

create table public.machine_images (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null unique references public.machines(id) on delete cascade,
  storage_bucket text not null default 'machine-images',
  storage_path text not null,
  caption text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint machine_images_object_unique unique (storage_bucket, storage_path)
);

create trigger machine_categories_set_updated_at before update on public.machine_categories
for each row execute function public.set_updated_at();
create trigger audit_machine_categories after insert or update or delete on public.machine_categories
for each row execute function public.write_audit_log();
create trigger audit_machine_images after insert or update or delete on public.machine_images
for each row execute function public.write_audit_log();

alter table public.machine_categories enable row level security;
alter table public.machine_images enable row level security;

create policy machine_categories_read on public.machine_categories
for select to authenticated using (is_active or public.is_admin());
create policy machine_categories_admin on public.machine_categories
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy machine_images_read on public.machine_images
for select to authenticated using (true);
create policy machine_images_admin on public.machine_images
for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('machine-images', 'machine-images', false, 5242880, array['image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy storage_machine_images_read on storage.objects
for select to authenticated using (bucket_id = 'machine-images');
create policy storage_machine_images_admin_insert on storage.objects
for insert to authenticated with check (bucket_id = 'machine-images' and public.is_admin());
create policy storage_machine_images_admin_update on storage.objects
for update to authenticated using (bucket_id = 'machine-images' and public.is_admin())
with check (bucket_id = 'machine-images' and public.is_admin());
create policy storage_machine_images_admin_delete on storage.objects
for delete to authenticated using (bucket_id = 'machine-images' and public.is_admin());

create or replace function public.find_similar_parts(
  candidate_number text,
  candidate_description text,
  candidate_machine_ids uuid[] default '{}',
  result_limit integer default 8
)
returns table (
  id uuid,
  description text,
  manufacturer_part_number text,
  number_match text,
  description_score real,
  same_machine boolean,
  score real
)
language sql stable security invoker set search_path = '' as $$
  with candidates as (
    select
      p.id,
      p.description,
      p.manufacturer_part_number,
      case
        when nullif(btrim(candidate_number), '') is not null
          and lower(btrim(p.manufacturer_part_number)) = lower(btrim(candidate_number)) then 'Exact part number'
        when nullif(btrim(candidate_number), '') is not null
          and (p.manufacturer_part_number ilike '%' || btrim(candidate_number) || '%'
            or candidate_number ilike '%' || btrim(p.manufacturer_part_number) || '%') then 'Partial part number'
        else null
      end as number_match,
      extensions.similarity(coalesce(p.description, ''), coalesce(candidate_description, ''))::real as description_score,
      exists (
        select 1 from public.part_machines pm
        where pm.part_id = p.id and pm.machine_id = any(coalesce(candidate_machine_ids, '{}'))
      ) as same_machine
    from public.parts p
    where p.status = 'active'
  )
  select
    c.id,
    c.description,
    c.manufacturer_part_number,
    c.number_match,
    c.description_score,
    c.same_machine,
    least(1::real,
      (case c.number_match when 'Exact part number' then .72 when 'Partial part number' then .45 else 0 end)::real
      + (c.description_score * .38)::real
      + (case when c.same_machine then .12 else 0 end)::real
    ) as score
  from candidates c
  where c.number_match is not null or c.description_score >= .28
  order by score desc, c.description asc
  limit greatest(1, least(coalesce(result_limit, 8), 20));
$$;

grant execute on function public.find_similar_parts(text, text, uuid[], integer) to authenticated;

insert into public.system_metadata(key, value, updated_at)
values ('database_revision', '0.6.0', now())
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

commit;
