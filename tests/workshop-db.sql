-- Disposable local Supabase only. All fixtures are rolled back.
begin;
insert into auth.users(id,email) values
 ('aa000000-0000-4000-8000-000000000001','workshop-test-a@example.invalid'),
 ('aa000000-0000-4000-8000-000000000002','workshop-test-b@example.invalid');
insert into public.system_metadata(key,value) values('site_mode','live') on conflict(key) do update set value='live';
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.save_repair_log('{"id":"bb000000-0000-4000-8000-000000000001","title":"Test repair","job_date":"2026-10-05","status":"draft","steps":[],"parts":[]}'::jsonb,0);
do $$ begin
 if (select count(*) from public.repair_logs) <> 1 then raise exception 'Owner cannot read own log'; end if;
 begin
   perform public.save_repair_log('{"id":"bb000000-0000-4000-8000-000000000001","title":"Stale change","job_date":"2026-10-05","status":"draft","steps":[],"parts":[]}'::jsonb,0);
   raise exception 'Stale revision unexpectedly saved';
 exception when raise_exception then
   if sqlerrm not like 'This repair changed%' then raise; end if;
 end;
 begin
   perform public.save_repair_log('{"id":"bb000000-0000-4000-8000-000000000001","title":"Invalid completion","job_date":"2026-10-05","status":"completed","steps":[],"parts":[]}'::jsonb,1);
   raise exception 'Incomplete job marked complete';
 exception when check_violation then null; end;
 begin
   perform public.save_repair_log('{"id":"bb000000-0000-4000-8000-000000000001","title":"Broken FK update","job_date":"2026-10-05","status":"draft","steps":[],"parts":[{"part_id":"cc000000-0000-4000-8000-000000000001","quantity":1}]}'::jsonb,1);
   raise exception 'Invalid part reference accepted';
 exception when foreign_key_violation then null; end;
 if (select title from public.repair_logs limit 1) <> 'Test repair' or (select revision from public.repair_logs limit 1) <> 1 then raise exception 'Failed save was not atomic'; end if;
 begin
   perform public.save_repair_log('{"id":"bb000000-0000-4000-8000-000000000001","title":"Invalid mark","job_date":"2026-10-05","status":"draft","steps":[{"id":"step","annotations":[{"kind":"circle"}]}],"parts":[]}'::jsonb,1);
   raise exception 'Invalid annotation accepted';
 exception when raise_exception then if sqlerrm <> 'Invalid annotation' then raise; end if; end;
end $$;
insert into public.bench_references(id,owner_id,title,category,body) values('dd000000-0000-4000-8000-000000000001',auth.uid(),'Private note','Other','Private body');
reset role;
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.repair_logs) or exists(select 1 from public.bench_references) then raise exception 'Another user can read private records'; end if;
 begin
  update public.repair_logs set title='Not mine' where id='bb000000-0000-4000-8000-000000000001';
  raise exception 'Direct repair write accepted';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.bench_references(owner_id,title,category,body) values('aa000000-0000-4000-8000-000000000001','Spoofed','Other','Invalid');
   raise exception 'Spoofed owner was accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.system_metadata set value='standby' where key='site_mode';
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.repair_logs) <> 1 then raise exception 'Standby blocks reading'; end if;
 begin
   perform public.save_repair_log('{"id":"bb000000-0000-4000-8000-000000000001","title":"Standby mutation","job_date":"2026-10-05","status":"draft","steps":[],"parts":[]}'::jsonb,1);
   raise exception 'Standby write accepted';
 exception when raise_exception then if sqlerrm <> 'Standby is read only' then raise; end if; end;
 update public.bench_references set body='Should not save' where id='dd000000-0000-4000-8000-000000000001';
 if found then raise exception 'Standby reference edit accepted'; end if;
end $$;
reset role;
update public.profiles set is_active=false where id='aa000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.repair_logs) then raise exception 'Inactive user can read workshop'; end if;
end $$;
reset role;

