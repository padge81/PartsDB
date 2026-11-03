-- Disposable local Supabase only. Fixtures and deliberate failures roll back.
begin;
insert into auth.users(id,email) values
 ('ee000000-0000-4000-8000-000000000001','catalogue-admin@example.invalid'),
 ('ee000000-0000-4000-8000-000000000002','catalogue-user@example.invalid');
update public.profiles set role='admin', is_active=true where id='ee000000-0000-4000-8000-000000000001';
insert into public.system_metadata(key,value) values('site_mode','live') on conflict(key) do update set value='live';
select set_config('request.jwt.claim.sub','ee000000-0000-4000-8000-000000000001',true);
set local role authenticated;

do $$ begin
 if not exists(select 1 from public.supply_types where code='unknown' and is_active) then raise exception 'Default is missing'; end if;
 update public.supply_types set name='Unknown (catalogue test)' where code='unknown';
 begin
  delete from public.supply_types where code='unknown';
  raise exception 'Default deletion was accepted';
 exception when raise_exception then if sqlerrm <> 'The built-in Unknown supply type cannot be removed' then raise; end if; end;
 begin
  update public.supply_types set is_active=false where code='unknown';
  raise exception 'Default deactivation was accepted';
 exception when raise_exception then if sqlerrm <> 'The built-in Unknown supply type must keep code unknown and remain active' then raise; end if; end;
 begin
  update public.supply_types set code='renamed-default' where code='unknown';
  raise exception 'Default code change was accepted';
 exception when raise_exception then if sqlerrm <> 'The built-in Unknown supply type must keep code unknown and remain active' then raise; end if; end;
 begin
  perform public.replace_and_deactivate_supply_type('unknown',null);
  raise exception 'Default RPC deactivation was accepted';
 exception when raise_exception then if sqlerrm <> 'The built-in Unknown supply type cannot be deactivated' then raise; end if; end;
 perform public.save_company('{"id":"ee000000-0000-4000-8000-000000000010","name":"Catalogue test company","roles":["manufacturer"],"supply_type":"unknown"}');
 perform public.save_company('{"id":"ee000000-0000-4000-8000-000000000010","name":"Catalogue test company","roles":["supplier","supplier"],"supply_type":"unknown"}');
 perform public.save_company('{"id":"ee000000-0000-4000-8000-000000000010","name":"Catalogue test company","roles":["supplier"],"supply_type":"unknown"}');
 if (select count(*) from public.company_roles where company_id='ee000000-0000-4000-8000-000000000010') <> 1 then raise exception 'Role retries duplicated roles'; end if;
 if not exists(select 1 from public.company_roles where company_id='ee000000-0000-4000-8000-000000000010' and role='supplier') then raise exception 'Role replacement failed'; end if;
end $$;

-- Force the second half of the transaction to fail after the company update.
reset role;
create function pg_temp.reject_catalogue_role() returns trigger language plpgsql as $$
begin
 if new.company_id='ee000000-0000-4000-8000-000000000010' and new.role='manufacturer' then raise exception 'Injected role failure'; end if;
 return new;
end $$;
create trigger catalogue_test_role_failure before insert on public.company_roles for each row execute function pg_temp.reject_catalogue_role();
set local role authenticated;
do $$ begin
 begin
  perform public.save_company('{"id":"ee000000-0000-4000-8000-000000000010","name":"Must roll back","roles":["manufacturer"],"supply_type":"unknown"}');
  raise exception 'Injected failure did not stop save';
 exception when raise_exception then if sqlerrm <> 'Injected role failure' then raise; end if; end;
 if (select name from public.companies where id='ee000000-0000-4000-8000-000000000010') <> 'Catalogue test company' then raise exception 'Company was partially saved'; end if;
 if not exists(select 1 from public.company_roles where company_id='ee000000-0000-4000-8000-000000000010' and role='supplier') then raise exception 'Roles were partially saved'; end if;
end $$;
reset role;
drop trigger catalogue_test_role_failure on public.company_roles;

-- Permission boundaries, including security-invoker enforcement and standby.
update public.system_metadata set value='standby' where key='site_mode';
set local role authenticated;
do $$ begin
 begin
  perform public.save_company('{"id":"ee000000-0000-4000-8000-000000000010","name":"Blocked","roles":["supplier"]}');
  raise exception 'Standby save accepted';
 exception when raise_exception then if sqlerrm <> 'Standby is read only' then raise; end if; end;
end $$;
reset role;
update public.system_metadata set value='live' where key='site_mode';
select set_config('request.jwt.claim.sub','ee000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 begin
  perform public.save_company('{"id":"ee000000-0000-4000-8000-000000000010","name":"Blocked","roles":["supplier"]}');
  raise exception 'Non-admin save accepted';
 exception when raise_exception then if sqlerrm <> 'Administrator access required' then raise; end if; end;
end $$;
reset role;
update public.profiles set is_active=false where id='ee000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','ee000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
 begin
  perform public.save_company('{"id":"ee000000-0000-4000-8000-000000000010","name":"Blocked","roles":["supplier"]}');
  raise exception 'Inactive administrator save accepted';
 exception when raise_exception then if sqlerrm <> 'Administrator access required' then raise; end if; end;
end $$;
reset role;
rollback;
