begin;

create table public.direct_chat_messages (
  id uuid primary key,
  admin_id uuid not null references public.profiles(id) on delete cascade,
  partner_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default clock_timestamp(),
  check (admin_id <> partner_id and author_id in (admin_id, partner_id))
);
create index direct_chat_thread_idx
  on public.direct_chat_messages(admin_id, partner_id, created_at desc, id desc);
create index request_chat_thread_idx
  on public.request_comments(request_id, created_at desc, id desc);

create table public.chat_read_positions (
  reader_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('direct', 'request')),
  thread_id uuid not null,
  up_to_at timestamptz not null,
  up_to_id uuid not null,
  primary key (reader_id, kind, thread_id)
);

create table public.request_chat_email_jobs (
  id uuid primary key references public.request_comments(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null references public.requests(id) on delete cascade,
  anchor text not null,
  available_at timestamptz not null default now(),
  attempts integer not null default 0,
  delivered_at timestamptz
);
create index request_chat_email_due_idx on public.request_chat_email_jobs(available_at)
  where delivered_at is null and attempts < 5;

alter table public.direct_chat_messages enable row level security;
alter table public.chat_read_positions enable row level security;
alter table public.request_chat_email_jobs enable row level security;
revoke all on public.direct_chat_messages, public.chat_read_positions, public.request_chat_email_jobs from public, anon, authenticated;
grant select, insert on public.direct_chat_messages to service_role;
grant select, insert, update on public.chat_read_positions, public.request_chat_email_jobs to service_role;

create function public.advance_chat_read_position(
  p_reader uuid, p_kind text, p_thread uuid, p_at timestamptz, p_id uuid
) returns void language sql set search_path = public as $$
  insert into public.chat_read_positions as positions
    (reader_id, kind, thread_id, up_to_at, up_to_id)
  values (p_reader, p_kind, p_thread, p_at, p_id)
  on conflict (reader_id, kind, thread_id) do update
    set up_to_at = excluded.up_to_at, up_to_id = excluded.up_to_id
    where (positions.up_to_at, positions.up_to_id) < (excluded.up_to_at, excluded.up_to_id);
$$;

create function public.request_chat_unread(p_reader uuid, p_requests uuid[])
returns table (thread_id uuid, unread bigint) language sql stable set search_path = public as $$
  select c.request_id, count(*)
  from public.request_comments c
  join public.requests r on r.id = c.request_id
  join public.partnerships p on p.id = r.partnership_id
  join public.profiles u on u.id = p_reader and u.account_status = 'active'
  left join public.partner_permissions access on access.partner_id = u.id
  left join public.chat_read_positions pos
    on pos.reader_id = u.id and pos.kind = 'request' and pos.thread_id = r.id
  where c.request_id = any(p_requests) and c.author_id <> u.id
    and (u.role = 'admin' or (u.id in (p.user_a_id, p.user_b_id) and coalesce(access.view_requests, true)))
    and (pos.up_to_at is null or (c.created_at, c.id) > (pos.up_to_at, pos.up_to_id))
  group by c.request_id;
$$;

create function public.direct_chat_contacts(p_admin uuid)
returns table (id uuid, name text, latest_at timestamptz, unread bigint)
language sql stable set search_path = public as $$
  select p.id, p.full_name, newest.created_at, counts.unread
  from public.profiles p
  left join public.chat_read_positions pos
    on pos.reader_id = p_admin and pos.kind = 'direct' and pos.thread_id = p.id
  left join lateral (
    select m.created_at from public.direct_chat_messages m
    where m.admin_id = p_admin and m.partner_id = p.id
    order by m.created_at desc, m.id desc limit 1
  ) newest on true
  left join lateral (
    select count(*) as unread from public.direct_chat_messages m
    where m.admin_id = p_admin and m.partner_id = p.id and m.author_id = p.id
      and (pos.up_to_at is null or (m.created_at, m.id) > (pos.up_to_at, pos.up_to_id))
  ) counts on true
  where p.role = 'partner' and p.account_status = 'active'
  order by newest.created_at desc nulls last, p.full_name, p.id;
$$;

create function public.add_request_chat_message(p_request uuid, p_id uuid, p_author uuid, p_body text)
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
    values (recipient, p_author, r.id, 'comment_received', 'New request message', 'A message was added to request: ' || r.anchor_text);
  insert into public.request_activity(request_id, partner_id, actor_id, action_type, new_value)
    values (r.id, r.partner_id, p_author, 'comment_added', jsonb_build_object('body', p_body));
  insert into public.request_chat_email_jobs(id, recipient_id, request_id, anchor)
    values (saved.id, recipient, r.id, r.anchor_text);
  return saved;
end;
$$;

create function public.claim_request_chat_email_jobs(p_id uuid default null, p_limit integer default 10)
returns setof public.request_chat_email_jobs language sql set search_path = public as $$
  with due as (
    select id from public.request_chat_email_jobs
    where delivered_at is null and attempts < 5 and available_at <= clock_timestamp()
      and (p_id is null or id = p_id)
    order by available_at
    limit least(25, greatest(1, p_limit))
    for update skip locked
  )
  update public.request_chat_email_jobs job
    set attempts = job.attempts + 1, available_at = clock_timestamp() + interval '5 minutes'
  from due where job.id = due.id returning job.*;
$$;

revoke all on function public.advance_chat_read_position(uuid,text,uuid,timestamptz,uuid),
  public.request_chat_unread(uuid,uuid[]), public.direct_chat_contacts(uuid),
  public.add_request_chat_message(uuid,uuid,uuid,text), public.claim_request_chat_email_jobs(uuid,integer)
  from public, anon, authenticated;
grant execute on function public.advance_chat_read_position(uuid,text,uuid,timestamptz,uuid),
  public.request_chat_unread(uuid,uuid[]), public.direct_chat_contacts(uuid),
  public.add_request_chat_message(uuid,uuid,uuid,text), public.claim_request_chat_email_jobs(uuid,integer)
  to service_role;

commit;
