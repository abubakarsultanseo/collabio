begin;

alter type public.request_status add value if not exists 'removed';

alter table public.requests add column partner_request_number bigint;
alter table public.requests disable trigger requests_touch_updated_at;
with numbered as (
  select id, row_number() over (partition by partnership_id order by created_at, request_code, id) as number
  from public.requests
)
update public.requests r set partner_request_number = numbered.number
from numbered where numbered.id = r.id;
alter table public.requests enable trigger requests_touch_updated_at;

alter table public.requests alter column partner_request_number set not null;
alter table public.requests add constraint requests_partner_number_unique unique(partnership_id, partner_request_number);

create table public.partnership_request_counters (
  partnership_id uuid primary key references public.partnerships(id) on delete cascade,
  last_number bigint not null
);
alter table public.partnership_request_counters enable row level security;
revoke all on public.partnership_request_counters from anon, authenticated;
insert into public.partnership_request_counters (partnership_id, last_number)
select partnership_id, max(partner_request_number) from public.requests group by partnership_id;

create function public.assign_partner_request_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.partnership_request_counters (partnership_id, last_number)
  values (new.partnership_id, 1)
  on conflict (partnership_id) do update
  set last_number = public.partnership_request_counters.last_number + 1
  returning last_number into new.partner_request_number;
  return new;
end;
$$;
create trigger requests_assign_partner_number before insert on public.requests
for each row execute function public.assign_partner_request_number();

create function public.protect_partner_request_number() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.partnership_id is distinct from old.partnership_id
    or new.partner_request_number is distinct from old.partner_request_number then
    raise exception 'A request keeps its original workspace and request number.';
  end if;
  return new;
end;
$$;
create trigger requests_protect_partner_number before update of partnership_id, partner_request_number
on public.requests for each row execute function public.protect_partner_request_number();

alter table public.deals
  add column first_link_side text check (first_link_side in ('a','b')),
  add column first_link_live_at timestamptz,
  add column opening_request_number bigint;

