begin;

-- Cross-device Requests partner preference and presence/privacy settings.
alter table public.profiles
  add column if not exists last_partnership_id uuid references public.partnerships(id) on delete set null,
  add column if not exists last_seen_at timestamptz,
  add column if not exists hide_last_seen boolean not null default false;

-- WhatsApp-style message metadata. Existing message records remain unchanged.
alter table public.request_comments
  add column if not exists delivered_at timestamptz,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists reply_to_id uuid references public.request_comments(id) on delete set null;

alter table public.direct_chat_messages
  add column if not exists delivered_at timestamptz,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists reply_to_id uuid references public.direct_chat_messages(id) on delete set null;

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  message_kind text not null check (message_kind in ('request','direct')),
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  unique (message_kind, message_id, user_id)
);
create index if not exists message_reactions_message_idx
  on public.message_reactions(message_kind, message_id);
alter table public.message_reactions enable row level security;
revoke all on public.message_reactions from anon, authenticated;
grant select on public.message_reactions to authenticated;

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  message_kind text not null check (message_kind in ('request','direct')),
  thread_id uuid not null,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  width integer,
  height integer,
  created_at timestamptz not null default now()
);
create index if not exists message_attachments_message_idx
  on public.message_attachments(message_kind, message_id);
create index if not exists message_attachments_thread_idx
  on public.message_attachments(thread_id, created_at desc);
alter table public.message_attachments enable row level security;
revoke all on public.message_attachments from anon, authenticated;
grant select on public.message_attachments to authenticated;

-- Realtime subscribers read only messages in conversations they already belong to.
drop policy if exists direct_chat_messages_participant_read on public.direct_chat_messages;
create policy direct_chat_messages_participant_read
  on public.direct_chat_messages for select to authenticated
  using (admin_id = auth.uid() or partner_id = auth.uid());
grant select on public.direct_chat_messages to authenticated;

-- Existing request-comment participant policy is retained. Ensure authenticated SELECT is granted.
grant select on public.request_comments to authenticated;

-- Reaction visibility follows the parent message's conversation membership.
drop policy if exists message_reactions_participant_read on public.message_reactions;
create policy message_reactions_participant_read on public.message_reactions
for select to authenticated using (
  (message_kind = 'request' and exists (
    select 1 from public.request_comments c
    join public.requests r on r.id = c.request_id
    where c.id = message_id and (public.is_admin() or r.sender_id = auth.uid() or r.receiver_id = auth.uid() or r.partner_id = auth.uid())
  ))
  or
  (message_kind = 'direct' and exists (
    select 1 from public.direct_chat_messages m
    where m.id = message_id and (m.admin_id = auth.uid() or m.partner_id = auth.uid())
  ))
);

-- Attachment metadata visibility follows the same participant checks.
drop policy if exists message_attachments_participant_read on public.message_attachments;
create policy message_attachments_participant_read on public.message_attachments
for select to authenticated using (
  (message_kind = 'request' and exists (
    select 1 from public.requests r
    where r.id = thread_id and (public.is_admin() or r.sender_id = auth.uid() or r.receiver_id = auth.uid() or r.partner_id = auth.uid())
  ))
  or
  (message_kind = 'direct' and exists (
    select 1 from public.direct_chat_messages m
    where m.admin_id = thread_id and (m.admin_id = auth.uid() or m.partner_id = auth.uid())
  ))
);

-- Private bucket. Upload/download APIs will issue signed URLs after server-side membership checks.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-attachments', 'chat-attachments', false, 10485760,
  array['image/png','image/jpeg','image/webp','image/gif','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','text/plain'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists chat_attachments_participant_read on storage.objects;
create policy chat_attachments_participant_read on storage.objects
for select to authenticated using (
  bucket_id = 'chat-attachments' and (
    exists (
      select 1 from public.requests r
      where r.id::text = (storage.foldername(name))[1]
        and (public.is_admin() or r.sender_id = auth.uid() or r.receiver_id = auth.uid() or r.partner_id = auth.uid())
    )
    or exists (
      select 1 from public.direct_chat_messages m
      where (m.admin_id::text = (storage.foldername(name))[1] or m.partner_id::text = (storage.foldername(name))[1])
        and (m.admin_id = auth.uid() or m.partner_id = auth.uid())
    )
  )
);

-- Enable Postgres Changes for message streams; RLS remains the authorization boundary.
do $$ begin
  alter publication supabase_realtime add table public.request_comments;
exception when duplicate_object then null;
when undefined_object then raise notice 'supabase_realtime publication not found; enable it in Supabase dashboard';
end $$;
do $$ begin
  alter publication supabase_realtime add table public.direct_chat_messages;
exception when duplicate_object then null;
when undefined_object then raise notice 'supabase_realtime publication not found; enable it in Supabase dashboard';
end $$;
do $$ begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null;
when undefined_object then raise notice 'supabase_realtime publication not found; enable it in Supabase dashboard';
end $$;

commit;