-- Reference photos, categories and personal starter editions.
update public.profiles set is_active=true where id='aa000000-0000-4000-8000-000000000001';
update public.system_metadata set value='live' where key='site_mode';
insert into storage.objects(bucket_id,name) values
 ('reference-images','aa000000-0000-4000-8000-000000000001/dd000000-0000-4000-8000-000000000001/photo.webp');
set local role authenticated;
update public.bench_references set category='Power supplies',subcategory='ATX',starter_key='ATX 24-pin main power',
 photos='[{"id":"photo","path":"aa000000-0000-4000-8000-000000000001/dd000000-0000-4000-8000-000000000001/photo.webp","caption":"Connector view"}]'::jsonb
 where id='dd000000-0000-4000-8000-000000000001';
do $$ begin
 if not exists(select 1 from public.bench_references where category='Power supplies' and subcategory='ATX' and jsonb_array_length(photos)=1) then raise exception 'Reference photos/category not saved'; end if;
 if not exists(select 1 from storage.objects where bucket_id='reference-images') then raise exception 'Owner cannot read reference photo'; end if;
 begin
  update public.bench_references set photos='[{"id":"bad","path":"aa000000-0000-4000-8000-000000000002/dd000000-0000-4000-8000-000000000001/photo.webp"}]'::jsonb;
  raise exception 'Foreign image accepted';
 exception when raise_exception then if sqlerrm <> 'Invalid reference photo' then raise; end if; end;
 begin
  update public.bench_references set photos='[{"id":"missing","path":"aa000000-0000-4000-8000-000000000001/dd000000-0000-4000-8000-000000000001/missing.webp"}]'::jsonb;
  raise exception 'Missing upload accepted';
 exception when raise_exception then if sqlerrm <> 'Reference photo upload missing' then raise; end if; end;
 begin
  insert into public.bench_references(owner_id,title,category,body,starter_key) values(auth.uid(),'Duplicate','Other','Note','ATX 24-pin main power');
  raise exception 'Duplicate starter edition accepted';
 exception when unique_violation then null; end;
 begin
  update public.bench_references set category=' ';
  raise exception 'Empty category accepted';
 exception when check_violation then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='reference-images') then raise exception 'Other user can read reference images'; end if;
 begin
  insert into storage.objects(bucket_id,name) values('reference-images','aa000000-0000-4000-8000-000000000001/spoof.webp');
  raise exception 'Other user can upload to owner folder';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.system_metadata set value='standby' where key='site_mode';
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
 begin
  insert into storage.objects(bucket_id,name) values('reference-images','aa000000-0000-4000-8000-000000000001/standby.webp');
  raise exception 'Standby upload accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

update public.system_metadata set value='live' where key='site_mode';
insert into storage.objects(bucket_id,name) values('reference-documents','aa000000-0000-4000-8000-000000000001/dd000000-0000-4000-8000-000000000001/datasheet.pdf');
set local role authenticated;
update public.bench_references set documents='[{"id":"pdf","name":"Datasheet","bytes":1000,"path":"aa000000-0000-4000-8000-000000000001/dd000000-0000-4000-8000-000000000001/datasheet.pdf"}]'::jsonb;
do $$ begin
 if not exists(select 1 from public.bench_references where jsonb_array_length(documents)=1) then raise exception 'PDF not saved'; end if;
 begin
  update public.bench_references set documents='[{"id":"pdf","name":"Wrong owner","bytes":1000,"path":"aa000000-0000-4000-8000-000000000002/dd000000-0000-4000-8000-000000000001/datasheet.pdf"}]'::jsonb;
  raise exception 'Foreign PDF accepted';
 exception when raise_exception then if sqlerrm <> 'Invalid reference document' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='reference-documents') then raise exception 'Other user can read PDFs'; end if;
end $$;
reset role;
rollback;

