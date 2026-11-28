begin;

alter type public.request_type add value if not exists 'listicle';

alter table public.requests
  alter column anchor_text drop not null,
  alter column target_link drop not null,
  add column original_content text,
  add column edited_content text,
  add column document_url text,
  add column listicle_position text,
  add column attachment_path text,
  add column attachment_name text,
  add column import_date_unknown boolean not null default false,
  add constraint requests_content_format check (
    (attachment_path is null) = (attachment_name is null)
    and (document_url is null or document_url ~* '^https?://')
    and (
      (request_type::text <> 'listicle' and anchor_text is not null and target_link is not null)
      or
      (anchor_text is null and target_link is null and (
        (request_type::text = 'guest_post' and (document_url is not null or attachment_path is not null))
        or (request_type::text = 'listicle' and document_url is not null and nullif(btrim(listicle_position), '') is not null)
      ))
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('request-documents', 'request-documents', false, 3145728,
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

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
  insert into public.partnerships(name,user_a_id,user_b_id,created_by)
    values(partner.full_name,p_admin,p_partner,p_admin) on conflict do nothing;
  select * into strict pair from public.partnerships where
    (user_a_id=p_admin and user_b_id=p_partner) or (user_b_id=p_admin and user_a_id=p_partner);

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

create or replace function public.add_request_chat_message(p_request uuid, p_id uuid, p_author uuid, p_body text)
returns public.request_comments language plpgsql set search_path = public as $$
declare
  r public.requests;
  saved public.request_comments;
  recipient uuid;
begin
  select * into strict r from public.requests where id = p_request for key share;
  insert into public.request_comments(id, request_id, author_id, body, created_at)
    values (p_id, r.id, p_author, p_body, clock_timestamp())
    on conflict (id) do nothing returning * into saved;
  if not found then
    select * into strict saved from public.request_comments
      where id = p_id and request_id = p_request and author_id = p_author and body = p_body;
    return saved;
  end if;

  recipient := case when p_author = r.sender_id then r.receiver_id
    when p_author = r.receiver_id then r.sender_id else r.partner_id end;
  insert into public.notifications(recipient_id, actor_id, request_id, type, title, description)
    values (recipient, p_author, r.id, 'comment_received', 'New request message', 'A message was added to request: ' || coalesce(r.anchor_text,replace(r.request_type::text,'_',' ')));
  insert into public.request_activity(request_id, partner_id, actor_id, action_type, new_value)
    values (r.id, r.partner_id, p_author, 'comment_added', jsonb_build_object('body', p_body));
  insert into public.request_chat_email_jobs(id, recipient_id, request_id, anchor)
    values (saved.id, recipient, r.id, coalesce(r.anchor_text,replace(r.request_type::text,'_',' ')));
  return saved;
end;
$$;

commit;
