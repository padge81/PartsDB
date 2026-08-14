begin;

alter table public.manufacturers
  add column if not exists default_supplier_id uuid
  references public.suppliers(id) on delete set null;

create index if not exists manufacturers_default_supplier_id_idx
  on public.manufacturers(default_supplier_id);

commit;
