begin;

-- Backup sessions grant access to exact files for a limited time. Ordinary
-- Workshop visibility and ownership policies are unchanged.
create table public.backup_jobs (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null references public.profiles(id),
  kind text not null check(kind in ('export','restore')), sections text[] not null,
  files jsonb not null default '[]', document jsonb, target_state text, mode text,
  result jsonb, created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '1 hour'
);
alter table public.backup_jobs enable row level security;
revoke all on public.backup_jobs from public, anon, authenticated;
create index backup_jobs_actor_expiry on public.backup_jobs(actor_id,expires_at);

create function public.backup_table_definitions()
returns table(ordinal integer, table_name text, section text, key_columns text[]) language sql immutable set search_path='' as $$
 values
 (1,'supply_types','reference',array['id']),(2,'companies','reference',array['id']),
 (3,'company_roles','reference',array['company_id','role']),(4,'machine_categories','reference',array['id']),
 (5,'machines','machines',array['id']),(6,'categories','reference',array['id']),
 (7,'parts','parts',array['id']),(8,'part_requests','requests',array['id']),
 (9,'part_suppliers','parts',array['id']),(10,'part_machines','parts',array['part_id','machine_id']),
 (11,'part_categories','parts',array['part_id','category_id']),(12,'part_order_groups','parts',array['id']),
 (13,'part_order_group_members','parts',array['group_id','part_id']),(14,'machine_images','machines',array['id']),
 (15,'part_images','parts',array['id']),(16,'request_images','requests',array['id']),
 (17,'repair_logs','repairs',array['id']),(18,'repair_log_parts','repairs',array['repair_log_id','part_id']),
 (19,'bench_references','bench',array['id']);
$$;
revoke all on function public.backup_table_definitions() from public, anon, authenticated;

create function public.backup_section_closure(selected text[])
returns text[] language plpgsql immutable set search_path='' as $$
declare allowed text[]:=array['reference','machines','parts','requests','repairs','bench']; result text[]:=selected;
begin
 if selected is null or cardinality(selected)=0 or exists(select 1 from unnest(selected) s where s is null or not(s=any(allowed))) then raise exception 'Select valid backup sections'; end if;
 if result && array['requests','repairs'] then result:=result||array['parts']; end if;
 if 'parts'=any(result) then result:=result||array['machines']; end if;
 if 'machines'=any(result) then result:=result||array['reference']; end if;
 return array(select s from unnest(allowed) s where s=any(result));
end $$;
revoke all on function public.backup_section_closure(text[]) from public, anon, authenticated;