-- Approval lifecycle, shared images, admin edits and direct-API bypass attempts.
begin;
insert into auth.users(id,email) values
 ('aa000000-0000-4000-8000-000000000011','approval-owner@example.invalid'),
 ('aa000000-0000-4000-8000-000000000012','approval-reader@example.invalid'),
 ('aa000000-0000-4000-8000-000000000013','approval-admin@example.invalid');
update public.profiles set role='admin' where id='aa000000-0000-4000-8000-000000000013';
update public.system_metadata set value='live' where key='site_mode';
insert into storage.objects(bucket_id,name) values
 ('repair-images','aa000000-0000-4000-8000-000000000011/bb000000-0000-4000-8000-000000000011/shared.webp'),
 ('repair-images','aa000000-0000-4000-8000-000000000011/bb000000-0000-4000-8000-000000000011/unused.webp'),
 ('repair-images','aa000000-0000-4000-8000-000000000013/bb000000-0000-4000-8000-000000000011/admin.webp');
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000011',true);
set local role authenticated;
select public.save_repair_log('{"id":"bb000000-0000-4000-8000-000000000011","title":"Approval fixture","job_date":"2026-10-09","status":"draft","machine_id":"00000000-0000-0000-0000-000000000201","steps":[{"id":"one","title":"First step","instruction":"","image_path":"aa000000-0000-4000-8000-000000000011/bb000000-0000-4000-8000-000000000011/shared.webp","annotations":[]}],"parts":[{"part_id":"00000000-0000-0000-0000-000000000501","quantity":1}],"publication_status":"approved"}',0);
do $$ begin
 if (select publication_status from public.repair_logs where id='bb000000-0000-4000-8000-000000000011')<>'private' then raise exception 'Client set publication status'; end if;
 begin
  update public.repair_logs set publication_status='approved';
  raise exception 'Direct approval bypass';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.repair_log_parts;
  raise exception 'Direct part deletion bypass';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000013',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.repair_logs where id='bb000000-0000-4000-8000-000000000011') then raise exception 'Admin sees unsubmitted draft'; end if;
 if exists(select 1 from storage.objects where bucket_id='repair-images' and name like '%/shared.webp') then raise exception 'Admin sees private photo'; end if;
 if exists(select 1 from public.audit_log where table_name='repair_logs' and record_id='bb000000-0000-4000-8000-000000000011') then raise exception 'Private draft leaked to audit'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000011',true);
set local role authenticated;
select public.transition_repair_log('bb000000-0000-4000-8000-000000000011',1,'submit');
do $$ declare doc jsonb; begin
 select to_jsonb(l)||'{"parts":[]}'::jsonb into doc from public.repair_logs l where id='bb000000-0000-4000-8000-000000000011';
 begin
  perform public.save_repair_log(doc,2);raise exception 'Owner edited pending repair';
 exception when raise_exception then if sqlerrm not like 'This repair is read only%' then raise; end if; end;
 begin
  perform public.transition_repair_log('bb000000-0000-4000-8000-000000000011',2,'approve');
  raise exception 'Creator self-approved';
 exception when raise_exception then if sqlerrm<>'An administrator must review a pending repair' then raise; end if; end;
 -- Match the Storage API session flag in this rolled-back disposable test.
 perform set_config('storage.allow_delete_query','true',true);
 delete from storage.objects where bucket_id='repair-images' and name like '%/shared.webp';
 if found then raise exception 'Creator deleted submitted photo'; end if;
 perform set_config('storage.allow_delete_query','false',true);
