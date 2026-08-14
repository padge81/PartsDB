begin;

alter table public.part_requests
add column if not exists category_ids uuid[] not null default '{}';

commit;