create function public.backup_collect_tables(selected text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:='{}'; definition record; rows jsonb;
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 for definition in select * from public.backup_table_definitions() where section=any(selected) order by ordinal loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from public.%I t',definition.table_name) into rows;
  result:=result||jsonb_build_object(definition.table_name,rows);
 end loop;
 return result;
end $$;
revoke all on function public.backup_collect_tables(text[]) from public, anon, authenticated;

create function public.backup_file_references(tables jsonb)
returns table(bucket text,path text,record_id uuid,owner_id uuid) language sql immutable set search_path='' as $$
 select distinct bucket,path,record_id,owner_id from (
  select 'machine-images'::text bucket,r->>'storage_path' path,null::uuid record_id,null::uuid owner_id from jsonb_array_elements(coalesce(tables->'machine_images','[]')) r
  union all select 'part-images',r->>'storage_path',null::uuid,null::uuid from jsonb_array_elements(coalesce(tables->'part_images','[]')) r
  union all select 'request-images',r->>'storage_path',null::uuid,null::uuid from jsonb_array_elements(coalesce(tables->'request_images','[]')) r
  union all select 'repair-images',s->>'image_path',(r->>'id')::uuid,(r->>'owner_id')::uuid from jsonb_array_elements(coalesce(tables->'repair_logs','[]')) r cross join lateral jsonb_array_elements(r->'steps') s
  union all select 'reference-images',s->>'path',(r->>'id')::uuid,(r->>'owner_id')::uuid from jsonb_array_elements(coalesce(tables->'bench_references','[]')) r cross join lateral jsonb_array_elements(r->'photos') s
  union all select 'reference-documents',s->>'path',(r->>'id')::uuid,(r->>'owner_id')::uuid from jsonb_array_elements(coalesce(tables->'bench_references','[]')) r cross join lateral jsonb_array_elements(r->'documents') s
 ) f where coalesce(path,'')<>'';
$$;
revoke all on function public.backup_file_references(jsonb) from public, anon, authenticated;

create function public.backup_file_access(object_bucket text,object_name text,write_access boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select public.is_admin() and (not write_access or public.is_write_enabled()) and exists(
  select 1 from public.backup_jobs j cross join lateral jsonb_array_elements(j.files) f
  where j.actor_id=auth.uid() and j.expires_at>now() and (j.result is null or j.result->>'cancelled'='true')
   and (not write_access or j.kind='restore') and f->>'bucket'=object_bucket
   and case when j.kind='restore' then f->>'target_path' else f->>'path' end=object_name
 );
$$;
revoke all on function public.backup_file_access(text,text,boolean) from public, anon, authenticated;
grant execute on function public.backup_file_access(text,text,boolean) to authenticated;
create policy backup_session_files_read on storage.objects for select to authenticated using(public.backup_file_access(bucket_id,name,false));
create policy backup_session_files_insert on storage.objects for insert to authenticated with check(public.backup_file_access(bucket_id,name,true));
create policy backup_session_files_delete on storage.objects for delete to authenticated using(public.backup_file_access(bucket_id,name,true));

create function public.prepare_backup_export(selected_sections text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare selected text[]; tables jsonb; files jsonb; job uuid; definition record;
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 selected:=public.backup_section_closure(selected_sections);
 delete from public.backup_jobs where expires_at<=now();
 for definition in select * from public.backup_table_definitions() where section=any(selected) order by ordinal loop
  execute format('lock table public.%I in share mode',definition.table_name);
 end loop;
 tables:=public.backup_collect_tables(selected);
 if exists(select 1 from public.backup_file_references(tables) f left join storage.objects o on o.bucket_id=f.bucket and o.name=f.path where o.id is null) then raise exception 'A saved backup file is missing from storage. Repair the missing file before exporting.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('bucket',f.bucket,'path',f.path,'record_id',f.record_id,'owner_id',f.owner_id,
  'bytes',case when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else null end) order by f.bucket,f.path),'[]') into files
 from public.backup_file_references(tables) f join storage.objects o on o.bucket_id=f.bucket and o.name=f.path;
 insert into public.backup_jobs(actor_id,kind,sections,files) values(auth.uid(),'export',selected,files) returning id into job;
 insert into public.audit_log(table_name,record_id,operation,actor_id,new_values)
 values('backup',job::text,'INSERT',auth.uid(),jsonb_build_object('kind','export','sections',selected,'files',jsonb_array_length(files)));
 return jsonb_build_object('job_id',job,'sections',selected,'tables',tables,'files',files,
  'database_revision',(select value from public.system_metadata where key='database_revision'));
end $$;
revoke all on function public.prepare_backup_export(text[]) from public, anon, authenticated;
grant execute on function public.prepare_backup_export(text[]) to authenticated;