end $$;
-- Withdrawal restores editing; resubmission gets a fresh revision.
select public.transition_repair_log('bb000000-0000-4000-8000-000000000011',2,'withdraw');
select public.transition_repair_log('bb000000-0000-4000-8000-000000000011',3,'submit');
reset role;
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000012',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.repair_logs where id='bb000000-0000-4000-8000-000000000011') then raise exception 'Reader sees pending repair'; end if;
 if exists(select 1 from public.repair_log_parts where repair_log_id='bb000000-0000-4000-8000-000000000011') then raise exception 'Reader sees pending parts'; end if;
 if exists(select 1 from storage.objects where bucket_id='repair-images') then raise exception 'Reader sees private photos'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000013',true);
set local role authenticated;
do $$ declare doc jsonb; begin
 if not exists(select 1 from storage.objects where bucket_id='repair-images' and name like '%/shared.webp') then raise exception 'Admin cannot see submitted photo'; end if;
 if exists(select 1 from storage.objects where bucket_id='repair-images' and name like '%/unused.webp') then raise exception 'Unused photo leaked to admin'; end if;
 select to_jsonb(l)||'{"parts":[{"part_id":"00000000-0000-0000-0000-000000000501","quantity":2}]}'::jsonb into doc from public.repair_logs l where id='bb000000-0000-4000-8000-000000000011';
 perform public.save_repair_log(doc||'{"title":"Reviewed repair"}'::jsonb,4);
 begin
  perform public.transition_repair_log('bb000000-0000-4000-8000-000000000011',4,'approve');
  raise exception 'Stale approval accepted';
 exception when raise_exception then if sqlerrm not like 'This repair changed%' then raise; end if; end;
end $$;
select public.transition_repair_log('bb000000-0000-4000-8000-000000000011',5,'approve','Reviewed and approved');
reset role;
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000012',true);
set local role authenticated;
do $$ declare doc jsonb; begin
 if not exists(select 1 from public.repair_logs where machine_id='00000000-0000-0000-0000-000000000201' and publication_status='approved') then raise exception 'Reader cannot find machine repair'; end if;
 if (select quantity from public.repair_log_parts where repair_log_id='bb000000-0000-4000-8000-000000000011')<>2 then raise exception 'Shared parts missing'; end if;
 if not exists(select 1 from storage.objects where bucket_id='repair-images' and name like '%/shared.webp') then raise exception 'Approved photo not shared'; end if;
 if exists(select 1 from storage.objects where bucket_id='repair-images' and name like '%/unused.webp') then raise exception 'Unused photo shared'; end if;
 select to_jsonb(l)||'{"parts":[]}'::jsonb into doc from public.repair_logs l where id='bb000000-0000-4000-8000-000000000011';
 begin perform public.save_repair_log(doc,6);raise exception 'Reader edited approved repair';
 exception when raise_exception then if sqlerrm not like 'This repair is read only%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000011',true);
set local role authenticated;
do $$ declare doc jsonb; begin
 select to_jsonb(l)||'{"parts":[]}'::jsonb into doc from public.repair_logs l where id='bb000000-0000-4000-8000-000000000011';
 begin perform public.save_repair_log(doc,6);raise exception 'Creator edited approved repair';
 exception when raise_exception then if sqlerrm not like 'This repair is read only%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000013',true);
set local role authenticated;
do $$ declare doc jsonb; begin
 select to_jsonb(l)||'{"parts":[]}'::jsonb into doc from public.repair_logs l where id='bb000000-0000-4000-8000-000000000011';
 perform public.save_repair_log(doc||'{"steps":[{"id":"two","title":"Admin photo","image_path":"aa000000-0000-4000-8000-000000000013/bb000000-0000-4000-8000-000000000011/admin.webp","annotations":[]}]}'::jsonb,6);
 if (select owner_id from public.repair_logs where id='bb000000-0000-4000-8000-000000000011')<>'aa000000-0000-4000-8000-000000000011' then raise exception 'Admin edit changed creator'; end if;
 begin perform public.transition_repair_log('bb000000-0000-4000-8000-000000000011',7,'return',' ');
 raise exception 'Return without note accepted';
 exception when raise_exception then if sqlerrm not like 'Add a review note%' then raise; end if; end;
