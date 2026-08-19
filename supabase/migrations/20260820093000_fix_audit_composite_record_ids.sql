begin;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  row_id text;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  select string_agg(coalesce(row_data ->> attribute.attname, ''), ':' order by key_column.ordinality)
  into row_id
  from pg_catalog.pg_index index_definition
  cross join lateral unnest(index_definition.indkey) with ordinality as key_column(attnum, ordinality)
  join pg_catalog.pg_attribute attribute
    on attribute.attrelid = index_definition.indrelid
   and attribute.attnum = key_column.attnum
  where index_definition.indrelid = tg_relid
    and index_definition.indisprimary;

  row_id := coalesce(nullif(row_id, ''), md5(row_data::text));

  insert into public.audit_log (
    table_name, record_id, operation, actor_id, old_values, new_values
  )
  values (
    tg_table_name,
    row_id,
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

insert into public.system_metadata (key, value, updated_at)
values ('database_revision', '0.2.1', now())
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

commit;
