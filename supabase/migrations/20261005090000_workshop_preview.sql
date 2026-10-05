begin;

-- Private workshop records. Existing catalogue tables remain unchanged.
create table public.repair_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  machine_id uuid references public.machines(id),
  machine_name text not null default '',
  title text not null check (length(trim(title)) between 1 and 200),
  technician text not null default '',
  job_date date not null default current_date,
  fault text not null default '',
  tools text not null default '',
  tests text not null default '',
  outcome text not null default '',
  status text not null default 'draft' check (status in ('draft','in_progress','completed')),
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 60),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (status <> 'completed' or (length(trim(tests)) > 0 and length(trim(outcome)) > 0))
);
create index repair_logs_owner_updated on public.repair_logs(owner_id, updated_at desc);
create index repair_logs_machine on public.repair_logs(machine_id);
create table public.repair_log_parts (
  repair_log_id uuid not null references public.repair_logs(id) on delete cascade,
  part_id uuid not null references public.parts(id),
  quantity numeric not null check (quantity > 0 and quantity < 1000000),
  primary key (repair_log_id, part_id)
);
create index repair_log_parts_part on public.repair_log_parts(part_id);
create table public.bench_references (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  title text not null check (length(trim(title)) between 1 and 200),
  category text not null check (category in ('Pinouts','Threads','Connectors','Bolt heads','Other')),
  body text not null check (length(trim(body)) > 0),
  source_url text not null default '' check (source_url = '' or source_url ~* '^https?://'),
  status text not null default 'draft' check (status in ('draft','checked')),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
create index bench_references_owner on public.bench_references(owner_id);

create function public.workshop_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and is_active);
$$;
revoke all on function public.workshop_active_user() from public;
grant execute on function public.workshop_active_user() to authenticated;

alter table public.repair_logs enable row level security;
alter table public.repair_log_parts enable row level security;
alter table public.bench_references enable row level security;
create policy repair_logs_own on public.repair_logs for all to authenticated
using (owner_id = auth.uid() and public.workshop_active_user())
with check (owner_id = auth.uid() and public.workshop_active_user());
create policy repair_parts_own on public.repair_log_parts for all to authenticated
using (exists(select 1 from public.repair_logs where id = repair_log_id and owner_id = auth.uid()))
with check (exists(select 1 from public.repair_logs where id = repair_log_id and owner_id = auth.uid()));
create policy bench_references_own on public.bench_references for all to authenticated
using (owner_id = auth.uid() and public.workshop_active_user())
with check (owner_id = auth.uid() and public.workshop_active_user());
do $$ declare name text; begin
  foreach name in array array['repair_logs','repair_log_parts','bench_references'] loop
    execute format('create policy workshop_insert_enabled on public.%I as restrictive for insert to authenticated with check (public.is_write_enabled())',name);
    execute format('create policy workshop_update_enabled on public.%I as restrictive for update to authenticated using (public.is_write_enabled()) with check (public.is_write_enabled())',name);
    execute format('create policy workshop_delete_enabled on public.%I as restrictive for delete to authenticated using (public.is_write_enabled())',name);
  end loop;
end $$;
grant select, insert, update, delete on public.repair_logs, public.repair_log_parts, public.bench_references to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('repair-images','repair-images',false,15728640,array['image/webp']) on conflict(id) do nothing;
create policy repair_images_read on storage.objects for select to authenticated
using (bucket_id = 'repair-images' and (storage.foldername(name))[1] = auth.uid()::text and public.workshop_active_user());
create policy repair_images_insert on storage.objects for insert to authenticated
with check (bucket_id = 'repair-images' and (storage.foldername(name))[1] = auth.uid()::text and public.workshop_active_user() and public.is_write_enabled());
create policy repair_images_delete on storage.objects for delete to authenticated
using (bucket_id = 'repair-images' and (storage.foldername(name))[1] = auth.uid()::text and public.workshop_active_user() and public.is_write_enabled());

-- One transaction for the record and catalogue links, with a revision guard.
create function public.save_repair_log(document jsonb, expected_revision integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
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
  for step in select value from jsonb_array_elements(document->'steps') loop
    if coalesce(step->>'id','') = '' or jsonb_typeof(step->'annotations') is distinct from 'array' then raise exception 'Invalid step'; end if;
    path := coalesce(step->>'image_path','');
    if path <> '' and (path not like auth.uid()::text || '/' || log_id::text || '/%.webp' or path like '%..%' or position(chr(92) in path) > 0) then raise exception 'Invalid photo path'; end if;
    if path <> '' and not exists(select 1 from storage.objects where bucket_id='repair-images' and name=path) then raise exception 'Photo upload missing'; end if;
    for mark in select value from jsonb_array_elements(step->'annotations') loop
      if coalesce(mark->>'kind','') not in ('circle','arrow','number') or
        not coalesce((mark->>'x')::numeric between 0 and 1 and (mark->>'y')::numeric between 0 and 1 and (mark->>'x2')::numeric between 0 and 1 and (mark->>'y2')::numeric between 0 and 1, false)
      then raise exception 'Invalid annotation'; end if;
    end loop;
  end loop;
  select * into prior from public.repair_logs where id=log_id for update;
  if found then
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
  return jsonb_build_object('revision',saved.revision,'updated_at',saved.updated_at);
end $$;
revoke all on function public.save_repair_log(jsonb,integer) from public;
grant execute on function public.save_repair_log(jsonb,integer) to authenticated;

-- Legacy catalogue restore must not erase images then encounter workshop FKs.
create function public.workshop_catalog_restore_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() and not exists(select 1 from public.repair_logs);
$$;
revoke all on function public.workshop_catalog_restore_allowed() from public;
grant execute on function public.workshop_catalog_restore_allowed() to authenticated;

insert into public.system_metadata(key,value,updated_at) values('database_revision','0.9.0',now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;
commit;
