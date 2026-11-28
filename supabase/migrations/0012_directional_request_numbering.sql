begin;

-- Block writes while moving from the workspace counters to directional counters.
lock table public.requests in access exclusive mode;

do $numbering$
declare
  workspace_number_columns smallint[];
  directional_number_columns smallint[];
  legacy_index record;
begin
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.requests'::regclass
      and attname = 'partner_request_number' and not attisdropped
  ) then
    raise exception 'Apply 0010_partner_request_exchanges.sql before 0012_directional_request_numbering.sql.';
  end if;

  select array_agg(attnum order by attname) into workspace_number_columns
  from pg_attribute
  where attrelid = 'public.requests'::regclass and not attisdropped
    and attname in ('partnership_id', 'partner_request_number');

  select array_agg(attnum order by attname) into directional_number_columns
  from pg_attribute
  where attrelid = 'public.requests'::regclass and not attisdropped
    and attname in ('sender_id', 'receiver_id', 'partner_request_number');

  -- Replace legacy workspace-level uniqueness wherever it exists. Some
  -- installations have already dropped it or use a different index name.
  for legacy_index in
    select idx.indexrelid::regclass as index_name, legacy.conname as constraint_name
    from pg_index idx
    left join pg_constraint legacy on legacy.conrelid = idx.indrelid
      and legacy.conindid = idx.indexrelid and legacy.contype = 'u'
    where idx.indrelid = 'public.requests'::regclass
      and idx.indisunique and not idx.indisprimary
      and idx.indnkeyatts = 2 and idx.indexprs is null and idx.indpred is null
      and idx.indkey[0:1]::smallint[] @> workspace_number_columns
  loop
    if legacy_index.constraint_name is not null then
      execute format('alter table public.requests drop constraint %I', legacy_index.constraint_name);
    else
      execute format('drop index %s', legacy_index.index_name);
    end if;
  end loop;

  -- Once migrated, leave established request numbers and any deletion gaps intact.
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.requests'::regclass
      and conname = 'requests_directional_number_unique' and contype = 'u'
      and cardinality(conkey) = 3 and conkey @> directional_number_columns
  ) then
    return;
  end if;

  if exists (
    select 1 from pg_constraint where conrelid = 'public.requests'::regclass
      and conname = 'requests_directional_number_unique'
  ) then
    raise exception 'Existing requests_directional_number_unique does not match the directional request columns.';
  end if;

  -- Keep the previous order within each direction, including undated imported rows.
  create temporary table request_number_backfill on commit drop as
  select id, partnership_id, sender_id, partner_request_number as old_number,
    row_number() over (
      partition by sender_id, receiver_id
      order by partner_request_number, request_code
    ) as new_number
  from public.requests;

  -- Resolve the old opening number against its sender before backfilling.
  -- Clear it when the opening request was deleted or cannot be uniquely identified.
  alter table public.deals disable trigger deals_quota_history;
  with opening_numbers as (
    select d.id, case when count(n.id) = 1 then min(n.new_number) end as new_number
    from public.deals d
    left join pg_temp.request_number_backfill n on n.partnership_id = d.partnership_id
      and n.sender_id = d.created_by and n.old_number = d.opening_request_number
    where d.opening_request_number is not null
    group by d.id
  )
  update public.deals d set opening_request_number = n.new_number
  from opening_numbers n
  where d.id = n.id and d.opening_request_number is distinct from n.new_number;
  alter table public.deals enable trigger deals_quota_history;

  drop trigger if exists requests_protect_partner_number on public.requests;
  alter table public.requests disable trigger requests_touch_updated_at;
  update public.requests r set partner_request_number = n.new_number
  from pg_temp.request_number_backfill n
  where r.id = n.id and r.partner_request_number is distinct from n.new_number;
  alter table public.requests enable trigger requests_touch_updated_at;
  alter table public.requests add constraint requests_directional_number_unique
    unique (sender_id, receiver_id, partner_request_number);
end;
$numbering$;

create table if not exists public.directional_request_counters (
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  last_number bigint not null,
  primary key (sender_id, receiver_id)
);

alter table public.directional_request_counters enable row level security;
revoke all on public.directional_request_counters from public, anon, authenticated;

insert into public.directional_request_counters (sender_id, receiver_id, last_number)
select sender_id, receiver_id, max(partner_request_number)
from public.requests
group by sender_id, receiver_id
on conflict (sender_id, receiver_id) do update
set last_number = excluded.last_number
where public.directional_request_counters.last_number < excluded.last_number;

create or replace function public.assign_partner_request_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.directional_request_counters (sender_id, receiver_id, last_number)
  values (new.sender_id, new.receiver_id, 1)
  on conflict (sender_id, receiver_id) do update
  set last_number = public.directional_request_counters.last_number + 1
  returning last_number into new.partner_request_number;
  return new;
end;
$$;

create or replace function public.protect_partner_request_number() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.partnership_id is distinct from old.partnership_id
    or new.sender_id is distinct from old.sender_id
    or new.receiver_id is distinct from old.receiver_id
    or new.partner_request_number is distinct from old.partner_request_number then
    raise exception 'A request keeps its original sender, receiver, workspace, and request number.';
  end if;
  return new;
end;
$$;

drop trigger if exists requests_protect_partner_number on public.requests;
create trigger requests_protect_partner_number
before update of partnership_id, sender_id, receiver_id, partner_request_number
on public.requests for each row execute function public.protect_partner_request_number();

drop table if exists public.partnership_request_counters;

-- The exchange creator is the sender of the opening request.
create or replace view public.tracked_exchange_balances with (security_invoker = true) as
with progress as (
  select d.id, d.partnership_id, d.name, d.status, d.side_a_quota, d.side_b_quota,
    d.first_link_side, d.first_link_live_at, d.opening_request_number, d.created_at,
    count(r.id) filter (where r.receiver_id = p.user_a_id)::integer as side_a_live,
    count(r.id) filter (where r.receiver_id = p.user_b_id)::integer as side_b_live,
    d.created_by as opening_request_sender_id
  from public.deals d
  join public.partnerships p on p.id = d.partnership_id
  left join public.requests r on r.deal_id = d.id and r.status = 'live'
  where d.first_link_side is not null
  group by d.id
)
select id, partnership_id, name, status, side_a_quota, side_b_quota,
  first_link_side, first_link_live_at, opening_request_number, created_at, side_a_live, side_b_live,
  case when status <> 'open' then 0
    when first_link_side = 'a' or first_link_live_at is not null then greatest(0, side_a_quota - side_a_live)
    else 0 end as side_a_due,
  case when status <> 'open' then 0
    when first_link_side = 'b' or first_link_live_at is not null then greatest(0, side_b_quota - side_b_live)
    else 0 end as side_b_due,
  opening_request_sender_id
from progress;

commit;
