begin;

alter table public.repair_logs
 add column update_of uuid references public.repair_logs(id) deferrable initially deferred,
 add column update_base_revision integer,
 add column update_baseline jsonb,
 add column change_summary text default '',
 add constraint repair_update_shape check (
  (update_of is null and update_base_revision is null and update_baseline is null)
  or (update_of is not null and update_of<>id and update_base_revision is not null and update_base_revision>0 and update_baseline is not null and jsonb_typeof(update_baseline)='object' and publication_status<>'approved')),
 add constraint repair_change_summary_length check (length(coalesce(change_summary,''))<=4000);
create index repair_updates_parent_author on public.repair_logs(update_of,owner_id) where update_of is not null;

create function public.repair_update_snapshot(log_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('title',l.title,'machine_id',l.machine_id,'machine_name',l.machine_name,
  'technician',l.technician,'job_date',l.job_date,'fault',l.fault,'tools',l.tools,'tests',l.tests,'outcome',l.outcome,
  'status',l.status,'steps',l.steps,'parts',coalesce((select jsonb_agg(jsonb_build_object('part_id',p.part_id,'quantity',p.quantity,
    'description',c.description,'number',coalesce(c.manufacturer_part_number,'')) order by p.part_id)
    from public.repair_log_parts p join public.parts c on c.id=p.part_id where p.repair_log_id=l.id),'[]'::jsonb))
 from public.repair_logs l where l.id=log_id;
$$;
create function public.repair_update_comparable(document jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select (document-'parts')||jsonb_build_object('parts',coalesce((select jsonb_agg(jsonb_build_object('part_id',p->'part_id','quantity',p->'quantity') order by p->>'part_id') from jsonb_array_elements(document->'parts') p),'[]'::jsonb));
$$;
revoke all on function public.repair_update_snapshot(uuid),public.repair_update_comparable(jsonb) from public,anon,authenticated;

create function public.begin_repair_update(log_id uuid,expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare source public.repair_logs; draft public.repair_logs;
begin
 if not public.workshop_active_user() or auth.uid() is null then raise exception 'Active sign-in required'; end if;
 if not public.is_write_enabled() then raise exception 'Standby is read only'; end if;
 select * into source from public.repair_logs where id=log_id for update;
 if not found or source.publication_status<>'approved' or source.update_of is not null then raise exception 'Choose an approved repair to propose an update'; end if;
 if expected_revision is null or source.revision<>expected_revision then raise exception 'This repair changed. Reload before starting an update.'; end if;
 select * into draft from public.repair_logs where update_of=source.id and owner_id=auth.uid() order by updated_at desc,id limit 1;
 if found then return to_jsonb(draft); end if;
 insert into public.repair_logs(owner_id,title,machine_id,machine_name,technician,job_date,fault,tools,tests,outcome,status,steps,
  update_of,update_base_revision,update_baseline)
 values(auth.uid(),source.title,source.machine_id,source.machine_name,source.technician,source.job_date,source.fault,source.tools,source.tests,source.outcome,source.status,source.steps,
  source.id,source.revision,public.repair_update_snapshot(source.id)) returning * into draft;
 insert into public.repair_log_parts(repair_log_id,part_id,quantity) select draft.id,part_id,quantity from public.repair_log_parts where repair_log_id=source.id;
 return to_jsonb(draft);
end $$;
revoke all on function public.begin_repair_update(uuid,integer) from public,anon,authenticated;
grant execute on function public.begin_repair_update(uuid,integer) to authenticated;

-- Existing validation remains authoritative for ordinary drafts and image paths.
alter function public.save_repair_log(jsonb,integer) rename to save_repair_log_before_updates;
revoke all on function public.save_repair_log_before_updates(jsonb,integer) from public,anon,authenticated;
create function public.save_repair_log(document jsonb,expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior public.repair_logs; result jsonb;
begin
 if not public.workshop_active_user() or auth.uid() is null then raise exception 'Active sign-in required'; end if;
 if not public.is_write_enabled() then raise exception 'Standby is read only'; end if;
 select * into prior from public.repair_logs where id=(document->>'id')::uuid for update;
 if prior.publication_status='approved' then raise exception 'This repair is read only. Use Update log to prepare a separate update for approval.'; end if;
 result:=public.save_repair_log_before_updates(document,expected_revision);
 if prior.update_of is not null then
  update public.repair_logs set change_summary=trim(coalesce(document->>'change_summary','')) where id=prior.id returning to_jsonb(repair_logs) into result;
 end if;
 return result;
end $$;
revoke all on function public.save_repair_log(jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_repair_log(jsonb,integer) to authenticated;

create function public.refresh_repair_update_base(update_id uuid,expected_revision integer,expected_parent_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare draft public.repair_logs; source public.repair_logs; parent_id uuid;
begin
 if not public.workshop_active_user() or auth.uid() is null then raise exception 'Active sign-in required'; end if;
 if not public.is_write_enabled() then raise exception 'Standby is read only'; end if;
 select update_of into parent_id from public.repair_logs where id=update_id and owner_id=auth.uid();
 select * into source from public.repair_logs where id=parent_id for update;
 select * into draft from public.repair_logs where id=update_id and owner_id=auth.uid() for update;
 if draft.id is null or draft.update_of is null or draft.publication_status not in ('private','returned') then raise exception 'Only the update author can refresh a private or returned update'; end if;
 if draft.revision is distinct from expected_revision or source.revision is distinct from expected_parent_revision or source.publication_status<>'approved' then raise exception 'The repair changed. Reload before refreshing the comparison.'; end if;
 update public.repair_logs set update_base_revision=source.revision,update_baseline=public.repair_update_snapshot(source.id),
  publication_status='private',submitted_at=null,reviewed_at=null,reviewed_by=null,review_notes='',revision=revision+1,updated_at=now()
 where id=draft.id returning * into draft;
 return to_jsonb(draft);
end $$;
revoke all on function public.refresh_repair_update_base(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.refresh_repair_update_base(uuid,integer,integer) to authenticated;

alter function public.transition_repair_log(uuid,integer,text,text) rename to transition_repair_log_before_updates;
revoke all on function public.transition_repair_log_before_updates(uuid,integer,text,text) from public,anon,authenticated;
create function public.transition_repair_log(log_id uuid,expected_revision integer,action text,notes text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare draft public.repair_logs; source public.repair_logs; parent_id uuid; snapshot jsonb; result jsonb;
begin
 if not public.workshop_active_user() or auth.uid() is null then raise exception 'Active sign-in required'; end if;
 if not public.is_write_enabled() then raise exception 'Standby is read only'; end if;
 select update_of into parent_id from public.repair_logs where id=log_id;
 if parent_id is null then return public.transition_repair_log_before_updates(log_id,expected_revision,action,notes); end if;
 select * into source from public.repair_logs where id=parent_id for update;
 select * into draft from public.repair_logs where id=log_id for update;
 if draft.id is null or not (draft.owner_id=auth.uid() or (public.is_admin() and draft.publication_status in ('pending','returned'))) then raise exception 'Repair not available'; end if;
 if draft.revision is distinct from expected_revision then raise exception 'This repair changed. Reload before reviewing or submitting.'; end if;
 if action in ('submit','approve') then
  if source.id is null or source.publication_status<>'approved' then raise exception 'The original repair is no longer approved. The update cannot be published.'; end if;
  if source.revision<>draft.update_base_revision then raise exception 'The approved repair changed. Withdraw or return this update, then refresh its comparison before resubmitting.'; end if;
  if length(trim(coalesce(draft.change_summary,'')))=0 then raise exception 'Describe what changed before submitting an update'; end if;
  snapshot:=public.repair_update_snapshot(draft.id);
  if public.repair_update_comparable(snapshot)=public.repair_update_comparable(draft.update_baseline) then raise exception 'There are no repair changes to submit'; end if;
 end if;
 if action='approve' then
  if not public.is_admin() or draft.publication_status<>'pending' then raise exception 'An administrator must review a pending update'; end if;
  update public.repair_logs set title=draft.title,machine_id=draft.machine_id,machine_name=draft.machine_name,
   technician=draft.technician,job_date=draft.job_date,fault=draft.fault,tools=draft.tools,tests=draft.tests,outcome=draft.outcome,
   status=draft.status,steps=draft.steps,change_summary=draft.change_summary,submitted_at=draft.submitted_at,
   reviewed_at=now(),reviewed_by=auth.uid(),review_notes=coalesce(notes,''),revision=source.revision+1,updated_at=now()
  where id=source.id returning * into source;
  delete from public.repair_log_parts where repair_log_id=source.id;
  insert into public.repair_log_parts(repair_log_id,part_id,quantity) select source.id,part_id,quantity from public.repair_log_parts where repair_log_id=draft.id;
  insert into public.audit_log(table_name,record_id,operation,actor_id,old_values,new_values)
  values('repair_update_approval',source.id::text,'UPDATE',auth.uid(),draft.update_baseline,
   jsonb_build_object('update_id',draft.id,'submitted_by',draft.owner_id,'change_summary',draft.change_summary,'base_revision',draft.update_base_revision,'approved_revision',source.revision,'content',snapshot));
  delete from public.repair_log_parts where repair_log_id=draft.id;
  delete from public.repair_logs where id=draft.id;
  return to_jsonb(source)||jsonb_build_object('applied_update_id',draft.id);
 end if;
 return public.transition_repair_log_before_updates(log_id,expected_revision,action,notes);
end $$;
revoke all on function public.transition_repair_log(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.transition_repair_log(uuid,integer,text,text) to authenticated;

-- A proposal may retain a photo removed from its edited steps for comparison.
create or replace function public.repair_photo_visible(photo_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.workshop_active_user() and exists(select 1 from public.repair_logs l where
  (l.owner_id=auth.uid() or l.publication_status='approved' or (public.is_admin() and l.publication_status in ('pending','returned')))
  and (l.steps @> jsonb_build_array(jsonb_build_object('image_path',photo_path))
   or coalesce(l.update_baseline->'steps','[]'::jsonb) @> jsonb_build_array(jsonb_build_object('image_path',photo_path))));
$$;
create or replace function public.repair_photo_attached(photo_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.repair_logs l where l.steps @> jsonb_build_array(jsonb_build_object('image_path',photo_path))
  or coalesce(l.update_baseline->'steps','[]'::jsonb) @> jsonb_build_array(jsonb_build_object('image_path',photo_path)));
$$;
revoke all on function public.repair_photo_visible(text),public.repair_photo_attached(text) from public,anon,authenticated;
grant execute on function public.repair_photo_visible(text),public.repair_photo_attached(text) to authenticated;

alter function public.delete_repair_log(uuid,integer) rename to delete_repair_log_before_updates;
revoke all on function public.delete_repair_log_before_updates(uuid,integer) from public,anon,authenticated;
create function public.delete_repair_log(log_id uuid,expected_revision integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.workshop_active_user() or auth.uid() is null then raise exception 'Active sign-in required'; end if;
 if not public.is_write_enabled() then raise exception 'Standby is read only'; end if;
 if exists(select 1 from public.repair_logs where update_of=log_id) then raise exception 'This repair has update proposals. Remove those proposals before deleting the published repair.'; end if;
 perform public.delete_repair_log_before_updates(log_id,expected_revision);
end $$;
revoke all on function public.delete_repair_log(uuid,integer) from public,anon,authenticated;
grant execute on function public.delete_repair_log(uuid,integer) to authenticated;

-- Backup compatibility additions are appended below before the revision update.

create or replace function public.backup_file_references(tables jsonb)
returns table(bucket text,path text,record_id uuid,owner_id uuid) language sql immutable set search_path='' as $$
 select distinct on (bucket,path) bucket,path,record_id,owner_id from (
  select 'machine-images'::text bucket,r->>'storage_path' path,null::uuid record_id,null::uuid owner_id from jsonb_array_elements(coalesce(tables->'machine_images','[]')) r
  union all select 'part-images',r->>'storage_path',null::uuid,null::uuid from jsonb_array_elements(coalesce(tables->'part_images','[]')) r
  union all select 'request-images',r->>'storage_path',null::uuid,null::uuid from jsonb_array_elements(coalesce(tables->'request_images','[]')) r
  union all select 'repair-images',s->>'image_path',(r->>'id')::uuid,(r->>'owner_id')::uuid from jsonb_array_elements(coalesce(tables->'repair_logs','[]')) r cross join lateral jsonb_array_elements(r->'steps') s
  union all select 'repair-images',s->>'image_path',(r->>'id')::uuid,(r->>'owner_id')::uuid from jsonb_array_elements(coalesce(tables->'repair_logs','[]')) r cross join lateral jsonb_array_elements(coalesce(r->'update_baseline'->'steps','[]'::jsonb)) s
  union all select 'reference-images',s->>'path',(r->>'id')::uuid,(r->>'owner_id')::uuid from jsonb_array_elements(coalesce(tables->'bench_references','[]')) r cross join lateral jsonb_array_elements(r->'photos') s
  union all select 'reference-documents',s->>'path',(r->>'id')::uuid,(r->>'owner_id')::uuid from jsonb_array_elements(coalesce(tables->'bench_references','[]')) r cross join lateral jsonb_array_elements(r->'documents') s
 ) f where coalesce(path,'')<>'' order by bucket,path,record_id::text,owner_id::text;
$$;
revoke all on function public.backup_file_references(jsonb) from public, anon, authenticated;


create function public.restore_repair_update_steps(steps jsonb,files jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb:='[]'; photo jsonb; mark jsonb; mapping jsonb;
begin
 if jsonb_typeof(steps) is distinct from 'array' then raise exception 'Invalid repair steps'; end if;
 for photo in select value from jsonb_array_elements(steps) loop
  if coalesce(photo->>'id','')='' or jsonb_typeof(photo->'annotations') is distinct from 'array' then raise exception 'Invalid repair step'; end if;
  for mark in select value from jsonb_array_elements(photo->'annotations') loop
   if coalesce(mark->>'kind','') not in ('circle','arrow','double_arrow','number') or not coalesce((mark->>'x')::numeric between 0 and 1 and (mark->>'y')::numeric between 0 and 1 and (mark->>'x2')::numeric between 0 and 1 and (mark->>'y2')::numeric between 0 and 1,false) then raise exception 'Invalid repair annotation'; end if;
  end loop;
  if coalesce(photo->>'image_path','')<>'' then
   select f into mapping from jsonb_array_elements(files) f where f->>'bucket'='repair-images' and f->>'path'=photo->>'image_path';
   if mapping is null then raise exception 'Missing repair photo'; end if;
   photo:=jsonb_set(photo,'{image_path}',mapping->'target_path');
  end if;
  result:=result||jsonb_build_array(photo-'imageUrl');
 end loop;
 return result;
end $$;
revoke all on function public.restore_repair_update_steps(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.apply_backup_restore(job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.backup_jobs; definition record; tables jsonb; item jsonb; items jsonb; photo jsonb; photos jsonb;
 mapping jsonb; path text; key_name text; columns_sql text; updates_sql text; conflicts_sql text; records integer:=0; prior_revision integer; mark jsonb; allowed_role text;
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 if not public.is_write_enabled() then raise exception 'Standby is read only'; end if;
 select * into job from public.backup_jobs where id=job_id and actor_id=auth.uid() and kind='restore' and expires_at>now() for update;
 if not found then raise exception 'Restore session expired. Validate the backup again.'; end if;
 if job.result->>'cancelled'='true' then raise exception 'Restore session was cancelled'; end if;
 if job.result is not null then return job.result; end if;
 for definition in select * from public.backup_table_definitions() where section=any(job.sections) order by ordinal loop
  execute format('lock table public.%I in share row exclusive mode',definition.table_name);
 end loop;
 if md5(public.backup_collect_tables(job.sections)::text)<>job.target_state then raise exception 'The database changed while files were prepared. Validate the backup again; no records were changed.'; end if;
 if exists(select 1 from jsonb_array_elements(job.files) f left join storage.objects o on o.bucket_id=f->>'bucket' and o.name=f->>'target_path' where o.id is null
  or (o.metadata->>'size' ~ '^[0-9]+$' and (o.metadata->>'size')::bigint<>(f->>'bytes')::bigint)) then raise exception 'A restore file is missing or has the wrong size'; end if;
 tables:=job.document->'tables';
 for definition in select * from public.backup_table_definitions() where section=any(job.sections) order by ordinal loop
  items:='[]';
  for item in select value from jsonb_array_elements(tables->definition.table_name) loop
   if definition.table_name in ('machine_images','part_images','request_images') then
    allowed_role:=case definition.table_name when 'machine_images' then 'machine-images' when 'part_images' then 'part-images' else 'request-images' end;
    if item->>'storage_bucket'<>allowed_role then raise exception 'Invalid catalogue file bucket'; end if;
    select f into mapping from jsonb_array_elements(job.files) f where f->>'bucket'=allowed_role and f->>'path'=item->>'storage_path';
    if mapping is null then raise exception 'Missing restored catalogue file'; end if;
    item:=jsonb_set(item,'{storage_path}',mapping->'target_path');
   end if;
   if definition.table_name='repair_logs' then
    item:=jsonb_set(item,'{steps}',public.restore_repair_update_steps(item->'steps',job.files));
    if jsonb_typeof(item->'update_baseline')='object' then
     item:=jsonb_set(item,'{update_baseline,steps}',public.restore_repair_update_steps(item#>'{update_baseline,steps}',job.files));
    end if;
   end if;
   if definition.table_name='bench_references' then
    foreach key_name in array array['photos','documents'] loop
     photos:='[]';
     for photo in select value from jsonb_array_elements(item->key_name) loop
      select f into mapping from jsonb_array_elements(job.files) f where f->>'bucket'=case key_name when 'photos' then 'reference-images' else 'reference-documents' end and f->>'path'=photo->>'path';
      if mapping is null then raise exception 'Missing bench reference file'; end if;
      if key_name='documents' then photo:=jsonb_set(photo,'{bytes}',mapping->'bytes'); end if;
      photos:=photos||jsonb_build_array(jsonb_set(photo-'imageUrl'-'url','{path}',mapping->'target_path'));
     end loop;
     item:=jsonb_set(item,array[key_name],photos);
    end loop;
   end if;
   if definition.table_name in ('repair_logs','bench_references') then
    execute format('select revision from public.%I where id=$1',definition.table_name) into prior_revision using (item->>'id')::uuid;
    if prior_revision is not null then item:=item||jsonb_build_object('revision',greatest(prior_revision,(item->>'revision')::integer)+1,'updated_at',now()); end if;
   end if;
   items:=items||jsonb_build_array(item);
  end loop;
  tables:=jsonb_set(tables,array[definition.table_name],items);
 end loop;
 if job.mode='restore' then
  update public.companies set default_supplier_id=null where default_supplier_id is not null;
  for definition in select * from public.backup_table_definitions() order by ordinal desc loop
   execute format('delete from public.%I%s',definition.table_name,case when definition.table_name='supply_types' then ' where code<>''unknown''' else '' end);
  end loop;
 end if;
 for definition in select * from public.backup_table_definitions() where section=any(job.sections) order by ordinal loop
  select string_agg(format('%I',a.attname),',' order by a.attnum),string_agg(format('%I=excluded.%I',a.attname,a.attname),',' order by a.attnum) filter(where not(a.attname=any(definition.key_columns)))
   into columns_sql,updates_sql from pg_catalog.pg_attribute a where a.attrelid=to_regclass('public.'||definition.table_name) and a.attnum>0 and not a.attisdropped and a.attgenerated='';
  select string_agg(format('%I',k),',') into conflicts_sql from unnest(definition.key_columns) k;
  execute format('insert into public.%I(%s) select %s from jsonb_populate_recordset(null::public.%I,$1)%s on conflict(%s) do %s',
   definition.table_name,columns_sql,columns_sql,definition.table_name,case when definition.table_name='supply_types' then ' order by (code=''unknown'') desc' else '' end,conflicts_sql,case when updates_sql is null then 'nothing' else 'update set '||updates_sql end) using tables->definition.table_name;
  records:=records+jsonb_array_length(tables->definition.table_name);
 end loop;
 for item in select value from jsonb_array_elements(job.document->'supplier_links') loop
  update public.companies set default_supplier_id=(item->>'default_supplier_id')::uuid where id=(item->>'id')::uuid;
 end loop;
 update public.backup_jobs set document=null,result=jsonb_build_object('records',records,'files',jsonb_array_length(job.files),'sections',job.sections,'mode',job.mode) where id=job.id returning result into job.result;
 insert into public.audit_log(table_name,record_id,operation,actor_id,new_values) values('backup',job.id::text,'UPDATE',auth.uid(),job.result);
 return job.result;
end $$;
revoke all on function public.apply_backup_restore(uuid) from public, anon, authenticated;
grant execute on function public.apply_backup_restore(uuid) to authenticated;


insert into public.system_metadata(key,value,updated_at) values('database_revision','0.16.0',now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;
commit;
