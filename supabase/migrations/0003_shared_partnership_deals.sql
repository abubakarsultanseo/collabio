-- Collabio shared partnerships and flexible link-exchange deals.
-- Apply after 0001_foundation.sql and 0002_collaboration_and_notifications.sql.
begin;

create table public.partnerships (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 140),
  user_a_id uuid not null references public.profiles(id) on delete restrict,
  user_b_id uuid not null references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (user_a_id <> user_b_id),
  unique (user_a_id,user_b_id)
);
create index partnerships_user_a_idx on public.partnerships(user_a_id);
create index partnerships_user_b_idx on public.partnerships(user_b_id);
create unique index partnerships_one_pair_idx on public.partnerships(least(user_a_id,user_b_id),greatest(user_a_id,user_b_id));

create or replace function public.is_partnership_member(target_partnership uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_active_user() and (public.is_admin() or exists (
    select 1 from public.partnerships p where p.id=target_partnership
    and auth.uid() in (p.user_a_id,p.user_b_id)
  ));
$$;

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  side_a_quota integer not null check (side_a_quota >= 0),
  side_b_quota integer not null check (side_b_quota >= 0),
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  close_reason text check (close_reason in ('automatic','manual')),
  notes text,
  created_by uuid not null references public.profiles(id),
  last_updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (side_a_quota + side_b_quota > 0),
  unique (id,partnership_id)
);
create index deals_partnership_status_idx on public.deals(partnership_id,status,created_at desc);

create table public.deal_quota_history (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  changed_by uuid not null references public.profiles(id),
  previous_side_a_quota integer not null,
  previous_side_b_quota integer not null,
  new_side_a_quota integer not null,
  new_side_b_quota integer not null,
  changed_at timestamptz not null default now()
);

alter table public.requests
  add column partnership_id uuid references public.partnerships(id),
  add column deal_id uuid,
  add column link_side text check (link_side in ('a','b')),
  add column shared_at timestamptz,
  add column live_at timestamptz;

-- Existing admin/team-member requests are grouped into a shared partnership and a
-- Legacy deal. The quotas include existing Live plus pending commitments so importing
-- old records does not create artificial debt. Stop safely if an old row cannot map.
insert into public.partnerships(name,user_a_id,user_b_id,created_by)
select distinct coalesce(nullif(trim(p.full_name),''),p.email), admin_profile.id, p.id, admin_profile.id
from public.requests r
join public.profiles p on p.id=r.partner_id
cross join lateral (select id from public.profiles where role='admin' and account_status='active' order by created_at limit 1) admin_profile
where p.id<>admin_profile.id
on conflict(user_a_id,user_b_id) do nothing;

insert into public.deals(partnership_id,name,side_a_quota,side_b_quota,created_by)
select p.id,'Legacy 1:1',1,1,p.created_by
from public.partnerships p
where exists(select 1 from public.requests r where r.partner_id=p.user_b_id)
  and not exists(select 1 from public.deals d where d.partnership_id=p.id)
on conflict do nothing;

update public.requests r set
  partnership_id=p.id,
  deal_id=d.id,
  link_side=case when r.direction='admin_to_partner' then 'a' else 'b' end,
  shared_at=case when r.status='shared' then r.created_at else null end,
  live_at=case when r.status='live' then coalesce(r.completed_at,r.updated_at,r.created_at) else null end
from public.partnerships p
join public.deals d on d.partnership_id=p.id and d.name='Legacy 1:1'
where p.user_b_id=r.partner_id and r.partnership_id is null;

-- Map older workflow labels to the status vocabulary used by the deal system.
update public.requests set status='shared' where status::text='new_request';
update public.requests set status='in_progress' where status::text in ('reviewing','accepted','waiting_for_partner','overdue');
update public.requests set shared_at=coalesce(shared_at,created_at) where status::text='shared' and shared_at is null;

do $$ begin
  if exists(select 1 from public.requests where partnership_id is null or deal_id is null or link_side is null) then
    raise exception 'Migration stopped: one or more existing requests could not be mapped to a Legacy partnership/deal. Review request partner_id and active admin profiles before retrying.';
  end if;
end $$;

