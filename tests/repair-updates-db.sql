-- Disposable local database only. All fictional records are rolled back.
begin;
create temp table update_test_ids(kind text primary key,id uuid);
grant all on update_test_ids to authenticated;
create function pg_temp.expect_update_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then if sqlerrm like expected then return; else raise; end if; end;
 raise exception 'Expected failure: %',expected;
end $$;
insert into auth.users(id,email) values
 ('ae000000-0000-4000-8000-000000000001','update-original@example.invalid'),
 ('ae000000-0000-4000-8000-000000000002','update-author@example.invalid'),
 ('ae000000-0000-4000-8000-000000000003','update-reader@example.invalid'),
 ('ae000000-0000-4000-8000-000000000004','update-admin@example.invalid'),
 ('ae000000-0000-4000-8000-000000000005','update-inactive@example.invalid');
update public.profiles set role='admin' where id='ae000000-0000-4000-8000-000000000004';
update public.profiles set is_active=false where id='ae000000-0000-4000-8000-000000000005';
update public.system_metadata set value='live' where key='site_mode';
insert into storage.objects(bucket_id,name,metadata) values('repair-images','ae000000-0000-4000-8000-000000000001/be000000-0000-4000-8000-000000000001/original.webp','{"size":10}');
insert into public.repair_logs(id,owner_id,title,machine_id,machine_name,job_date,status,publication_status,revision,steps)
 values('be000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-000000000001','Original published log','00000000-0000-0000-0000-000000000201','Example machine','2026-11-04','completed','approved',7,
 '[{"id":"first","title":"Original step","instruction":"Original instruction","image_path":"ae000000-0000-4000-8000-000000000001/be000000-0000-4000-8000-000000000001/original.webp","annotations":[]}]');
insert into public.repair_log_parts(repair_log_id,part_id,quantity) values('be000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000501',1);

select set_config('request.jwt.claim.sub','ae000000-0000-4000-8000-000000000002',true);
set local role authenticated;
insert into update_test_ids select 'main',(public.begin_repair_update('be000000-0000-4000-8000-000000000001',7)->>'id')::uuid;
do $$ declare draft public.repair_logs; doc jsonb; begin
 select * into draft from public.repair_logs where id=(select id from update_test_ids where kind='main');
 if draft.owner_id<>auth.uid() or draft.publication_status<>'private' or draft.update_base_revision<>7 or draft.update_baseline->>'title'<>'Original published log' then raise exception 'Any active reader could not start a private update'; end if;
 if (public.begin_repair_update('be000000-0000-4000-8000-000000000001',7)->>'id')::uuid<>draft.id then raise exception 'Repeated begin created duplicate drafts'; end if;
 if not exists(select 1 from public.repair_log_parts where repair_log_id=draft.id and quantity=1) then raise exception 'Draft parts missing'; end if;
 if has_function_privilege('authenticated','public.save_repair_log_before_updates(jsonb,integer)','EXECUTE') or has_function_privilege('anon','public.repair_update_snapshot(uuid)','EXECUTE') or has_function_privilege('authenticated','public.transition_repair_log_before_updates(uuid,integer,text,text)','EXECUTE') then raise exception 'Internal RPC bypass exposed'; end if;
 perform pg_temp.expect_update_error(format('select public.transition_repair_log(%L,1,''submit'')',draft.id),'Describe what changed%');
 insert into storage.objects(bucket_id,name,metadata) values('repair-images',auth.uid()::text||'/'||draft.id::text||'/new.webp','{"size":11}');
 doc:=to_jsonb(draft)||jsonb_build_object('title','Proposed correction','parts',jsonb_build_array(jsonb_build_object('part_id','00000000-0000-0000-0000-000000000501','quantity',2)),
  'steps',jsonb_build_array(jsonb_build_object('id','first','title','Corrected step','instruction','Updated instruction','image_path',auth.uid()::text||'/'||draft.id::text||'/new.webp','annotations',jsonb_build_array(jsonb_build_object('kind','double_arrow','x',0.1,'y',0.2,'x2',0.8,'y2',0.7)))));
 perform public.save_repair_log(doc,1);
 perform pg_temp.expect_update_error(format('select public.transition_repair_log(%L,2,''submit'')',draft.id),'Describe what changed%');
 doc:=public.save_repair_log(doc||'{"change_summary":"Correct instructions, replace photo, add marking and adjust quantity"}',2);
 if (select title from public.repair_logs where id=draft.update_of)<>'Original published log' then raise exception 'Draft changed published content'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','ae000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.repair_logs where update_of is not null) then raise exception 'Private update leaked to another reader'; end if;
 if exists(select 1 from storage.objects where bucket_id='repair-images' and name like '%/new.webp') then raise exception 'Private update photo leaked'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','ae000000-0000-4000-8000-000000000004',true);
