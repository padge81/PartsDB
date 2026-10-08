begin;

alter table public.repair_logs
  add column publication_status text not null default 'private' check (publication_status in ('private','pending','approved','returned')),
  add column submitted_at timestamptz,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.profiles(id),
  add column review_notes text not null default '',
  add constraint published_repair_has_machine check (publication_status not in ('pending','approved') or (machine_id is not null and jsonb_array_length(steps)>0));
create index repair_logs_publication_machine on public.repair_logs(publication_status,machine_id,updated_at desc);

-- Writes go through checked, transactional RPCs. Clients cannot set approval or ownership directly.
revoke insert, update, delete on public.repair_logs, public.repair_log_parts from authenticated;
drop policy repair_logs_own on public.repair_logs;
drop policy repair_parts_own on public.repair_log_parts;
create policy repair_logs_visible on public.repair_logs for select to authenticated
using (public.workshop_active_user() and (owner_id=auth.uid() or publication_status='approved'
  or (public.is_admin() and publication_status in ('pending','returned'))));
create policy repair_parts_visible on public.repair_log_parts for select to authenticated
using (public.workshop_active_user() and exists(select 1 from public.repair_logs where id=repair_log_id));

-- Only attached images are shared. Unused images in another user's folder stay private.
create function public.repair_photo_visible(photo_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select public.workshop_active_user() and exists(
    select 1 from public.repair_logs l where
      (l.owner_id=auth.uid() or l.publication_status='approved' or (public.is_admin() and l.publication_status in ('pending','returned')))
      and l.steps @> jsonb_build_array(jsonb_build_object('image_path',photo_path))
  );
$$;
create function public.repair_photo_attached(photo_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.repair_logs l where l.steps @> jsonb_build_array(jsonb_build_object('image_path',photo_path)));
$$;
revoke all on function public.repair_photo_visible(text),public.repair_photo_attached(text) from public;
grant execute on function public.repair_photo_visible(text),public.repair_photo_attached(text) to authenticated;
drop policy repair_images_read on storage.objects;
create policy repair_images_read on storage.objects for select to authenticated using (
  bucket_id='repair-images' and public.workshop_active_user()
  and ((storage.foldername(name))[1]=auth.uid()::text or public.repair_photo_visible(name))
);
drop policy repair_images_delete on storage.objects;
create policy repair_images_delete on storage.objects for delete to authenticated using (
  bucket_id='repair-images' and (storage.foldername(name))[1]=auth.uid()::text
  and public.workshop_active_user() and public.is_write_enabled() and not public.repair_photo_attached(name)
);

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
      if coalesce(mark->>'kind','') not in ('circle','arrow','number') or
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


create function public.transition_repair_log(log_id uuid,expected_revision integer,action text,notes text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.repair_logs; saved public.repair_logs; next_status text;
begin
  if auth.uid() is null or not public.workshop_active_user() then raise exception 'Active sign-in required'; end if;
  if not public.is_write_enabled() then raise exception 'Standby is read only'; end if;
  select * into prior from public.repair_logs where id=log_id for update;
  if not found or not (prior.owner_id=auth.uid() or (public.is_admin() and prior.publication_status in ('pending','approved','returned'))) then
    raise exception 'Repair not available'; end if;
  if expected_revision is null or prior.revision<>expected_revision then raise exception 'This repair changed. Reload before reviewing or submitting.'; end if;
  if action='submit' then
    if prior.owner_id<>auth.uid() or prior.publication_status not in ('private','returned') then raise exception 'Only the creator can submit a private or returned repair'; end if;
    if prior.machine_id is null then raise exception 'Choose a catalogue machine before submitting'; end if;
    if jsonb_array_length(prior.steps)=0 then raise exception 'Add at least one step before submitting'; end if;
    next_status:='pending';
  elsif action='withdraw' then
    if prior.owner_id<>auth.uid() or prior.publication_status<>'pending' then raise exception 'Only the creator can withdraw a pending repair'; end if;
    next_status:='private';
  elsif action='approve' then
    if not public.is_admin() or prior.publication_status<>'pending' then raise exception 'An administrator must review a pending repair'; end if;
    next_status:='approved';
  elsif action='return' then
    if not public.is_admin() or prior.publication_status not in ('pending','approved') then raise exception 'Only an administrator can return this repair'; end if;
    if length(trim(coalesce(notes,'')))=0 then raise exception 'Add a review note explaining the changes needed'; end if;
    next_status:='returned';
  else raise exception 'Unknown review action';
  end if;
  update public.repair_logs set publication_status=next_status,
    submitted_at=case when action='submit' then now() else submitted_at end,
    reviewed_at=case when action in ('approve','return') then now() else null end,
    reviewed_by=case when action in ('approve','return') then auth.uid() else null end,
    review_notes=case when action in ('approve','return') then coalesce(notes,'') else '' end,
    revision=revision+1,updated_at=now()
  where id=log_id returning * into saved;
  return to_jsonb(saved);
end $$;
revoke all on function public.transition_repair_log(uuid,integer,text,text) from public;
grant execute on function public.transition_repair_log(uuid,integer,text,text) to authenticated;


-- Unsubmitted drafts do not enter the administrator-visible audit trail.
create function public.audit_shared_repair() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.publication_status<>'private' or (tg_op='UPDATE' and old.publication_status<>'private') then
    insert into public.audit_log(table_name,record_id,operation,actor_id,old_values,new_values)
    values('repair_logs',new.id::text,tg_op,auth.uid(),
      case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));
  end if;
  return new;
end $$;
revoke all on function public.audit_shared_repair() from public;
create trigger audit_repair_logs after insert or update on public.repair_logs
for each row execute function public.audit_shared_repair();

insert into public.system_metadata(key,value,updated_at) values('database_revision','0.11.0',now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;
commit;