update public.deals d set
  side_a_quota=greatest(1,coalesce(x.a_total,0)),
  side_b_quota=greatest(1,coalesce(x.b_total,0))
from (
  select deal_id,
    count(*) filter (where link_side='a' and (status::text='live' or status::text in ('shared','in_progress','seen'))) as a_total,
    count(*) filter (where link_side='b' and (status::text='live' or status::text in ('shared','in_progress','seen'))) as b_total
  from public.requests group by deal_id
) x where d.id=x.deal_id and d.name='Legacy 1:1';

alter table public.requests alter column partnership_id set not null;
alter table public.requests alter column deal_id set not null;
alter table public.requests alter column link_side set not null;
alter table public.requests add constraint requests_deal_same_partnership_fk foreign key(deal_id,partnership_id) references public.deals(id,partnership_id);
create index requests_deal_status_idx on public.requests(deal_id,status);
create index requests_partnership_created_idx on public.requests(partnership_id,created_at desc);

create or replace function public.create_partnership(peer_id uuid, partnership_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid; current_id uuid := auth.uid();
begin
  if current_id is null or not public.is_active_user() then raise exception 'Active sign-in required'; end if;
  if peer_id=current_id then raise exception 'Choose another active user'; end if;
  if not exists(select 1 from public.profiles where id=peer_id and account_status='active') then raise exception 'The other account is not active'; end if;
  insert into public.partnerships(name,user_a_id,user_b_id,created_by)
  values(trim(partnership_name),current_id,peer_id,current_id) returning id into new_id;
  return new_id;
end; $$;
revoke all on function public.create_partnership(uuid,text) from public;
grant execute on function public.create_partnership(uuid,text) to authenticated;

create or replace function public.log_deal_quota_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.side_a_quota is distinct from new.side_a_quota or old.side_b_quota is distinct from new.side_b_quota then
    insert into public.deal_quota_history(deal_id,changed_by,previous_side_a_quota,previous_side_b_quota,new_side_a_quota,new_side_b_quota)
    values(new.id,coalesce(auth.uid(),new.last_updated_by,new.created_by),old.side_a_quota,old.side_b_quota,new.side_a_quota,new.side_b_quota);
  end if;
  new.updated_at=now(); return new;
end; $$;
create trigger deals_quota_history before update on public.deals for each row execute function public.log_deal_quota_change();

create or replace function public.refresh_deal_status(target_deal uuid) returns void
language plpgsql security definer set search_path=public as $$
declare d public.deals; a_live integer; b_live integer;
begin
  select * into d from public.deals where id=target_deal for update;
  if not found or d.status='cancelled' or d.close_reason='manual' then return; end if;
  select count(*) filter(where link_side='a'),count(*) filter(where link_side='b') into a_live,b_live
    from public.requests where deal_id=target_deal and status::text='live';
  if greatest(0,d.side_a_quota-coalesce(a_live,0))=0 and greatest(0,d.side_b_quota-coalesce(b_live,0))=0 then
    update public.deals set status='closed',close_reason='automatic' where id=target_deal;
  elsif d.close_reason='automatic' then
    update public.deals set status='open',close_reason=null where id=target_deal;
  end if;
end; $$;

create or replace function public.track_request_deal_state() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    if new.status::text='live' then new.live_at=now(); end if;
    if new.status::text='shared' then new.shared_at=now(); end if;
  else
    if new.status::text='live' and old.status::text is distinct from 'live' then new.live_at=now(); end if;
    if new.status::text='shared' and old.status::text is distinct from 'shared' then new.shared_at=now(); end if;
    if old.deal_id is distinct from new.deal_id then perform public.refresh_deal_status(old.deal_id); end if;
  end if;
  return new;
end; $$;
create trigger requests_track_deal_state before insert or update on public.requests for each row execute function public.track_request_deal_state();

create or replace function public.refresh_deal_after_request() returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.refresh_deal_status(new.deal_id);
  if tg_op='UPDATE' and old.deal_id is distinct from new.deal_id then perform public.refresh_deal_status(old.deal_id); end if;
  return new;
end; $$;
create trigger requests_refresh_deal after insert or update of status,deal_id on public.requests for each row execute function public.refresh_deal_after_request();

create or replace function public.refresh_after_quota_change() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.refresh_deal_status(new.id); return new; end; $$;
create trigger deals_refresh_after_quota_change after update of side_a_quota,side_b_quota on public.deals for each row execute function public.refresh_after_quota_change();

create or replace function public.log_request_status_change() returns trigger language plpgsql security definer set search_path=public as $$
declare recipient uuid;
begin
  if old.status is distinct from new.status then
    insert into public.request_activity(request_id,partner_id,actor_id,action_type,previous_value,new_value)
    values(new.id,new.partner_id,coalesce(new.last_updated_by,auth.uid(),new.sender_id),'status_changed',jsonb_build_object('status',old.status::text),jsonb_build_object('status',new.status::text));
    select case when new.last_updated_by=p.user_a_id then p.user_b_id else p.user_a_id end into recipient
      from public.partnerships p where p.id=new.partnership_id;
    if recipient is not null then
      insert into public.notifications(recipient_id,actor_id,request_id,type,title,description)
      values(recipient,coalesce(new.last_updated_by,auth.uid(),new.sender_id),new.id,'request_status_changed','Request status updated',
        'A shared request status changed to '||replace(new.status::text,'_',' ')||'.');
    end if;
  end if;
  return new;
end; $$;
create trigger requests_log_status_change after update of status on public.requests for each row execute function public.log_request_status_change();

create or replace view public.deal_balance with (security_invoker=true) as
select d.id as deal_id,d.partnership_id,d.name,d.side_a_quota,d.side_b_quota,d.status,
  count(r.id) filter(where r.link_side='a' and r.status::text='live')::integer as side_a_live,
  count(r.id) filter(where r.link_side='b' and r.status::text='live')::integer as side_b_live,
  greatest(0,d.side_a_quota-count(r.id) filter(where r.link_side='a' and r.status::text='live'))::integer as side_a_remaining,
  greatest(0,d.side_b_quota-count(r.id) filter(where r.link_side='b' and r.status::text='live'))::integer as side_b_remaining,
  count(r.id) filter(where r.link_side='a' and r.status::text in ('shared','in_progress','seen'))::integer as side_a_pending,
  count(r.id) filter(where r.link_side='b' and r.status::text in ('shared','in_progress','seen'))::integer as side_b_pending,
  greatest(0,count(r.id) filter(where r.link_side='a' and r.status::text='live')-d.side_a_quota)::integer as side_a_over_quota,
  greatest(0,count(r.id) filter(where r.link_side='b' and r.status::text='live')-d.side_b_quota)::integer as side_b_over_quota
from public.deals d left join public.requests r on r.deal_id=d.id group by d.id;
grant select on public.deal_balance to authenticated;

alter table public.partnerships enable row level security;
alter table public.deals enable row level security;
alter table public.deal_quota_history enable row level security;
create policy partnerships_select_members on public.partnerships for select using (public.is_partnership_member(id));
create policy partnerships_insert_active on public.partnerships for insert with check (public.is_active_user() and created_by=auth.uid() and user_a_id=auth.uid());
create policy partnerships_update_members on public.partnerships for update using (public.is_partnership_member(id)) with check (public.is_partnership_member(id));
create policy deals_select_members on public.deals for select using (public.is_partnership_member(partnership_id));
create policy deals_insert_members on public.deals for insert with check (public.is_partnership_member(partnership_id) and created_by=auth.uid());
create policy deals_update_members on public.deals for update using (public.is_partnership_member(partnership_id)) with check (public.is_partnership_member(partnership_id));
create policy quota_history_select_members on public.deal_quota_history for select using (exists(select 1 from public.deals d where d.id=deal_id and public.is_partnership_member(d.partnership_id)));

drop policy if exists requests_select_participants on public.requests;
drop policy if exists requests_insert_sender on public.requests;
drop policy if exists requests_update_participants on public.requests;
create policy requests_select_partnership_members on public.requests for select using (public.is_partnership_member(partnership_id));
create policy requests_insert_partnership_members on public.requests for insert with check (public.is_partnership_member(partnership_id) and sender_id=auth.uid());
create policy requests_update_partnership_members on public.requests for update using (public.is_partnership_member(partnership_id)) with check (public.is_partnership_member(partnership_id));

commit;
