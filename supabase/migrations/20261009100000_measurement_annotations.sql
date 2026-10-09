begin;

-- Extend the annotation vocabulary without changing approval or ownership rules.
create or replace function public.save_repair_log(document jsonb, expected_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  log_id uuid := (document->>'id')::uuid;
  prior public.repair_logs;
  saved public.repair_logs;
  step jsonb;
  mark jsonb;
  path text;
begin
  if auth.uid() is null or not public.workshop_active_user() then raise exception 'Active sign-in required'; end if;
  if not public.is_write_enabled() then raise exception 'Standby is read only'; end if;
  if expected_revision is null or expected_revision < 0 then raise exception 'Invalid revision'; end if;
  if jsonb_typeof(document->'steps') is distinct from 'array' or jsonb_typeof(document->'parts') is distinct from 'array' then raise exception 'Steps and parts must be arrays'; end if;
  select * into prior from public.repair_logs where id=log_id for update;
  if found then
    if not ((prior.owner_id=auth.uid() and prior.publication_status in ('private','returned'))
      or (public.is_admin() and prior.publication_status in ('pending','approved','returned'))) then
      raise exception 'This repair is read only. Only an administrator can edit a submitted or approved repair.';
    end if;
    if prior.revision <> expected_revision then raise exception 'This repair changed on another device. Export your changes and reload before saving.'; end if;
  elsif expected_revision <> 0 then raise exception 'Repair no longer exists or access is unavailable';
  end if;
  for step in select value from jsonb_array_elements(document->'steps') loop
    if coalesce(step->>'id','') = '' or jsonb_typeof(step->'annotations') is distinct from 'array' then raise exception 'Invalid step'; end if;
    path := coalesce(step->>'image_path','');
    if path <> '' and ((path not like auth.uid()::text || '/' || log_id::text || '/%.webp'
      and not exists(select 1 from jsonb_array_elements(coalesce(prior.steps,'[]'::jsonb)) s where s->>'image_path'=path)) or path like '%..%' or position(chr(92) in path) > 0) then raise exception 'Invalid photo path'; end if;
    if path <> '' and not exists(select 1 from storage.objects where bucket_id='repair-images' and name=path) then raise exception 'Photo upload missing'; end if;
    for mark in select value from jsonb_array_elements(step->'annotations') loop
      if coalesce(mark->>'kind','') not in ('circle','arrow','double_arrow','number') or
        not coalesce((mark->>'x')::numeric between 0 and 1 and (mark->>'y')::numeric between 0 and 1 and (mark->>'x2')::numeric between 0 and 1 and (mark->>'y2')::numeric between 0 and 1, false)
      then raise exception 'Invalid annotation'; end if;
    end loop;
  end loop;
  if prior.id is not null then
    if prior.revision <> expected_revision then raise exception 'This repair changed on another device. Export your changes and reload before saving.'; end if;
    update public.repair_logs set
      title=document->>'title', machine_id=nullif(document->>'machine_id','')::uuid,
      machine_name=coalesce(document->>'machine_name',''), technician=coalesce(document->>'technician',''),
      job_date=(document->>'job_date')::date, fault=coalesce(document->>'fault',''),
      tools=coalesce(document->>'tools',''), tests=coalesce(document->>'tests',''), outcome=coalesce(document->>'outcome',''),
      status=document->>'status', steps=document->'steps', revision=prior.revision+1, updated_at=now()
    where id=log_id returning * into saved;
  else
    if expected_revision <> 0 then raise exception 'Repair no longer exists or access is unavailable'; end if;
    insert into public.repair_logs(id,owner_id,title,machine_id,machine_name,technician,job_date,fault,tools,tests,outcome,status,steps)
    values(log_id,auth.uid(),document->>'title',nullif(document->>'machine_id','')::uuid,
      coalesce(document->>'machine_name',''),coalesce(document->>'technician',''),(document->>'job_date')::date,
      coalesce(document->>'fault',''),coalesce(document->>'tools',''),coalesce(document->>'tests',''),coalesce(document->>'outcome',''),document->>'status',document->'steps') returning * into saved;
  end if;
  delete from public.repair_log_parts where repair_log_id=log_id;
  insert into public.repair_log_parts(repair_log_id,part_id,quantity)
  select log_id,(value->>'part_id')::uuid,(value->>'quantity')::numeric from jsonb_array_elements(document->'parts');
  return to_jsonb(saved);
end $$;
revoke all on function public.save_repair_log(jsonb,integer) from public;
grant execute on function public.save_repair_log(jsonb,integer) to authenticated;



insert into public.system_metadata(key,value,updated_at) values('database_revision','0.12.0',now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;
commit;
