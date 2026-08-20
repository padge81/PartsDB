begin;

-- Version 0.5.0 is an intentional clean catalogue reset. Authentication and
-- profiles are retained; all operational/reference data is removed.
truncate table
  public.request_images,
  public.request_history,
  public.part_requests,
  public.commonly_ordered_parts,
  public.part_images,
  public.part_categories,
  public.part_suppliers,
  public.part_machine_revisions,
  public.machine_revisions,
  public.parts,
  public.machines,
  public.categories,
  public.audit_log
restart identity cascade;

drop trigger if exists audit_manufacturers on public.manufacturers;
drop trigger if exists audit_suppliers on public.suppliers;
drop trigger if exists manufacturers_set_updated_at on public.manufacturers;
drop trigger if exists suppliers_set_updated_at on public.suppliers;

drop table if exists public.part_machine_revisions;
drop table if exists public.machine_revisions;
drop table if exists public.part_tags;
drop table if exists public.machine_tags;
drop table if exists public.tags;

alter table public.machines drop constraint if exists machines_manufacturer_id_fkey;
alter table public.parts drop constraint if exists parts_manufacturer_id_fkey;
alter table public.part_suppliers drop constraint if exists part_suppliers_supplier_id_fkey;
alter table public.manufacturers drop constraint if exists manufacturers_default_supplier_id_fkey;

drop table if exists public.suppliers;
drop table if exists public.manufacturers;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website_url text,
  ordering_information text,
  notes text,
  supply_type text not null default 'unknown' references public.supply_types(code),
  default_supplier_id uuid references public.companies(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_name_not_blank check (btrim(name) <> '')
);

create unique index companies_name_unique_ci on public.companies (lower(btrim(name)));
create index companies_name_trgm_idx on public.companies using gin (name gin_trgm_ops);
create index companies_default_supplier_idx on public.companies(default_supplier_id);

create table public.company_roles (
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null check (role in ('manufacturer', 'supplier', 'distributor')),
  primary key (company_id, role)
);

create table public.part_machines (
  part_id uuid not null references public.parts(id) on delete cascade,
  machine_id uuid not null references public.machines(id) on delete cascade,
  notes text,
  primary key (part_id, machine_id)
);

alter table public.part_requests
  drop column if exists machine_revision,
  drop column if exists machine_revision_ids,
  drop column if exists compatibility_tags,
  add column machine_ids uuid[] not null default '{}';

alter table public.parts drop column if exists internal_part_number;

alter table public.machines add constraint machines_company_id_fkey
  foreign key (manufacturer_id) references public.companies(id);
alter table public.parts add constraint parts_company_id_fkey
  foreign key (manufacturer_id) references public.companies(id);
alter table public.part_suppliers add constraint part_suppliers_company_id_fkey
  foreign key (supplier_id) references public.companies(id);

alter table public.part_suppliers drop constraint if exists part_suppliers_part_supplier_unique;
alter table public.part_suppliers add constraint part_suppliers_part_company_unique unique (part_id, supplier_id);

drop index if exists public.parts_manufacturer_number_unique;
create unique index parts_company_number_unique
  on public.parts (manufacturer_id, lower(manufacturer_part_number))
  where manufacturer_id is not null and manufacturer_part_number is not null;

drop index if exists public.machines_manufacturer_name_unique;
create unique index machines_company_name_unique
  on public.machines (manufacturer_id, lower(btrim(name)));

create trigger companies_set_updated_at before update on public.companies
for each row execute function public.set_updated_at();
create trigger audit_companies after insert or update or delete on public.companies
for each row execute function public.write_audit_log();
create trigger audit_company_roles after insert or update or delete on public.company_roles
for each row execute function public.write_audit_log();

alter table public.companies enable row level security;
alter table public.company_roles enable row level security;
alter table public.part_machines enable row level security;

create policy companies_read on public.companies
for select to authenticated using (is_active or public.is_admin());
create policy companies_admin on public.companies
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy company_roles_read on public.company_roles
for select to authenticated using (true);
create policy company_roles_admin on public.company_roles
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy part_machines_read on public.part_machines
for select to authenticated using (true);
create policy part_machines_admin on public.part_machines
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.replace_and_deactivate_supply_type(old_code text, replacement_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare part_count integer; request_count integer; company_count integer;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select count(*) into part_count from public.parts where supply_type = old_code;
  select count(*) into request_count from public.part_requests where supply_type = old_code;
  select count(*) into company_count from public.companies where supply_type = old_code;
  if part_count + request_count + company_count > 0 then
    if replacement_code is null or replacement_code = old_code then raise exception 'An active replacement supply type is required'; end if;
    if not exists (select 1 from public.supply_types where code = replacement_code and is_active) then raise exception 'Replacement supply type must be active'; end if;
    update public.parts set supply_type = replacement_code where supply_type = old_code;
    update public.part_requests set supply_type = replacement_code where supply_type = old_code;
    update public.companies set supply_type = replacement_code where supply_type = old_code;
  end if;
  update public.supply_types set is_active = false where code = old_code;
  return jsonb_build_object('parts_replaced', part_count, 'requests_replaced', request_count, 'companies_replaced', company_count);
end; $$;

insert into public.system_settings(key, value, updated_at)
values ('database_revision', '0.5.0', now())
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

commit;
