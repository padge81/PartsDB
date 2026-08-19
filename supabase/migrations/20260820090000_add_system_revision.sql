fatal: path 'supabase/migrations/20260820090000_add_system_revision.sql' exists on disk, but not in 'HEAD'
begin;

create table if not exists public.system_metadata (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.system_metadata (key, value, updated_at)
values ('database_revision', '0.2.0', now())
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

alter table public.system_metadata enable row level security;

create policy system_metadata_read
on public.system_metadata
for select
to authenticated
using (true);

grant select on public.system_metadata to authenticated;

commit;
