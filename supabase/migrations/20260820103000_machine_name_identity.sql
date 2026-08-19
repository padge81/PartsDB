begin;

alter table public.part_requests
  add column if not exists machine_name text;

update public.machines
set name = coalesce(nullif(btrim(name), ''), nullif(btrim(model), ''), 'Unnamed machine')
where name is null or btrim(name) = '';

update public.part_requests
set machine_name = machine_model
where machine_name is null and machine_model is not null;

with duplicate_names as (
  select id,
         row_number() over (
           partition by manufacturer_id, lower(btrim(name))
           order by created_at, id
         ) as duplicate_number
  from public.machines
)
update public.machines as machine
set name = machine.name || ' (' || duplicate_names.duplicate_number || ')'
from duplicate_names
where machine.id = duplicate_names.id
  and duplicate_names.duplicate_number > 1;

alter table public.machines
  alter column name set not null,
  alter column model drop not null;

alter table public.machines
  drop constraint if exists machines_manufacturer_model_unique;

drop index if exists public.machines_manufacturer_model_unique;

create unique index if not exists machines_manufacturer_name_lower_unique
  on public.machines (manufacturer_id, lower(btrim(name)));

create index if not exists machines_model_lower_idx
  on public.machines (lower(model))
  where model is not null;

insert into public.system_metadata (key, value, updated_at)
values ('database_revision', '0.3.0', now())
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

commit;
