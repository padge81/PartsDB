-- Disposable Supabase only. No production data is modified.
begin;
insert into auth.users(id,email) values
 ('ff000000-0000-4000-8000-000000000001','backup-admin@example.invalid'),
 ('ff000000-0000-4000-8000-000000000002','backup-owner@example.invalid'),
 ('ff000000-0000-4000-8000-000000000003','backup-user@example.invalid');
update public.profiles set role='admin',is_active=true where id='ff000000-0000-4000-8000-000000000001';
update public.system_metadata set value='live' where key='site_mode';
insert into public.companies(name,supply_type)
select 'Backup pagination fixture '||n,'unknown' from generate_series(1,1005) n;
insert into storage.objects(bucket_id,name,owner_id,metadata) values
 ('repair-images','ff000000-0000-4000-8000-000000000002/ff000000-0000-4000-8000-000000000010/photo.webp','ff000000-0000-4000-8000-000000000002','{"size":5}'),
 ('repair-images','ff000000-0000-4000-8000-000000000002/unlinked.webp','ff000000-0000-4000-8000-000000000002','{"size":5}'),
 ('reference-documents','ff000000-0000-4000-8000-000000000002/ff000000-0000-4000-8000-000000000020/datasheet.pdf','ff000000-0000-4000-8000-000000000002','{"size":7}');
