begin;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_not_blank check (btrim(name) <> '')
);

create unique index categories_name_lower_unique
on public.categories (lower(name));

create table public.part_categories (
  part_id uuid not null references public.parts(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  primary key (part_id, category_id)
);

create index part_categories_category_id_idx
on public.part_categories (category_id);

alter table public.categories enable row level security;
alter table public.part_categories enable row level security;

create policy categories_read on public.categories
for select to authenticated
using (is_active or public.is_admin());

create policy categories_admin on public.categories
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy part_categories_read on public.part_categories
for select to authenticated
using (true);

create policy part_categories_admin on public.part_categories
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create trigger audit_categories
after insert or update or delete on public.categories
for each row execute function public.write_audit_log();

create trigger audit_part_categories
after insert or update or delete on public.part_categories
for each row execute function public.write_audit_log();

insert into public.categories (name) values
  ('Circuit board'),
  ('Sensor'),
  ('Perspex'),
  ('Motor')
on conflict do nothing;

commit;
