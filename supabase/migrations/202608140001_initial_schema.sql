begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create type public.user_role as enum ('user', 'admin');
create type public.part_status as enum ('draft', 'active', 'inactive', 'obsolete');
create type public.request_status as enum ('draft', 'pending', 'approved', 'rejected', 'cancelled');
create type public.supply_type as enum ('local', 'dfl', 'unknown');
create type public.image_kind as enum ('front', 'rear', 'label', 'packaging', 'installation', 'dimensional', 'other');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role public.user_role not null default 'user',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manufacturers_name_unique unique (name)
);

create table public.machines (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id),
  model text not null,
  name text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint machines_manufacturer_model_unique unique (manufacturer_id, model)
);

create table public.machine_revisions (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  revision text not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint machine_revisions_unique unique (machine_id, revision)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  constraint tags_name_unique unique (name)
);

create table public.machine_tags (
  machine_id uuid not null references public.machines(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (machine_id, tag_id)
);

create table public.parts (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  manufacturer_id uuid references public.manufacturers(id),
  manufacturer_part_number text,
  internal_part_number text,
  notes text,
  supply_type public.supply_type not null default 'unknown',
  status public.part_status not null default 'draft',
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index parts_manufacturer_number_unique
  on public.parts (manufacturer_id, lower(manufacturer_part_number))
  where manufacturer_id is not null and manufacturer_part_number is not null;

create unique index parts_internal_number_unique
  on public.parts (lower(internal_part_number))
  where internal_part_number is not null;

create table public.part_machine_revisions (
  part_id uuid not null references public.parts(id) on delete cascade,
  machine_revision_id uuid not null references public.machine_revisions(id) on delete cascade,
  notes text,
  primary key (part_id, machine_revision_id)
);

create table public.part_tags (
  part_id uuid not null references public.parts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (part_id, tag_id)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website_url text,
  ordering_information text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_name_unique unique (name)
);

create table public.part_suppliers (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id),
  preference_rank smallint not null,
  supplier_part_number text,
  ordering_information text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint part_suppliers_rank_range check (preference_rank between 1 and 3),
  constraint part_suppliers_part_supplier_unique unique (part_id, supplier_id),
  constraint part_suppliers_part_rank_unique unique (part_id, preference_rank)
);

create table public.part_images (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts(id) on delete cascade,
  storage_bucket text not null default 'part-images',
  storage_path text not null,
  kind public.image_kind not null default 'other',
  caption text,
  sort_order integer not null default 0,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint part_images_object_unique unique (storage_bucket, storage_path)
);

create table public.commonly_ordered_parts (
  part_id uuid not null references public.parts(id) on delete cascade,
  related_part_id uuid not null references public.parts(id) on delete cascade,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (part_id, related_part_id),
  constraint commonly_ordered_not_self check (part_id <> related_part_id)
);

create table public.part_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id),
  status public.request_status not null default 'draft',
  machine_manufacturer text,
  machine_model text,
  machine_revision text,
  part_description text not null,
  part_manufacturer text,
  manufacturer_part_number text,
  supplier_information jsonb not null default '[]'::jsonb,
  supply_type public.supply_type not null default 'unknown',
  compatibility_tags text[] not null default '{}',
  commonly_ordered_part_ids uuid[] not null default '{}',
  notes text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_notes text,
  approved_part_id uuid references public.parts(id),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint part_requests_supplier_array check (jsonb_typeof(supplier_information) = 'array')
);

create table public.request_images (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.part_requests(id) on delete cascade,
  storage_bucket text not null default 'request-images',
  storage_path text not null,
  kind public.image_kind not null default 'other',
  caption text,
  sort_order integer not null default 0,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint request_images_object_unique unique (storage_bucket, storage_path)
);

create table public.request_history (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.part_requests(id) on delete cascade,
  from_status public.request_status,
  to_status public.request_status not null,
  changed_by uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id uuid,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create index parts_description_trgm_idx on public.parts using gin (description gin_trgm_ops);
create index parts_manufacturer_part_number_trgm_idx on public.parts using gin (manufacturer_part_number gin_trgm_ops);
create index parts_internal_part_number_trgm_idx on public.parts using gin (internal_part_number gin_trgm_ops);
create index machines_model_trgm_idx on public.machines using gin (model gin_trgm_ops);
create index manufacturers_name_trgm_idx on public.manufacturers using gin (name gin_trgm_ops);
create index suppliers_name_trgm_idx on public.suppliers using gin (name gin_trgm_ops);
create index part_requests_status_idx on public.part_requests (status, submitted_at);
create index part_images_part_sort_idx on public.part_images (part_id, sort_order);
create index request_images_request_sort_idx on public.request_images (request_id, sort_order);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger manufacturers_set_updated_at before update on public.manufacturers
for each row execute function public.set_updated_at();
create trigger machines_set_updated_at before update on public.machines
for each row execute function public.set_updated_at();
create trigger machine_revisions_set_updated_at before update on public.machine_revisions
for each row execute function public.set_updated_at();
create trigger parts_set_updated_at before update on public.parts
for each row execute function public.set_updated_at();
create trigger suppliers_set_updated_at before update on public.suppliers
for each row execute function public.set_updated_at();
create trigger part_suppliers_set_updated_at before update on public.part_suppliers
for each row execute function public.set_updated_at();
create trigger part_requests_set_updated_at before update on public.part_requests
for each row execute function public.set_updated_at();

commit;
