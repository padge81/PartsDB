begin;

alter table public.bench_references
  add column photos jsonb not null default '[]'::jsonb,
  add column documents jsonb not null default '[]'::jsonb,
  add column starter_key text,
  add column subcategory text not null default '' check (length(subcategory)<=80);
create index bench_reference_categories on public.bench_references(owner_id,category,subcategory);
alter table public.bench_references drop constraint bench_references_category_check;
alter table public.bench_references add constraint bench_reference_category_length
  check (length(trim(category)) between 1 and 80);
alter table public.bench_references add constraint bench_reference_photos_array
  check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 12);
alter table public.bench_references add constraint bench_reference_starter_length
  check (starter_key is null or length(trim(starter_key)) between 1 and 200);
alter table public.bench_references add constraint bench_reference_documents_array
  check (jsonb_typeof(documents)='array' and jsonb_array_length(documents)<=10);
create unique index bench_reference_owner_starter on public.bench_references(owner_id,starter_key) where starter_key is not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('reference-images','reference-images',false,15728640,array['image/webp']);
create policy reference_images_read on storage.objects for select to authenticated
using (bucket_id='reference-images' and (storage.foldername(name))[1]=auth.uid()::text and public.workshop_active_user());
create policy reference_images_insert on storage.objects for insert to authenticated
with check (bucket_id='reference-images' and (storage.foldername(name))[1]=auth.uid()::text and public.workshop_active_user() and public.is_write_enabled());
create policy reference_images_delete on storage.objects for delete to authenticated
using (bucket_id='reference-images' and (storage.foldername(name))[1]=auth.uid()::text and public.workshop_active_user() and public.is_write_enabled());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('reference-documents','reference-documents',false,20971520,array['application/pdf']);
create policy reference_documents_read on storage.objects for select to authenticated
using (bucket_id='reference-documents' and (storage.foldername(name))[1]=auth.uid()::text and public.workshop_active_user());
create policy reference_documents_insert on storage.objects for insert to authenticated
with check (bucket_id='reference-documents' and (storage.foldername(name))[1]=auth.uid()::text and public.workshop_active_user() and public.is_write_enabled());
create policy reference_documents_delete on storage.objects for delete to authenticated
using (bucket_id='reference-documents' and (storage.foldername(name))[1]=auth.uid()::text and public.workshop_active_user() and public.is_write_enabled());

create function public.validate_reference_photos() returns trigger
language plpgsql security invoker set search_path='' as $$
declare photo jsonb; photo_path text;
begin
  if jsonb_typeof(new.photos) is distinct from 'array' or jsonb_array_length(new.photos)>12 then raise exception 'Invalid reference photos'; end if;
  for photo in select value from jsonb_array_elements(new.photos) loop
    photo_path := coalesce(photo->>'path','');
    if coalesce(photo->>'id','')='' or length(coalesce(photo->>'caption',''))>500
       or photo_path not like new.owner_id::text || '/' || new.id::text || '/%.webp'
       or photo_path like '%..%' or position(chr(92) in photo_path)>0
       or photo ? 'imageUrl' then raise exception 'Invalid reference photo'; end if;
    if not exists(select 1 from storage.objects where bucket_id='reference-images' and name=photo_path) then raise exception 'Reference photo upload missing'; end if;
  end loop;
  if jsonb_typeof(new.documents) is distinct from 'array' or jsonb_array_length(new.documents)>10 then raise exception 'Invalid reference documents'; end if;
  for photo in select value from jsonb_array_elements(new.documents) loop
    photo_path := coalesce(photo->>'path','');
    if coalesce(photo->>'id','')='' or length(trim(coalesce(photo->>'name',''))) not between 1 and 200
       or not coalesce((photo->>'bytes')::bigint between 1 and 20971520,false)
       or photo_path not like new.owner_id::text || '/' || new.id::text || '/%.pdf'
       or photo_path like '%..%' or position(chr(92) in photo_path)>0
       or photo ? 'url' then raise exception 'Invalid reference document'; end if;
    if not exists(select 1 from storage.objects where bucket_id='reference-documents' and name=photo_path) then raise exception 'Reference PDF upload missing'; end if;
  end loop;
  return new;
end $$;
revoke all on function public.validate_reference_photos() from public;
create trigger validate_reference_photos before insert or update on public.bench_references for each row execute function public.validate_reference_photos();

insert into public.system_metadata(key,value,updated_at) values('database_revision','0.10.0',now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;
commit;
