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
 update public.repair_logs set title='Not mine' where id='bb000000-0000-4000-8000-000000000001';
 if found then raise exception 'Another user can edit private records'; end if;
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
