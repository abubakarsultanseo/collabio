begin;

alter table public.profiles add column avatar_url text;
alter table public.requests add column import_key text;
create unique index requests_import_key_uidx on public.requests(partnership_id, import_key);

create function public.accept_collabio_google_invitation(p_user uuid, p_email text, p_hash text)
returns text language plpgsql set search_path = public as $$
declare
  invite public.invitations;
  account public.profiles;
begin
  select * into invite from public.invitations
    where token_hash = p_hash and status = 'pending' and expires_at > now() for update;
  if not found then return 'invalid_invite'; end if;
  if lower(invite.email) <> p_email then return 'wrong_account'; end if;
  select * into account from public.profiles where id = p_user for update;
  if not found or account.role <> 'partner' or account.account_status = 'deactivated' or lower(account.email) <> p_email
    then return 'invalid_invite'; end if;
  if not exists (select 1 from public.profiles where id = invite.invited_by and role = 'admin' and account_status = 'active')
    then return 'invalid_invite'; end if;

  update public.profiles set full_name = invite.full_name, company = coalesce(invite.company, company),
    website = coalesce(invite.website, website), account_status = 'active' where id = p_user;
  insert into public.partners(profile_id) values(p_user) on conflict do nothing;
  insert into public.collaborations(partner_id,status) values(p_user,'active') on conflict do nothing;
  insert into public.memberships(partner_id,user_id,role) values(p_user,p_user,'partner') on conflict do nothing;
  insert into public.partner_permissions(partner_id) values(p_user) on conflict do nothing;
  insert into public.partnerships(name,user_a_id,user_b_id,created_by)
    values(invite.full_name,invite.invited_by,p_user,invite.invited_by) on conflict do nothing;
  update public.invitations set status = 'accepted', accepted_at = now() where id = invite.id;
  insert into public.notifications(recipient_id,actor_id,type,title,description)
    values(invite.invited_by,p_user,'invitation_accepted','Invitation accepted',invite.full_name || ' accepted the invitation.');
  return 'accepted';
end;
$$;

create function public.import_collabio_requests(p_admin uuid, p_partner uuid, p_rows jsonb)
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
  insert into public.partnerships(name,user_a_id,user_b_id,created_by)
    values(partner.full_name,p_admin,p_partner,p_admin) on conflict do nothing;
  select * into strict pair from public.partnerships where
    (user_a_id=p_admin and user_b_id=p_partner) or (user_b_id=p_admin and user_a_id=p_partner);

  insert into public.requests(partnership_id,partner_id,sender_id,receiver_id,direction,link_side,placement_page_url,anchor_text,
    target_link,request_type,status,rejection_reason,notes,instructions,created_at,updated_at,deadline_at,first_viewed_at,was_overdue,overdue_at,import_key)
  select pair.id,p_partner,
    case when r->>'direction'='sent' then p_admin else p_partner end,
    case when r->>'direction'='sent' then p_partner else p_admin end,
    case when r->>'direction'='sent' then 'admin_to_partner'::public.request_direction else 'partner_to_admin'::public.request_direction end,
    case when pair.user_a_id = (case when r->>'direction'='sent' then p_admin else p_partner end) then 'a' else 'b' end,
    r->>'placement',r->>'anchor',r->>'target',(r->>'type')::public.request_type,(r->>'status')::public.request_status,
    r->>'reason',r->>'notes',r->>'instructions',(r->>'created')::timestamptz,
    coalesce((r->>'updated')::timestamptz,(r->>'created')::timestamptz),
    coalesce((r->>'deadline')::timestamptz,(r->>'created')::timestamptz + interval '24 hours'),
    (r->>'viewed')::timestamptz,r->>'status'='overdue',
    case when r->>'status'='overdue' then coalesce((r->>'deadline')::timestamptz,(r->>'created')::timestamptz + interval '24 hours') else null end,r->>'key'
  from jsonb_array_elements(p_rows) r
  where not exists (select 1 from public.requests existing where existing.partnership_id=pair.id
    and existing.import_key is null and existing.placement_page_url=r->>'placement' and existing.target_link=r->>'target'
    and existing.anchor_text=r->>'anchor' and existing.created_at=(r->>'created')::timestamptz
    and existing.sender_id=(case when r->>'direction'='sent' then p_admin else p_partner end))
  on conflict (partnership_id,import_key) do nothing;
  get diagnostics total = row_count;
  return total;
