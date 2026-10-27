begin;

-- Repair logs are lightweight technician notes. Completing a log must not require
-- testing or outcome text; those fields remain available when useful.
do $$
declare
  completion_constraint text;
begin
  select conname into completion_constraint
  from pg_constraint
  where conrelid = 'public.repair_logs'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%'
    and pg_get_constraintdef(oid) ilike '%completed%'
    and pg_get_constraintdef(oid) ilike '%tests%'
    and pg_get_constraintdef(oid) ilike '%outcome%';

  if completion_constraint is null then
    raise exception 'Repair completion constraint was not found';
  end if;

  execute format('alter table public.repair_logs drop constraint %I', completion_constraint);
end $$;

insert into public.system_metadata(key,value,updated_at)
values('database_revision','0.13.1',now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;

commit;
