begin;

alter table public.suppliers
  add column if not exists supply_type text not null default 'unknown';

alter table public.suppliers
  add constraint suppliers_supply_type_fk foreign key (supply_type)
  references public.supply_types(code) on update cascade;

commit;