end $$;
reset role;
update public.system_metadata set value='standby' where key='site_mode';
set local role authenticated;
do $$ begin
 begin perform public.transition_repair_log('bb000000-0000-4000-8000-000000000011',7,'return','Fix notes');
 raise exception 'Standby approval mutation accepted';
 exception when raise_exception then if sqlerrm<>'Standby is read only' then raise; end if; end;
end $$;
reset role;
update public.system_metadata set value='live' where key='site_mode';
set local role authenticated;
select public.transition_repair_log('bb000000-0000-4000-8000-000000000011',7,'return','Add test details');
reset role;
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000012',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.repair_logs where id='bb000000-0000-4000-8000-000000000011') then raise exception 'Returned repair still shared'; end if;
 if exists(select 1 from storage.objects where bucket_id='repair-images') then raise exception 'Returned photos still shared'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000011',true);
set local role authenticated;
do $$ declare doc jsonb; begin
 if not exists(select 1 from storage.objects where bucket_id='repair-images' and name like '%/admin.webp') then raise exception 'Creator cannot see admin photo after return'; end if;
 select to_jsonb(l)||'{"parts":[]}'::jsonb into doc from public.repair_logs l where id='bb000000-0000-4000-8000-000000000011';
 perform public.save_repair_log(doc||'{"tests":"Test details added"}'::jsonb,8);
end $$;
select public.transition_repair_log('bb000000-0000-4000-8000-000000000011',9,'submit');
reset role;
update public.profiles set is_active=false where id='aa000000-0000-4000-8000-000000000013';
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000013',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.repair_logs where id='bb000000-0000-4000-8000-000000000011') then raise exception 'Inactive admin reads submissions'; end if;
 begin perform public.transition_repair_log('bb000000-0000-4000-8000-000000000011',10,'approve');
 raise exception 'Inactive admin approved';
 exception when raise_exception then if sqlerrm<>'Active sign-in required' then raise; end if; end;
end $$;
reset role;
rollback;

-- Measurement annotations round-trip through the same protected save RPC.
begin;
insert into auth.users(id,email) values('aa000000-0000-4000-8000-000000000021','measurement-test@example.invalid');
update public.system_metadata set value='live' where key='site_mode';
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000021',true);
set local role authenticated;
select public.save_repair_log('{"id":"bb000000-0000-4000-8000-000000000021","title":"Measurement test","job_date":"2026-10-09","status":"draft","steps":[{"id":"measure","title":"Bolt spacing","instruction":"Record the dimension","image_path":"","annotations":[{"kind":"double_arrow","x":0.8,"y":0.2,"x2":0.1,"y2":0.9},{"kind":"arrow","x":0.1,"y":0.1,"x2":0.4,"y2":0.4}]}],"parts":[]}',0);
do $$ declare doc jsonb; begin
 select to_jsonb(l)||'{"parts":[]}'::jsonb into doc from public.repair_logs l where id='bb000000-0000-4000-8000-000000000021';
 if doc#>>'{steps,0,annotations,0,kind}'<>'double_arrow' or (doc#>>'{steps,0,annotations,0,x}')::numeric<>0.8 then raise exception 'Measurement arrow did not round-trip'; end if;
 perform public.save_repair_log(doc,1);
 begin
   perform public.save_repair_log(jsonb_set(doc,'{steps,0,annotations,0,x}','1.2'::jsonb),2);
   raise exception 'Out-of-bounds measurement accepted';
 exception when raise_exception then if sqlerrm<>'Invalid annotation' then raise; end if; end;
 begin
   perform public.save_repair_log(jsonb_set(doc,'{steps,0,annotations,0,kind}','"unknown"'::jsonb),2);
   raise exception 'Unknown annotation accepted';
 exception when raise_exception then if sqlerrm<>'Invalid annotation' then raise; end if; end;
end $$;
reset role;
rollback;
