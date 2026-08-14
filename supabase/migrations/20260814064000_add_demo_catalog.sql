begin;

-- A small, clearly labelled production demo catalogue for acceptance testing.
insert into public.manufacturers (id, name, notes)
values
  ('10000000-0000-0000-0000-000000000101', 'SKF', '[DEMO] Sample manufacturer'),
  ('10000000-0000-0000-0000-000000000102', 'SICK', '[DEMO] Sample manufacturer'),
  ('10000000-0000-0000-0000-000000000103', 'Gates', '[DEMO] Sample manufacturer'),
  ('10000000-0000-0000-0000-000000000104', 'Festo', '[DEMO] Sample manufacturer'),
  ('10000000-0000-0000-0000-000000000105', 'Demo Machine Co', '[DEMO] Sample machine manufacturer')
on conflict (name) do nothing;

insert into public.machines (id, manufacturer_id, model, name, notes)
values
  ('10000000-0000-0000-0000-000000000201', (select id from public.manufacturers where name = 'Demo Machine Co'), 'CV-14', 'Demo conveyor', '[DEMO] Test machine'),
  ('10000000-0000-0000-0000-000000000202', (select id from public.manufacturers where name = 'Demo Machine Co'), 'PK-200', 'Demo packaging line', '[DEMO] Test machine')
on conflict (manufacturer_id, model) do nothing;

insert into public.machine_revisions (id, machine_id, revision, notes)
values
  ('10000000-0000-0000-0000-000000000301', '10000000-0000-0000-0000-000000000201', 'A', '[DEMO] Test revision'),
  ('10000000-0000-0000-0000-000000000302', '10000000-0000-0000-0000-000000000202', 'B', '[DEMO] Test revision')
on conflict (machine_id, revision) do nothing;

insert into public.suppliers (id, name, website_url, ordering_information, notes)
values
  ('10000000-0000-0000-0000-000000000401', 'Demo Industrial Supply', 'https://example.com', 'Quote the supplier part number when ordering.', '[DEMO] Sample supplier'),
  ('10000000-0000-0000-0000-000000000402', 'Demo Automation Store', 'https://example.com', 'Order through the demonstration supplier portal.', '[DEMO] Sample supplier')
on conflict (name) do nothing;

insert into public.parts (
  id, description, manufacturer_id, manufacturer_part_number,
  internal_part_number, notes, supply_type, status
)
values
  ('10000000-0000-0000-0000-000000000501', 'Sealed deep groove ball bearing', (select id from public.manufacturers where name = 'SKF'), 'DEMO-6204-2RSH', 'DEMO-BRG-0204', '[DEMO] Sealed bearing for conveyor drive assemblies. Confirm shaft condition before replacement.', 'local', 'active'),
  ('10000000-0000-0000-0000-000000000502', 'Photoelectric diffuse sensor, 300 mm', (select id from public.manufacturers where name = 'SICK'), 'DEMO-WTB4-3P2161', 'DEMO-SNS-1108', '[DEMO] PNP switching output with M8 connector. Record alignment after installation.', 'dfl', 'active'),
  ('10000000-0000-0000-0000-000000000503', 'Timing belt, 25 mm width', (select id from public.manufacturers where name = 'Gates'), 'DEMO-HTD-800-8M-25', 'DEMO-BLT-0800', '[DEMO] Inspect both pulleys and the tensioner when replacing this belt.', 'local', 'active'),
  ('10000000-0000-0000-0000-000000000504', 'Pneumatic solenoid valve 5/2 way', (select id from public.manufacturers where name = 'Festo'), 'DEMO-VUVG-L14-M52', 'DEMO-VLV-0522', '[DEMO] 24 VDC valve used on pneumatic actuator manifolds.', 'dfl', 'active')
on conflict (id) do nothing;

insert into public.part_machine_revisions (part_id, machine_revision_id, notes)
values
  ('10000000-0000-0000-0000-000000000501', '10000000-0000-0000-0000-000000000301', '[DEMO] Conveyor head drive'),
  ('10000000-0000-0000-0000-000000000503', '10000000-0000-0000-0000-000000000301', '[DEMO] Conveyor timing drive'),
  ('10000000-0000-0000-0000-000000000502', '10000000-0000-0000-0000-000000000302', '[DEMO] Product detection'),
  ('10000000-0000-0000-0000-000000000504', '10000000-0000-0000-0000-000000000302', '[DEMO] Pneumatic actuator control')
on conflict do nothing;

insert into public.part_suppliers (
  id, part_id, supplier_id, preference_rank, supplier_part_number, ordering_information, notes
)
values
  ('10000000-0000-0000-0000-000000000601', '10000000-0000-0000-0000-000000000501', '10000000-0000-0000-0000-000000000401', 1, 'SUP-6204', 'Order individually.', '[DEMO] Preferred sample source'),
  ('10000000-0000-0000-0000-000000000602', '10000000-0000-0000-0000-000000000502', '10000000-0000-0000-0000-000000000402', 1, 'AUT-WTB4', 'Confirm cable requirement.', '[DEMO] Preferred sample source'),
  ('10000000-0000-0000-0000-000000000603', '10000000-0000-0000-0000-000000000503', '10000000-0000-0000-0000-000000000401', 1, 'SUP-HTD800', 'Order by belt profile and width.', '[DEMO] Preferred sample source'),
  ('10000000-0000-0000-0000-000000000604', '10000000-0000-0000-0000-000000000504', '10000000-0000-0000-0000-000000000402', 1, 'AUT-VUVG52', 'Confirm coil voltage.', '[DEMO] Preferred sample source')
on conflict (id) do nothing;

insert into public.commonly_ordered_parts (part_id, related_part_id)
values
  ('10000000-0000-0000-0000-000000000501', '10000000-0000-0000-0000-000000000503'),
  ('10000000-0000-0000-0000-000000000503', '10000000-0000-0000-0000-000000000501'),
  ('10000000-0000-0000-0000-000000000502', '10000000-0000-0000-0000-000000000504')
on conflict do nothing;

commit;
