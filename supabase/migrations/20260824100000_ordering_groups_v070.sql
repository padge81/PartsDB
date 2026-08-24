begin;

create table public.part_order_groups (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.part_order_group_members (
  group_id uuid not null references public.part_order_groups(id) on delete cascade,
  part_id uuid not null references public.parts(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (group_id, part_id),
  constraint part_order_group_members_part_unique unique (part_id)
);

create index part_order_group_members_group_idx on public.part_order_group_members (group_id);

alter table public.part_order_groups enable row level security;
alter table public.part_order_group_members enable row level security;

create policy part_order_groups_read on public.part_order_groups
for select to authenticated using (true);
create policy part_order_groups_admin on public.part_order_groups
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy part_order_group_members_read on public.part_order_group_members
for select to authenticated using (true);
create policy part_order_group_members_admin on public.part_order_group_members
for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.part_order_groups, public.part_order_group_members to authenticated;

create trigger audit_part_order_groups
after insert or update or delete on public.part_order_groups
for each row execute function public.write_audit_log();

create trigger audit_part_order_group_members
after insert or update or delete on public.part_order_group_members
for each row execute function public.write_audit_log();

create or replace function public.set_part_order_group(
  p_part_id uuid,
  p_related_part_ids uuid[],
  p_expand_existing_groups boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  desired_ids uuid[];
  target_group_id uuid;
  affected_group_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  if not exists (select 1 from public.parts where id = p_part_id) then
    raise exception 'Part does not exist';
  end if;

  select coalesce(array_agg(distinct candidate_id), '{}'::uuid[])
  into desired_ids
  from (
    select p_part_id as candidate_id
    union
    select unnest(coalesce(p_related_part_ids, '{}'::uuid[]))
    union
    select member.part_id
    from public.part_order_group_members member
    where p_expand_existing_groups
      and member.group_id in (
        select selected.group_id
        from public.part_order_group_members selected
        where selected.part_id = any(array_append(coalesce(p_related_part_ids, '{}'::uuid[]), p_part_id))
      )
  ) candidates
  where candidate_id is not null
    and exists (select 1 from public.parts where id = candidate_id);

  if coalesce(array_length(desired_ids, 1), 0) <= 1 then
    select group_id into target_group_id
    from public.part_order_group_members
    where part_id = p_part_id;

    delete from public.part_order_group_members where part_id = p_part_id;

    if target_group_id is not null and (select count(*) from public.part_order_group_members where group_id = target_group_id) < 2 then
      delete from public.part_order_groups where id = target_group_id;
    end if;
    return null;
  end if;

  select array_agg(distinct group_id)
  into affected_group_ids
  from public.part_order_group_members
  where part_id = any(desired_ids);

  insert into public.part_order_groups (created_by)
  values (auth.uid())
  returning id into target_group_id;

  delete from public.part_order_group_members where part_id = any(desired_ids);

  insert into public.part_order_group_members (group_id, part_id, added_by)
  select target_group_id, part_id, auth.uid()
  from unnest(desired_ids) part_id;

  delete from public.part_order_groups group_row
  where affected_group_ids is not null
    and group_row.id = any(affected_group_ids)
    and (select count(*) from public.part_order_group_members member where member.group_id = group_row.id) < 2;

  return target_group_id;
end;
$$;

grant execute on function public.set_part_order_group(uuid, uuid[], boolean) to authenticated;

create temporary table migrated_order_component_members on commit drop as
with recursive
edges(a, b) as (
  select part_id, related_part_id from public.commonly_ordered_parts
  union
  select related_part_id, part_id from public.commonly_ordered_parts
),
reach(origin, connected) as (
  select a, b from edges
  union
  select reach.origin, edges.b
  from reach
  join edges on edges.a = reach.connected
),
components as (
  select origin as part_id, min(connected::text)::uuid as root_id
  from reach
  group by origin
)
select distinct root_id, part_id
from components;

create temporary table migrated_order_component_groups on commit drop as
select root_id, gen_random_uuid() as group_id
from (select distinct root_id from migrated_order_component_members) roots;

insert into public.part_order_groups (id)
select group_id from migrated_order_component_groups;

insert into public.part_order_group_members (group_id, part_id)
select groups.group_id, members.part_id
from migrated_order_component_members members
join migrated_order_component_groups groups using (root_id)
on conflict (part_id) do nothing;

drop table public.commonly_ordered_parts;

insert into public.system_metadata (key, value, updated_at)
values ('database_revision', '0.7.0', now())
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

commit;