create function public.close_backup_job(job_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 delete from public.backup_jobs where id=job_id and actor_id=auth.uid();
end $$;
revoke all on function public.close_backup_job(uuid) from public, anon, authenticated;
grant execute on function public.close_backup_job(uuid) to authenticated;

create function public.prepare_backup_restore(document jsonb,selected_sections text[],file_inventory jsonb,restore_mode text default 'merge',confirmation text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 selected text[]; definition record; item jsonb; changed jsonb; items jsonb; field text; mapped_user uuid;
 job uuid:=gen_random_uuid(); files jsonb:='[]'; file record; inventory jsonb; target text; extension text;
 tables jsonb:=document; target_state text; record_owner uuid; supplier_links jsonb:='[]'; column_name text; default_id uuid; default_row jsonb; default_name text;
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 if not public.is_write_enabled() then raise exception 'Standby is read only'; end if;
 selected:=public.backup_section_closure(selected_sections);
 if cardinality(selected)<>cardinality(selected_sections) then raise exception 'Required linked sections are missing'; end if;
 if restore_mode not in ('merge','restore') then raise exception 'Invalid restore mode'; end if;
 if restore_mode='restore' and (cardinality(selected)<>6 or confirmation<>'RESTORE') then raise exception 'Full replacement requires all six sections and RESTORE confirmation'; end if;
 if jsonb_typeof(tables) is distinct from 'object' or jsonb_typeof(file_inventory) is distinct from 'array' then raise exception 'Invalid backup data'; end if;
 if exists(select 1 from jsonb_object_keys(tables) k where not exists(select 1 from public.backup_table_definitions() d where d.table_name=k and d.section=any(selected))) then raise exception 'Unexpected backup table'; end if;
 for definition in select * from public.backup_table_definitions() where section=any(selected) order by ordinal loop
  if jsonb_typeof(tables->definition.table_name) is distinct from 'array' then raise exception 'Missing backup table %',definition.table_name; end if;
  for item in select value from jsonb_array_elements(tables->definition.table_name) loop
   if jsonb_typeof(item)<>'object' or exists(select 1 from unnest(definition.key_columns) k where nullif(item->>k,'') is null) then raise exception 'Invalid record key in %',definition.table_name; end if;
   for column_name in select jsonb_object_keys(item) loop
    if not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=to_regclass('public.'||definition.table_name) and a.attname=column_name and a.attnum>0 and not a.attisdropped and a.attgenerated='') then raise exception 'Unknown backup column %',column_name; end if;
   end loop;
  end loop;
  if exists(select 1 from (select (select jsonb_agg(r->k order by k) from unnest(definition.key_columns) k) as identity_key from jsonb_array_elements(tables->definition.table_name) r) keys group by identity_key having count(*)>1) then raise exception 'Duplicate backup keys in %',definition.table_name; end if;
 end loop;
 if 'reference'=any(selected) then
  select id into default_id from public.supply_types where code='unknown' and is_active;
  if default_id is null then raise exception 'The built-in Unknown supply type is unavailable'; end if;
  if not exists(select 1 from jsonb_array_elements(tables->'supply_types') r where r->>'code'='unknown') then
   select to_jsonb(s) into default_row from public.supply_types s where id=default_id;
   default_name:=default_row->>'name';
   while exists(select 1 from jsonb_array_elements(tables->'supply_types') r where r->>'name'=default_name) loop default_name:='Unknown (default '||gen_random_uuid()::text||')'; end loop;
   tables:=jsonb_set(tables,'{supply_types}',(tables->'supply_types')||jsonb_build_array(default_row||jsonb_build_object('name',default_name)));
  end if;
 end if;
 -- Preserve existing profile owners; missing source users map to the restoring
 -- administrator. Authentication accounts, passwords and server mode never import.
 for definition in select * from public.backup_table_definitions() where section=any(selected) order by ordinal loop
  items:='[]';
  for item in select value from jsonb_array_elements(tables->definition.table_name) loop
   changed:=item;
   foreach field in array array['created_by','updated_by','requested_by','reviewed_by','added_by','uploaded_by','owner_id'] loop
    if changed ? field and changed->>field is not null then
     mapped_user:=(changed->>field)::uuid;
     if not exists(select 1 from public.profiles where id=mapped_user) then mapped_user:=auth.uid(); end if;
     changed:=jsonb_set(changed,array[field],to_jsonb(mapped_user));
    end if;
   end loop;
   if definition.table_name='bench_references' and changed->>'owner_id' is distinct from item->>'owner_id' then
    changed:=changed||jsonb_build_object('starter_key',null);
   end if;
   if definition.table_name='supply_types' then
    if changed->>'code'='unknown' then changed:=changed||jsonb_build_object('id',default_id,'is_active',true);
    elsif (changed->>'id')::uuid=default_id then raise exception 'Backup supply type conflicts with the built-in default'; end if;
   end if;
   if definition.table_name='companies' and changed->>'default_supplier_id' is not null then
    supplier_links:=supplier_links||jsonb_build_array(jsonb_build_object('id',changed->>'id','default_supplier_id',changed->>'default_supplier_id'));
    changed:=changed||jsonb_build_object('default_supplier_id',null);
   end if;
   if definition.table_name in ('repair_logs','bench_references') then
    execute format('select owner_id from public.%I where id=$1',definition.table_name) into record_owner using (changed->>'id')::uuid;
    if record_owner is not null and record_owner<>(changed->>'owner_id')::uuid then raise exception 'A Workshop record ID belongs to another owner. No records were changed.'; end if;
   end if;
   items:=items||jsonb_build_array(changed);
  end loop;
  tables:=jsonb_set(tables,array[definition.table_name],items);
 end loop;
 for file in select * from public.backup_file_references(tables) loop
  select value into inventory from jsonb_array_elements(file_inventory) f where f->>'bucket'=file.bucket and f->>'path'=file.path;
  if inventory is null or not coalesce((inventory->>'bytes')::bigint between 0 and 20971520,false) then raise exception 'Invalid or missing file inventory'; end if;
  if file.path like '/%' or file.path ~ '(^|/)\.\.?(\/|$)' or position(chr(92) in file.path)>0 then raise exception 'Unsafe backup file path'; end if;
  extension:=case when file.bucket='reference-documents' then 'pdf' when lower(file.path) ~ '\.(png|jpe?g)$' and file.owner_id is null then substring(lower(file.path) from '\.([a-z]+)$') else 'webp' end;
  target:=case when file.owner_id is not null then file.owner_id::text||'/'||file.record_id::text||'/' else 'restore/'||job::text||'/' end||gen_random_uuid()::text||'.'||extension;
  files:=files||jsonb_build_array(jsonb_build_object('bucket',file.bucket,'path',file.path,'target_path',target,'bytes',(inventory->>'bytes')::bigint));
 end loop;
 if jsonb_array_length(files)<>jsonb_array_length(file_inventory) then raise exception 'Unexpected or duplicate backup file inventory'; end if;
 -- Record the destination state before uploading. Concurrent database edits
 -- cause apply to stop, rather than overwrite newer changes unexpectedly.
 target_state:=md5(public.backup_collect_tables(selected)::text);
 delete from public.backup_jobs where expires_at<=now();
 insert into public.backup_jobs(id,actor_id,kind,sections,files,document,target_state,mode)
 values(job,auth.uid(),'restore',selected,files,jsonb_build_object('tables',tables,'supplier_links',supplier_links),target_state,restore_mode);
 return jsonb_build_object('job_id',job,'sections',selected,'files',files,'mode',restore_mode,'expires_at',now()+interval '1 hour');
end $$;
revoke all on function public.prepare_backup_restore(jsonb,text[],jsonb,text,text) from public, anon, authenticated;
grant execute on function public.prepare_backup_restore(jsonb,text[],jsonb,text,text) to authenticated;

create function public.apply_backup_restore(job_id uuid)
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
    photos:='[]';
    for photo in select value from jsonb_array_elements(item->'steps') loop
     if coalesce(photo->>'id','')='' or jsonb_typeof(photo->'annotations') is distinct from 'array' then raise exception 'Invalid repair step'; end if;
     for mark in select value from jsonb_array_elements(photo->'annotations') loop
      if coalesce(mark->>'kind','') not in ('circle','arrow','double_arrow','number') or not coalesce((mark->>'x')::numeric between 0 and 1 and (mark->>'y')::numeric between 0 and 1 and (mark->>'x2')::numeric between 0 and 1 and (mark->>'y2')::numeric between 0 and 1,false) then raise exception 'Invalid repair annotation'; end if;
     end loop;
     if coalesce(photo->>'image_path','')<>'' then
      select f into mapping from jsonb_array_elements(job.files) f where f->>'bucket'='repair-images' and f->>'path'=photo->>'image_path';
      if mapping is null then raise exception 'Missing repair photo'; end if;
      photo:=jsonb_set(photo,'{image_path}',mapping->'target_path');
     end if;
     photos:=photos||jsonb_build_array(photo-'imageUrl');
    end loop;
    item:=jsonb_set(item,'{steps}',photos);
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

create function public.cancel_backup_restore(job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.backup_jobs;
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 select * into job from public.backup_jobs where id=job_id and actor_id=auth.uid() and kind='restore' for update;
 if not found then return jsonb_build_object('files','[]'::jsonb,'committed',false); end if;
 if job.result is not null and job.result->>'cancelled' is distinct from 'true' then return jsonb_build_object('files','[]'::jsonb,'committed',true); end if;
 update public.backup_jobs set result='{"cancelled":true}',document=null,expires_at=now()+interval '15 minutes' where id=job.id;
 return jsonb_build_object('files',job.files,'committed',false);
end $$;
revoke all on function public.cancel_backup_restore(uuid) from public, anon, authenticated;
grant execute on function public.cancel_backup_restore(uuid) to authenticated;

insert into public.system_metadata(key,value,updated_at) values('database_revision','0.15.0',now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;
commit;