-- In an exchange, the receiver owns the requested placement and supplies the link.
-- The original link_side field continues to identify the sender for historical deals.
create or replace function public.refresh_deal_status(target_deal uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d public.deals;
  p public.partnerships;
  a_live integer;
  b_live integer;
  released_at timestamptz;
  complete boolean;
begin
  if target_deal is null then return; end if;
  select * into d from public.deals where id = target_deal for update;
  if not found or d.status = 'cancelled' or d.close_reason = 'manual' then return; end if;

  released_at := d.first_link_live_at;
  if d.first_link_side is null then
    select count(*) filter (where link_side = 'a'), count(*) filter (where link_side = 'b')
    into a_live, b_live from public.requests where deal_id = d.id and status::text = 'live';
  else
    select * into p from public.partnerships where id = d.partnership_id;
    select count(*) filter (where receiver_id = p.user_a_id), count(*) filter (where receiver_id = p.user_b_id)
    into a_live, b_live from public.requests where deal_id = d.id and status::text = 'live';
    if released_at is null and
      ((d.first_link_side = 'a' and a_live > 0) or (d.first_link_side = 'b' and b_live > 0)) then
      released_at := clock_timestamp();
    end if;
  end if;

  complete := a_live >= d.side_a_quota and b_live >= d.side_b_quota;
  if complete and (d.status <> 'closed' or released_at is distinct from d.first_link_live_at) then
    update public.deals set status = 'closed', close_reason = 'automatic', first_link_live_at = released_at where id = d.id;
  elsif not complete and (d.close_reason = 'automatic' or released_at is distinct from d.first_link_live_at) then
    update public.deals set status = 'open', close_reason = null, first_link_live_at = released_at where id = d.id;
  end if;
end;
$$;

-- Keep the existing request timestamps and refresh moved links only after the write.
create or replace function public.track_request_deal_state() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status::text = 'live' then
      new.live_at := case when new.import_key is not null then coalesce(new.live_at,new.updated_at,new.created_at) else now() end;
    end if;
    if new.status::text = 'shared' then
      new.shared_at := case when new.import_key is not null then coalesce(new.shared_at,new.updated_at,new.created_at) else now() end;
    end if;
  else
    if new.status::text = 'live' and old.status::text is distinct from 'live' then new.live_at := now(); end if;
    if new.status::text = 'shared' and old.status::text is distinct from 'shared' then new.shared_at := now(); end if;
  end if;
  return new;
end;
$$;
create or replace function public.refresh_deal_after_request() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_deal_status(old.deal_id);
    return old;
  end if;
  if tg_op = 'UPDATE' and old.deal_id is distinct from new.deal_id then
    -- Lock both sides in a consistent order when a request moves between exchanges.
    perform 1 from public.deals where id in (old.deal_id, new.deal_id) order by id for update;
    perform public.refresh_deal_status(old.deal_id);
  end if;
  perform public.refresh_deal_status(new.deal_id);
  return new;
end;
$$;
revoke all on function public.refresh_deal_status(uuid) from public, anon, authenticated;
create trigger requests_refresh_deal_after_delete after delete on public.requests
for each row execute function public.refresh_deal_after_request();

create view public.tracked_exchange_balances with (security_invoker=true) as
with progress as (
  select d.id, d.partnership_id, d.name, d.status, d.side_a_quota, d.side_b_quota,
    d.first_link_side, d.first_link_live_at, d.opening_request_number, d.created_at,
    count(r.id) filter (where r.receiver_id = p.user_a_id)::integer as side_a_live,
    count(r.id) filter (where r.receiver_id = p.user_b_id)::integer as side_b_live
  from public.deals d
  join public.partnerships p on p.id = d.partnership_id
  left join public.requests r on r.deal_id = d.id and r.status = 'live'
  where d.first_link_side is not null
  group by d.id
)
select progress.*,
  case when status <> 'open' then 0
    when first_link_side = 'a' or first_link_live_at is not null then greatest(0, side_a_quota - side_a_live)
    else 0 end as side_a_due,
  case when status <> 'open' then 0
    when first_link_side = 'b' or first_link_live_at is not null then greatest(0, side_b_quota - side_b_live)
    else 0 end as side_b_due
from progress;

create view public.partnership_exchange_summary with (security_invoker=true) as
select p.id as partnership_id,
  (select count(*)::integer from public.requests r where r.partnership_id=p.id and r.status='live' and r.receiver_id=p.user_a_id) as side_a_given,
  (select count(*)::integer from public.requests r where r.partnership_id=p.id and r.status='live' and r.receiver_id=p.user_b_id) as side_b_given,
  coalesce(sum(e.side_a_due),0)::integer as side_a_due,
  coalesce(sum(e.side_b_due),0)::integer as side_b_due
from public.partnerships p left join public.tracked_exchange_balances e on e.partnership_id=p.id
group by p.id;
revoke all on public.tracked_exchange_balances, public.partnership_exchange_summary from public, anon, authenticated;
grant select on public.tracked_exchange_balances, public.partnership_exchange_summary to service_role;

-- Service-only: the request and its new exchange are saved in one transaction.
create function public.create_collabio_exchange_requests(p_requests jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  entry jsonb;
  r public.requests;
  p public.partnerships;
  d public.deals;
  ratio text;
  a_quota integer;
  b_quota integer;
  first_side text;
  sender_side text;
  saved public.requests;
  result jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_requests) <> 'array' or jsonb_array_length(p_requests) not between 1 and 50 then
    raise exception 'Invalid request batch';
  end if;
  if (select count(distinct value->>'partnership_id') from jsonb_array_elements(p_requests)) <> 1 then
    raise exception 'Choose one workspace per request batch';
  end if;
  perform 1 from public.deals
    where id in (select (value->>'deal_id')::uuid from jsonb_array_elements(p_requests))
    order by id for update;
  for entry in select value from jsonb_array_elements(p_requests) loop
    r := jsonb_populate_record(null::public.requests, entry);
    select * into strict p from public.partnerships where id = r.partnership_id;
    if r.sender_id is null or r.receiver_id is null or r.sender_id = r.receiver_id or
      r.sender_id not in (p.user_a_id,p.user_b_id) or r.receiver_id not in (p.user_a_id,p.user_b_id) then
      raise exception 'Both request participants must belong to this partnership';
    end if;
    sender_side := case when r.sender_id = p.user_a_id then 'a' else 'b' end;
    ratio := entry->>'exchange_ratio';
    if r.deal_id is not null then
      select * into d from public.deals where id=r.deal_id and partnership_id=p.id for update;
      if not found or d.status <> 'open' then raise exception 'Choose an open exchange in this workspace'; end if;
    elsif ratio is not null then
      if ratio not in ('1:1','2:1','3:1','4:1','1:2','1:3','1:4','1:5') then
        raise exception 'Invalid exchange ratio';
      end if;
      a_quota := split_part(ratio,':',case when sender_side='a' then 1 else 2 end)::integer;
      b_quota := split_part(ratio,':',case when sender_side='a' then 2 else 1 end)::integer;
      first_side := case when a_quota < b_quota then 'a' when b_quota < a_quota then 'b'
        when sender_side = 'a' then 'b' else 'a' end;
      insert into public.deals (partnership_id, name, side_a_quota, side_b_quota, created_by, first_link_side)
      values (p.id,'Link exchange',a_quota,b_quota,r.sender_id,first_side) returning id into r.deal_id;
    end if;
    insert into public.requests (partnership_id,deal_id,link_side,partner_id,sender_id,receiver_id,direction,
      placement_page_url,anchor_text,target_link,request_type,original_content,edited_content,document_url,
      listicle_position,instructions,notes,attachment_path,attachment_name)
    values (p.id,r.deal_id,sender_side,r.partner_id,r.sender_id,r.receiver_id,r.direction,
      r.placement_page_url,r.anchor_text,r.target_link,r.request_type,r.original_content,r.edited_content,r.document_url,
      r.listicle_position,r.instructions,r.notes,r.attachment_path,r.attachment_name) returning * into saved;
    if ratio is not null and entry->>'deal_id' is null then
      update public.deals set opening_request_number = saved.partner_request_number where id = saved.deal_id;
    end if;
    result := result || jsonb_build_array(jsonb_build_object('id',saved.id,
      'request_code',saved.partner_request_number,'deadline_at',saved.deadline_at,'anchor_text',saved.anchor_text,
      'deal_id',saved.deal_id));
  end loop;
  return result;
end;
$$;
revoke all on function public.create_collabio_exchange_requests(jsonb) from public, anon, authenticated;
grant execute on function public.create_collabio_exchange_requests(jsonb) to service_role;

create or replace function public.schedule_request_reminders() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.import_key is not null then return new; end if;
  insert into public.reminder_jobs(request_id,job_type,due_at) values
    (new.id,'12_hour_reminder',new.created_at + interval '12 hours'),
    (new.id,'24_hour_overdue',new.created_at + interval '24 hours')
  on conflict(request_id,job_type) do nothing;
  insert into public.request_activity(request_id,partner_id,actor_id,action_type,new_value)
  values(new.id,new.partner_id,new.sender_id,'request_created',jsonb_build_object('status',new.status,'request_code',new.partner_request_number));
  insert into public.notifications(recipient_id,actor_id,request_id,type,title,description)
  select new.receiver_id,new.sender_id,new.id,'new_request_received','New Request Received',
    full_name || ' sent you request #' || new.partner_request_number || '.'
  from public.profiles where id = new.sender_id;
  return new;
end; $$;

create or replace function public.log_request_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare recipient uuid; actor_name text;
begin
  if old.status is distinct from new.status or old.rejection_reason is distinct from new.rejection_reason then
    if new.status = 'overdue' and new.was_overdue and not old.was_overdue then
      actor_name := 'Collabio reminder';
    else
      select full_name into actor_name from public.profiles where id=coalesce(new.last_updated_by,auth.uid(),new.sender_id);
    end if;
    insert into public.request_activity(request_id,partner_id,actor_id,action_type,previous_value,new_value)
    values(new.id,new.partner_id,coalesce(new.last_updated_by,auth.uid(),new.sender_id),'status_changed',
      jsonb_strip_nulls(jsonb_build_object('status',old.status::text,'reason',old.rejection_reason)),
      jsonb_strip_nulls(jsonb_build_object('status',new.status::text,'reason',new.rejection_reason,'actor_name',actor_name)));
    select case when new.last_updated_by=p.user_a_id then p.user_b_id else p.user_a_id end into recipient
      from public.partnerships p where p.id=new.partnership_id;
    if recipient is not null and old.status is distinct from new.status and actor_name is distinct from 'Collabio reminder' then
      insert into public.notifications(recipient_id,actor_id,request_id,type,title,description)
      values(recipient,coalesce(new.last_updated_by,auth.uid(),new.sender_id),new.id,'request_status_changed','Request status updated',
        coalesce(actor_name,'A workspace member')||' changed request #'||new.partner_request_number||' from '||replace(old.status::text,'_',' ')||' to '||replace(new.status::text,'_',' ')||'.');
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.mark_request_seen(target_request uuid) returns void language plpgsql security definer set search_path=public as $$
declare r public.requests;
begin
  select * into r from public.requests where id=target_request for update;
  if not found then raise exception 'Request not found'; end if;
  if auth.uid() is distinct from r.receiver_id and not public.is_admin() then raise exception 'Not authorized'; end if;
  if r.import_key is not null or r.status::text = 'cancelled' then return; end if;
  if r.first_viewed_at is null then
    update public.requests set first_viewed_at=now(), status=case when status='new_request' then 'seen'::public.request_status else status end, last_updated_by=auth.uid() where id=target_request;
    insert into public.request_activity(request_id,partner_id,actor_id,action_type,new_value) values(target_request,r.partner_id,auth.uid(),'request_viewed',jsonb_build_object('first_viewed_at',now()));
    insert into public.notifications(recipient_id,actor_id,request_id,type,title,description) select r.sender_id,auth.uid(),target_request,'request_viewed','Request Viewed',full_name || ' opened request #' || r.partner_request_number || '.'
    from public.profiles where id = auth.uid();
  end if;
end; $$;

create or replace function public.import_collabio_requests(p_admin uuid, p_partner uuid, p_rows jsonb)
returns integer language plpgsql set search_path = public as $$
declare
  pair public.partnerships;
  partner public.profiles;
  total integer;
begin
  if not exists (select 1 from public.profiles where id=p_admin and role='admin' and account_status='active')
    then raise exception 'Admin required'; end if;
  select * into strict partner from public.profiles where id = p_partner and role = 'partner' and account_status <> 'deactivated' for update;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 1000
    then raise exception 'Invalid import size'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r where coalesce(r->>'key', '') !~ '^[a-f0-9]{64}$'
    or coalesce(r->>'direction','') not in ('sent','received')) then raise exception 'Invalid source records'; end if;
  if (select count(distinct r->>'key') from jsonb_array_elements(p_rows) r) <> jsonb_array_length(p_rows) then
    raise exception 'Duplicate source rows';
  end if;
  insert into public.partnerships(name,user_a_id,user_b_id,created_by)
    values(partner.full_name,p_admin,p_partner,p_admin) on conflict do nothing;
  select * into strict pair from public.partnerships where
    (user_a_id=p_admin and user_b_id=p_partner) or (user_b_id=p_admin and user_a_id=p_partner) for no key update;

  insert into public.requests(partnership_id,partner_id,sender_id,receiver_id,direction,link_side,placement_page_url,anchor_text,
    target_link,request_type,status,rejection_reason,notes,instructions,created_at,updated_at,deadline_at,first_viewed_at,was_overdue,overdue_at,import_key,original_content,edited_content,document_url,listicle_position,import_date_unknown)
  select pair.id,p_partner,
    case when r->>'direction'='sent' then p_admin else p_partner end,
    case when r->>'direction'='sent' then p_partner else p_admin end,
    case when r->>'direction'='sent' then 'admin_to_partner'::public.request_direction else 'partner_to_admin'::public.request_direction end,
    case when pair.user_a_id = (case when r->>'direction'='sent' then p_admin else p_partner end) then 'a' else 'b' end,
    r->>'placement',r->>'anchor',r->>'target',(r->>'type')::public.request_type,(r->>'status')::public.request_status,
    r->>'reason',r->>'notes',r->>'instructions',coalesce((r->>'created')::timestamptz,now()),
    coalesce((r->>'updated')::timestamptz,(r->>'created')::timestamptz,now()),
    coalesce((r->>'deadline')::timestamptz,coalesce((r->>'created')::timestamptz,now()) + interval '24 hours'),
    (r->>'viewed')::timestamptz,r->>'status'='overdue',
    case when r->>'status'='overdue' then coalesce((r->>'deadline')::timestamptz,coalesce((r->>'created')::timestamptz,now()) + interval '24 hours') else null end,r->>'key',
    r->>'original_content',r->>'edited_content',r->>'document_url',r->>'position',r->>'created' is null
  from jsonb_array_elements(p_rows) with ordinality as source(r, row_index)
  where not exists (select 1 from public.requests prior where prior.partnership_id=pair.id and prior.import_key=r->>'key')
    and not exists (select 1 from public.requests existing where existing.partnership_id=pair.id
    and existing.import_key is null and existing.placement_page_url=r->>'placement' and existing.target_link=r->>'target'
    and existing.anchor_text=r->>'anchor' and existing.created_at=(r->>'created')::timestamptz
    and existing.sender_id=(case when r->>'direction'='sent' then p_admin else p_partner end))
  order by source.row_index
  on conflict (partnership_id,import_key) do nothing;
  get diagnostics total = row_count;
  return total;
end;
$$;

commit;