select set_config('request.jwt.claim.sub','ff000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.save_repair_log('{"id":"ff000000-0000-4000-8000-000000000010","title":"Private backup repair","job_date":"2026-11-04","status":"draft","steps":[{"id":"step","image_path":"ff000000-0000-4000-8000-000000000002/ff000000-0000-4000-8000-000000000010/photo.webp","annotations":[],"instruction":"Check the connection"}],"parts":[]}',0);
insert into public.bench_references(id,owner_id,title,category,body,photos,documents)
values('ff000000-0000-4000-8000-000000000020',auth.uid(),'Private reference','Connectors','Backup test','[]',
 '[{"id":"pdf","name":"Datasheet","bytes":7,"path":"ff000000-0000-4000-8000-000000000002/ff000000-0000-4000-8000-000000000020/datasheet.pdf"}]');
reset role;
select set_config('request.jwt.claim.sub','ff000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.repair_logs where id='ff000000-0000-4000-8000-000000000010') then raise exception 'Backup feature expanded normal private visibility'; end if;
 if exists(select 1 from storage.objects where name like '%/unlinked.webp') then raise exception 'Unlinked private file is visible'; end if;
end $$;
select set_config('test.backup',public.prepare_backup_export(array['reference','machines','parts','requests','repairs','bench'])::text,true);
reset role;
update public.profiles set role='admin' where id='ff000000-0000-4000-8000-000000000003';
select set_config('request.jwt.claim.sub','ff000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from storage.objects where name like '%/photo.webp') then raise exception 'Another administrator inherited a backup session'; end if;
 perform public.close_backup_job((current_setting('test.backup')::jsonb->>'job_id')::uuid);
end $$;
reset role;
update public.profiles set role='user' where id='ff000000-0000-4000-8000-000000000003';
select set_config('request.jwt.claim.sub','ff000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare snapshot jsonb:=current_setting('test.backup')::jsonb; begin
 if not exists(select 1 from jsonb_array_elements(snapshot->'tables'->'repair_logs') r where r->>'title'='Private backup repair') then raise exception 'Private repair missing from administrator backup'; end if;
 if jsonb_array_length(snapshot->'files')<>2 then raise exception 'Backup did not include exactly the linked Workshop files'; end if;
 if jsonb_array_length(snapshot->'tables'->'companies')<1005 then raise exception 'Backup truncated records at the REST page limit'; end if;
 if not exists(select 1 from storage.objects where name like '%/photo.webp') then raise exception 'Backup session cannot read its linked photo'; end if;
 if exists(select 1 from storage.objects where name like '%/unlinked.webp') then raise exception 'Backup session grants unrelated private files'; end if;
 perform public.close_backup_job((snapshot->>'job_id')::uuid);
 if exists(select 1 from storage.objects where name like '%/photo.webp') then raise exception 'Closing export did not revoke private file access'; end if;
end $$;

-- Partial restore: only selected records change; all other sections survive.
select set_config('test.bench',public.prepare_backup_export(array['bench'])::text,true);
select set_config('test.plan',public.prepare_backup_restore((current_setting('test.bench')::jsonb)->'tables',array['bench'],(current_setting('test.bench')::jsonb)->'files')::text,true);
insert into storage.objects(bucket_id,name,owner_id,metadata)
select f->>'bucket',f->>'target_path',auth.uid()::text,jsonb_build_object('size',(f->>'bytes')::bigint) from jsonb_array_elements((current_setting('test.plan')::jsonb)->'files') f;
select public.apply_backup_restore((current_setting('test.plan')::jsonb->>'job_id')::uuid);
select public.apply_backup_restore((current_setting('test.plan')::jsonb->>'job_id')::uuid);
do $$ begin
 if not exists(select 1 from public.companies where id='00000000-0000-0000-0000-000000000101') then raise exception 'Partial restore deleted unrelated catalogue data'; end if;
 if jsonb_array_length(public.cancel_backup_restore((current_setting('test.plan')::jsonb->>'job_id')::uuid)->'files')<>0 then raise exception 'Cleanup would delete committed files'; end if;
end $$;
reset role;
do $$ begin
 if (select owner_id from public.bench_references where id='ff000000-0000-4000-8000-000000000020')<>'ff000000-0000-4000-8000-000000000002' then raise exception 'Restore did not preserve Workshop ownership'; end if;
 if (select revision from public.bench_references where id='ff000000-0000-4000-8000-000000000020')<>2 then raise exception 'Restore retry repeated the committed mutation'; end if;
end $$;
set local role authenticated;

-- Full replacement uses all sections and applies records atomically after files.
select public.save_company('{"id":"ff000000-0000-4000-8000-000000000030","name":"Not in archive","roles":["supplier"]}');
select set_config('test.fullplan',public.prepare_backup_restore(current_setting('test.backup')::jsonb->'tables',array['reference','machines','parts','requests','repairs','bench'],current_setting('test.backup')::jsonb->'files','restore','RESTORE')::text,true);
insert into storage.objects(bucket_id,name,owner_id,metadata)
select f->>'bucket',f->>'target_path',auth.uid()::text,jsonb_build_object('size',(f->>'bytes')::bigint) from jsonb_array_elements(current_setting('test.fullplan')::jsonb->'files') f;
select public.apply_backup_restore((current_setting('test.fullplan')::jsonb->>'job_id')::uuid);
do $$ begin
 if exists(select 1 from public.companies where id='ff000000-0000-4000-8000-000000000030') then raise exception 'Full replacement did not remove records absent from the archive'; end if;
 if not exists(select 1 from public.supply_types where code='unknown' and is_active) then raise exception 'Full replacement lost the protected default'; end if;
 if (select value from public.system_metadata where key='site_mode')<>'live' then raise exception 'Restore changed server mode'; end if;
end $$;

-- A later constraint failure must roll back earlier table writes as well.
select set_config('test.broken_tables',jsonb_set(jsonb_set(current_setting('test.backup')::jsonb->'tables','{companies,0,name}','"Must roll back"'),'{parts,0,manufacturer_id}','"ff000000-0000-4000-8000-000000000099"')::text,true);
select set_config('test.broken_plan',public.prepare_backup_restore(current_setting('test.broken_tables')::jsonb,array['reference','machines','parts','requests','repairs','bench'],current_setting('test.backup')::jsonb->'files')::text,true);
insert into storage.objects(bucket_id,name,owner_id,metadata)
select f->>'bucket',f->>'target_path',auth.uid()::text,jsonb_build_object('size',(f->>'bytes')::bigint) from jsonb_array_elements(current_setting('test.broken_plan')::jsonb->'files') f;
do $$ begin
 begin
  perform public.apply_backup_restore((current_setting('test.broken_plan')::jsonb->>'job_id')::uuid);
  raise exception 'Invalid foreign key did not stop restore';
 exception when foreign_key_violation then null; end;
 if exists(select 1 from public.companies where name='Must roll back') then raise exception 'Failed restore committed partial company changes'; end if;
 perform public.cancel_backup_restore((current_setting('test.broken_plan')::jsonb->>'job_id')::uuid);
end $$;

-- Concurrent edits and unsupported sections must fail before changing records.
select set_config('test.stale',public.prepare_backup_restore(current_setting('test.bench')::jsonb->'tables',array['bench'],current_setting('test.bench')::jsonb->'files')::text,true);
reset role;
update public.bench_references set body='A newer change' where id='ff000000-0000-4000-8000-000000000020';
set local role authenticated;
do $$ begin
 begin
  perform public.apply_backup_restore((current_setting('test.stale')::jsonb->>'job_id')::uuid);
  raise exception 'Stale restore was accepted';
 exception when raise_exception then if sqlerrm not like 'The database changed%' then raise; end if; end;
 begin
  perform public.prepare_backup_restore('{}',array['system_metadata'],'[]');
  raise exception 'Unexpected backup section accepted';
 exception when raise_exception then if sqlerrm<>'Select valid backup sections' then raise; end if; end;
 begin
  perform public.prepare_backup_restore(current_setting('test.bench')::jsonb->'tables',array['bench'],current_setting('test.bench')::jsonb->'files','restore','RESTORE');
  raise exception 'Partial destructive replacement accepted';
 exception when raise_exception then if sqlerrm<>'Full replacement requires all six sections and RESTORE confirmation' then raise; end if; end;
 perform public.cancel_backup_restore((current_setting('test.stale')::jsonb->>'job_id')::uuid);
 begin
  perform public.apply_backup_restore((current_setting('test.stale')::jsonb->>'job_id')::uuid);
  raise exception 'Cancelled restore accepted';
 exception when raise_exception then if sqlerrm<>'Restore session was cancelled' then raise; end if; end;
end $$;
reset role;
update public.profiles set is_active=false where id='ff000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 begin
  perform public.prepare_backup_export(array['bench']);raise exception 'Inactive administrator backup accepted';
 exception when raise_exception then if sqlerrm<>'Administrator access required' then raise; end if; end;
end $$;
reset role;
update public.profiles set is_active=true where id='ff000000-0000-4000-8000-000000000001';
update public.system_metadata set value='standby' where key='site_mode';
set local role authenticated;
select public.prepare_backup_export(array['bench']);
do $$ begin
 begin
  perform public.prepare_backup_restore(current_setting('test.bench')::jsonb->'tables',array['bench'],current_setting('test.bench')::jsonb->'files');
  raise exception 'Standby restore accepted';
 exception when raise_exception then if sqlerrm<>'Standby is read only' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','ff000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$ begin
 begin
  perform public.prepare_backup_export(array['bench']);raise exception 'Non-admin backup accepted';
 exception when raise_exception then if sqlerrm<>'Administrator access required' then raise; end if; end;
 begin
  perform * from public.backup_jobs;raise exception 'Backup sessions visible to ordinary users';
 exception when insufficient_privilege then null; end;
 if exists(select 1 from storage.objects where name like 'ff000000-0000-4000-8000-000000000002/%') then raise exception 'Ordinary user gained backup file permissions'; end if;
end $$;
reset role;
rollback;
