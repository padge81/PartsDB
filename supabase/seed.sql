-- Development-only sample data. All names and identifiers are fictional.
begin;

insert into public.supply_types (code, name)
values
  ('unknown', 'Unknown'),
  ('local', 'Local'),
  ('dfl', 'DFL')
on conflict do nothing;

insert into public.manufacturers (id, name)
values
  ('00000000-0000-0000-0000-000000000101', 'Example Machine Co'),
  ('00000000-0000-0000-0000-000000000102', 'Example Components Ltd')
on conflict do nothing;

insert into public.machines (id, manufacturer_id, model, name)
values
  (
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000101',
    'MX-100',
    'Example Packaging Machine'
  )
on conflict do nothing;

insert into public.machine_revisions (id, machine_id, revision)
values (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000201',
  'A'
)
on conflict do nothing;

insert into public.suppliers (id, name, website_url)
values (
  '00000000-0000-0000-0000-000000000401',
  'Example Industrial Supply',
  'https://example.invalid'
)
on conflict do nothing;

insert into public.parts (
  id, description, manufacturer_id, manufacturer_part_number, status, supply_type
)
values (
  '00000000-0000-0000-0000-000000000501',
  'Example sealed bearing',
  '00000000-0000-0000-0000-000000000102',
  'EX-6204-2RS',
  'active',
  'local'
)
on conflict do nothing;

insert into public.part_machine_revisions (part_id, machine_revision_id)
values (
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000301'
)
on conflict do nothing;

insert into public.part_suppliers (
  part_id, supplier_id, preference_rank, supplier_part_number
)
values (
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000401',
  1,
  'SUP-6204'
)
on conflict do nothing;

commit;