end;
$$;

revoke all on function public.accept_collabio_google_invitation(uuid,text,text),
  public.import_collabio_requests(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.accept_collabio_google_invitation(uuid,text,text),
  public.import_collabio_requests(uuid,uuid,jsonb) to service_role;

create or replace function public.schedule_request_reminders() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.import_key is not null then return new; end if;
  insert into public.reminder_jobs(request_id,job_type,due_at) values
    (new.id,'12_hour_reminder',new.created_at + interval '12 hours'),
    (new.id,'24_hour_overdue',new.created_at + interval '24 hours')
  on conflict(request_id,job_type) do nothing;
  insert into public.request_activity(request_id,partner_id,actor_id,action_type,new_value)
  values(new.id,new.partner_id,new.sender_id,'request_created',jsonb_build_object('status',new.status,'request_code',new.request_code));
  insert into public.notifications(recipient_id,actor_id,request_id,type,title,description)
  select new.receiver_id,new.sender_id,new.id,'new_request_received','New Request Received',
    full_name || ' sent you request #' || new.request_code || '.'
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
        coalesce(actor_name,'A workspace member')||' changed request #'||new.request_code||' from '||replace(old.status::text,'_',' ')||' to '||replace(new.status::text,'_',' ')||'.');
    end if;
  end if;
  return new;
end;
$$;


create or replace function public.track_request_deal_state() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    if new.import_key is not null then
      if new.status::text='live' then new.live_at=coalesce(new.live_at,new.updated_at,new.created_at); end if;
      if new.status::text='shared' then new.shared_at=coalesce(new.shared_at,new.updated_at,new.created_at); end if;
      return new;
    end if;
    if new.status::text='live' then new.live_at=now(); end if;
    if new.status::text='shared' then new.shared_at=now(); end if;
  else
    if new.status::text='live' and old.status::text is distinct from 'live' then new.live_at=now(); end if;
    if new.status::text='shared' and old.status::text is distinct from 'shared' then new.shared_at=now(); end if;
    if old.deal_id is distinct from new.deal_id then perform public.refresh_deal_status(old.deal_id); end if;
  end if;
  return new;
end; $$;
create or replace function public.mark_request_seen(target_request uuid) returns void language plpgsql security definer set search_path=public as $$
declare r public.requests;
begin
  select * into r from public.requests where id=target_request for update;
  if not found then raise exception 'Request not found'; end if;
  if auth.uid() is distinct from r.receiver_id and not public.is_admin() then raise exception 'Not authorized'; end if;
  if r.import_key is not null then return; end if;
  if r.first_viewed_at is null then
    update public.requests set first_viewed_at=now(), status=case when status='new_request' then 'seen'::public.request_status else status end, last_updated_by=auth.uid() where id=target_request;
    insert into public.request_activity(request_id,partner_id,actor_id,action_type,new_value) values(target_request,r.partner_id,auth.uid(),'request_viewed',jsonb_build_object('first_viewed_at',now()));
    insert into public.notifications(recipient_id,actor_id,request_id,type,title,description) select r.sender_id,auth.uid(),target_request,'request_viewed','Request Viewed',full_name || ' opened request #' || r.request_code || '.'
    from public.profiles where id = auth.uid();
  end if;
end; $$;

create function public.collabio_chat_contacts(p_admin uuid)
returns table (id uuid, name text, latest_at timestamptz, unread bigint, avatar_url text)
language sql stable set search_path = public as $$
  select contacts.id, contacts.name, contacts.latest_at, contacts.unread, profiles.avatar_url
  from public.direct_chat_contacts(p_admin) contacts
  join public.profiles on profiles.id = contacts.id
  order by contacts.latest_at desc nulls last, contacts.name, contacts.id;
$$;
revoke all on function public.collabio_chat_contacts(uuid) from public, anon, authenticated;
grant execute on function public.collabio_chat_contacts(uuid) to service_role;

commit;
