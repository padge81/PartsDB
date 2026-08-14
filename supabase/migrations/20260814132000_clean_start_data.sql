begin;

-- Clear all business, catalogue and reference data while preserving auth users and profiles.
truncate table
  public.audit_log,
  public.request_history,
  public.request_images,
  public.part_requests,
  public.commonly_ordered_parts,
  public.part_images,
  public.part_suppliers,
  public.part_categories,
  public.part_machine_revisions,
  public.machine_revisions,
  public.parts,
  public.machines,
  public.categories,
  public.suppliers,
  public.manufacturers,
  public.supply_types
restart identity;

-- Remove legacy tag structures no longer used by the application.
drop table if exists public.machine_tags;
drop table if exists public.part_tags;
drop table if exists public.tags;

commit;
