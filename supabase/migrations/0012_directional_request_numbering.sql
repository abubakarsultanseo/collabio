begin;

-- Keep the previous order within each direction, including undated imported rows.
alter table public.requests drop constraint requests_partner_number_unique;
create temporary table request_number_backfill on commit drop as
select id, partnership_id, partner_request_number as old_number,
  row_number() over (
    partition by sender_id, receiver_id
    order by partner_request_number, request_code
  ) as new_number
from public.requests;

-- A tracked exchange references the opening request's old workspace number.
-- If its opening request was deleted, clear the label instead of assigning it to another request.
alter table public.deals disable trigger deals_quota_history;
with opening_numbers as (
  select d.id, n.new_number
  from public.deals d
  left join request_number_backfill n
    on n.partnership_id = d.partnership_id and n.old_number = d.opening_request_number
  where d.opening_request_number is not null
)
update public.deals d set opening_request_number = n.new_number
from opening_numbers n
where d.id = n.id and d.opening_request_number is distinct from n.new_number;
alter table public.deals enable trigger deals_quota_history;

alter table public.requests disable trigger requests_protect_partner_number;
alter table public.requests disable trigger requests_touch_updated_at;
update public.requests r set partner_request_number = n.new_number
from request_number_backfill n
where r.id = n.id and r.partner_request_number is distinct from n.new_number;
alter table public.requests enable trigger requests_touch_updated_at;
drop trigger requests_protect_partner_number on public.requests;
alter table public.requests add constraint requests_directional_number_unique
  unique (sender_id, receiver_id, partner_request_number);

create table public.directional_request_counters (
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
group by sender_id, receiver_id;

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

create trigger requests_protect_partner_number
before update of partnership_id, sender_id, receiver_id, partner_request_number
on public.requests for each row execute function public.protect_partner_request_number();

drop table public.partnership_request_counters;

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
