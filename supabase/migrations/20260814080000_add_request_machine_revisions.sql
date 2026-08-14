begin;

alter table public.part_requests
  add column if not exists machine_revision_ids uuid[] not null default '{}';

comment on column public.part_requests.machine_revision_ids is
  'Existing machine revisions selected as additional compatibility links during part request review.';

commit;