set local role authenticated;
do $$ begin if exists(select 1 from public.repair_logs where update_of is not null) then raise exception 'Unsubmitted draft leaked to admin'; end if; end $$;
reset role;
select set_config('request.jwt.claim.sub','ae000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.transition_repair_log((select id from update_test_ids where kind='main'),3,'submit');
select pg_temp.expect_update_error(format('select public.transition_repair_log(%L,4,''approve'')',(select id from update_test_ids where kind='main')),'An administrator must review%');
reset role;
select set_config('request.jwt.claim.sub','ae000000-0000-4000-8000-000000000004',true);
set local role authenticated;
do $$ begin
 if not exists(select 1 from public.repair_logs where id=(select id from update_test_ids where kind='main') and publication_status='pending') then raise exception 'Admin cannot review submitted update'; end if;
 if not exists(select 1 from storage.objects where name like '%/new.webp') then raise exception 'Admin cannot see proposed photo'; end if;
 if (select title from public.repair_logs where id='be000000-0000-4000-8000-000000000001')<>'Original published log' then raise exception 'Pending update replaced public version'; end if;
 perform pg_temp.expect_update_error(format('select public.save_repair_log(%L,7)',(select (to_jsonb(l)||'{"parts":[]}')::text from public.repair_logs l where id='be000000-0000-4000-8000-000000000001')),'This repair is read only%');
end $$;
-- Another proposal is approved first, creating a genuine stale-baseline conflict.
insert into update_test_ids select 'parallel',(public.begin_repair_update('be000000-0000-4000-8000-000000000001',7)->>'id')::uuid;
do $$ declare doc jsonb; begin
 select to_jsonb(l)||jsonb_build_object('title','Parallel approved correction','change_summary','Parallel correction','parts',jsonb_build_array(jsonb_build_object('part_id','00000000-0000-0000-0000-000000000501','quantity',1))) into doc from public.repair_logs l where id=(select id from update_test_ids where kind='parallel');
 perform public.save_repair_log(doc,1);
 perform public.transition_repair_log((doc->>'id')::uuid,2,'submit');
 perform public.transition_repair_log((doc->>'id')::uuid,3,'approve');
 perform pg_temp.expect_update_error(format('select public.transition_repair_log(%L,4,''approve'')',(select id from update_test_ids where kind='main')),'The approved repair changed%');
end $$;
reset role;
select set_config('request.jwt.claim.sub','ae000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.transition_repair_log((select id from update_test_ids where kind='main'),4,'withdraw');
select public.refresh_repair_update_base((select id from update_test_ids where kind='main'),5,8);
do $$ begin
 if (select title from public.repair_logs where id=(select id from update_test_ids where kind='main'))<>'Proposed correction' then raise exception 'Refresh destroyed draft work'; end if;
 if (select update_baseline->>'title' from public.repair_logs where id=(select id from update_test_ids where kind='main'))<>'Parallel approved correction' then raise exception 'Refresh did not use latest approved version'; end if;
end $$;
select public.transition_repair_log((select id from update_test_ids where kind='main'),6,'submit');
reset role;
select set_config('request.jwt.claim.sub','ae000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select public.transition_repair_log((select id from update_test_ids where kind='main'),7,'approve','Compared text, picture, markings and quantity');
do $$ begin
 if exists(select 1 from public.repair_logs where id=(select id from update_test_ids where kind='main')) then raise exception 'Applied proposal remained as duplicate log'; end if;
 if not exists(select 1 from public.repair_logs where id='be000000-0000-4000-8000-000000000001' and title='Proposed correction' and owner_id='ae000000-0000-4000-8000-000000000001' and publication_status='approved' and revision=9) then raise exception 'Approval lost identity, creator, status or content'; end if;
 if (select quantity from public.repair_log_parts where repair_log_id='be000000-0000-4000-8000-000000000001')<>2 then raise exception 'Approved parts not replaced'; end if;
 if not exists(select 1 from public.audit_log where table_name='repair_update_approval' and new_values->>'submitted_by'='ae000000-0000-4000-8000-000000000002') then raise exception 'Update author was not recorded'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','ae000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$ begin
 if not exists(select 1 from public.repair_logs where title='Proposed correction' and publication_status='approved') then raise exception 'Public reader cannot see approved correction'; end if;
 if not exists(select 1 from storage.objects where name like '%/new.webp') then raise exception 'Approved photo not shared'; end if;
end $$;
-- Summary-only changes do not count as repair updates.
insert into update_test_ids select 'empty',(public.begin_repair_update('be000000-0000-4000-8000-000000000001',9)->>'id')::uuid;
do $$ declare doc jsonb; begin
 select to_jsonb(l)||jsonb_build_object('change_summary','Only a summary','parts',jsonb_build_array(jsonb_build_object('part_id','00000000-0000-0000-0000-000000000501','quantity',2))) into doc from public.repair_logs l where id=(select id from update_test_ids where kind='empty');
 perform public.save_repair_log(doc,1);
 perform pg_temp.expect_update_error(format('select public.transition_repair_log(%L,2,''submit'')',(doc->>'id')::uuid),'There are no repair changes%');
 perform public.save_repair_log(doc||jsonb_build_object('update_of',doc->>'id','update_base_revision',999,'update_baseline',jsonb_build_object('title','Forged'),'publication_status','approved','owner_id','ae000000-0000-4000-8000-000000000004'),2);
 if not exists(select 1 from public.repair_logs where id=(doc->>'id')::uuid and owner_id=auth.uid() and publication_status='private' and update_of='be000000-0000-4000-8000-000000000001' and update_base_revision=9 and update_baseline->>'title'='Proposed correction') then raise exception 'Client forged protected update metadata'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','ae000000-0000-4000-8000-000000000005',true);
set local role authenticated;
select pg_temp.expect_update_error('select public.begin_repair_update(''be000000-0000-4000-8000-000000000001'',9)','Active sign-in required');
reset role;
update public.system_metadata set value='standby' where key='site_mode';
select set_config('request.jwt.claim.sub','ae000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.expect_update_error('select public.begin_repair_update(''be000000-0000-4000-8000-000000000001'',9)','Standby is read only');
reset role;
update public.system_metadata set value='live' where key='site_mode';
-- An approval failure after the published row changes rolls back the whole operation.
select set_config('request.jwt.claim.sub','ae000000-0000-4000-8000-000000000002',true);
set local role authenticated;
insert into update_test_ids select 'atomic',(public.begin_repair_update('be000000-0000-4000-8000-000000000001',9)->>'id')::uuid;
do $$ declare doc jsonb; begin
 select to_jsonb(l)||jsonb_build_object('title','Atomic approval fixture','change_summary','Exercise approval rollback','parts',jsonb_build_array(jsonb_build_object('part_id','00000000-0000-0000-0000-000000000501','quantity',3))) into doc from public.repair_logs l where id=(select id from update_test_ids where kind='atomic');
 perform public.save_repair_log(doc,1);
 perform public.transition_repair_log((doc->>'id')::uuid,2,'submit');
end $$;
reset role;
create function pg_temp.fail_update_part() returns trigger language plpgsql as $$ begin
 if new.repair_log_id='be000000-0000-4000-8000-000000000001' then raise exception 'Injected approval failure'; end if;
 return new;
end $$;
create trigger fail_update_part before insert on public.repair_log_parts for each row execute function pg_temp.fail_update_part();
select set_config('request.jwt.claim.sub','ae000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select pg_temp.expect_update_error(format('select public.transition_repair_log(%L,3,''approve'')',(select id from update_test_ids where kind='atomic')),'Injected approval failure');
do $$ begin
 if not exists(select 1 from public.repair_logs where id='be000000-0000-4000-8000-000000000001' and revision=9 and title='Proposed correction') then raise exception 'Failed approval partially changed the published repair'; end if;
 if (select quantity from public.repair_log_parts where repair_log_id='be000000-0000-4000-8000-000000000001')<>2 then raise exception 'Failed approval deleted original part links'; end if;
 if not exists(select 1 from public.repair_logs where id=(select id from update_test_ids where kind='atomic') and publication_status='pending') then raise exception 'Failed approval lost the pending update'; end if;
end $$;
reset role;
drop trigger fail_update_part on public.repair_log_parts;

-- Backups retain comparison pictures, deduplicate shared originals and rewrite their paths.
select set_config('request.jwt.claim.sub','ae000000-0000-4000-8000-000000000004',true);
set local role authenticated;
do $$ declare snap jsonb; plan jsonb; entry jsonb; old_path text; original_path text; restored public.repair_logs; begin
 snap:=public.prepare_backup_export(array['repairs']);
 if (select count(*) from jsonb_array_elements(snap->'files'))<>(select count(distinct (f->>'bucket')||'/'||(f->>'path')) from jsonb_array_elements(snap->'files') f) then raise exception 'Shared update photo exported twice'; end if;
 select r#>>'{update_baseline,steps,0,image_path}' into original_path from jsonb_array_elements(snap->'tables'->'repair_logs') r where r->>'id'=(select id::text from update_test_ids where kind='empty');
 plan:=public.prepare_backup_restore(snap->'tables',array(select jsonb_array_elements_text(snap->'sections')),snap->'files','merge','');
 for entry in select value from jsonb_array_elements(plan->'files') loop
  insert into storage.objects(bucket_id,name,metadata) values(entry->>'bucket',entry->>'target_path',jsonb_build_object('size',(entry->>'bytes')::bigint));
 end loop;
 perform public.apply_backup_restore((plan->>'job_id')::uuid);
 snap:=public.prepare_backup_export(array['repairs']);
 select (jsonb_populate_record(null::public.repair_logs,r)).* into restored from jsonb_array_elements(snap->'tables'->'repair_logs') r where r->>'id'=(select id::text from update_test_ids where kind='empty');
 old_path:=restored.update_baseline#>>'{steps,0,image_path}';
 if old_path is null or not exists(select 1 from storage.objects where bucket_id='repair-images' and name=old_path) then raise exception 'Restored update baseline photo is broken'; end if;
 if old_path=original_path then raise exception 'Baseline photo path was not rewritten'; end if;
end $$;
set constraints all immediate;
reset role;
rollback;
