begin;

create table public.supply_types (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supply_types_code_unique unique (code),
  constraint supply_types_name_unique unique (name),
  constraint supply_types_code_format check (code ~ '^[a-z0-9][a-z0-9_-]*$')
);

insert into public.supply_types (code, name, description)
values
  ('local', 'Local', 'Available through local supply'),
  ('dfl', 'DFL', 'Direct from line or designated supply'),
  ('unknown', 'Unknown', 'Supply source not yet confirmed')
on conflict (code) do nothing;

alter table public.parts alter column supply_type drop default;
alter table public.part_requests alter column supply_type drop default;
alter table public.parts alter column supply_type type text using supply_type::text;
alter table public.part_requests alter column supply_type type text using supply_type::text;
alter table public.parts alter column supply_type set default 'unknown';
alter table public.part_requests alter column supply_type set default 'unknown';

alter table public.parts
  add constraint parts_supply_type_fk foreign key (supply_type)
  references public.supply_types(code) on update cascade;
alter table public.part_requests
  add constraint part_requests_supply_type_fk foreign key (supply_type)
  references public.supply_types(code) on update cascade;

drop type public.supply_type;

create trigger supply_types_set_updated_at before update on public.supply_types
for each row execute function public.set_updated_at();

alter table public.supply_types enable row level security;
create policy supply_types_read on public.supply_types
for select to authenticated using (is_active or public.is_admin());
create policy supply_types_admin on public.supply_types
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create trigger audit_supply_types after insert or update or delete on public.supply_types
for each row execute function public.write_audit_log();

commit;
