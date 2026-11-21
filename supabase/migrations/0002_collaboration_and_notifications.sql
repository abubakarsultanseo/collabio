-- Collabio Phase 2/3 data foundation.
-- Apply after 0001_foundation.sql in Supabase SQL Editor.
create type public.request_status as enum (
  'new_request','seen','reviewing','accepted','rejected','in_progress','live','shared','hold','waiting_for_partner','cancelled','overdue'
);
create type public.request_direction as enum ('admin_to_partner','partner_to_admin');
create type public.request_type as enum ('guest_post','link_insertion','other');

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  request_code bigint generated always as identity unique,
  partner_id uuid not null references public.profiles(id) on delete restrict,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  receiver_id uuid not null references public.profiles(id) on delete restrict,
  direction public.request_direction not null,
  placement_page_url text not null,
  anchor_text text not null,
  target_link text not null,
  request_type public.request_type not null default 'other',
  instructions text,
  notes text,
  status public.request_status not null default 'new_request',
  first_viewed_at timestamptz,
  deadline_at timestamptz not null default (now() + interval '24 hours'),
  was_overdue boolean not null default false,
  overdue_at timestamptz,
  completed_at timestamptz,
  last_updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint requests_sender_receiver_different check(sender_id <> receiver_id),
  constraint requests_urls_valid check(placement_page_url ~* '^https?://' and target_link ~* '^https?://')
);
create index requests_partner_created_idx on public.requests(partner_id, created_at desc);
create index requests_receiver_status_idx on public.requests(receiver_id, status, created_at desc);
create index requests_deadline_idx on public.requests(deadline_at) where first_viewed_at is null and was_overdue=false;

create table public.request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check(length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index request_comments_request_idx on public.request_comments(request_id, created_at);

create table public.request_activity (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.requests(id) on delete set null,
  partner_id uuid references public.profiles(id) on delete set null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action_type text not null,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index request_activity_partner_idx on public.request_activity(partner_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  request_id uuid references public.requests(id) on delete cascade,
  type text not null,
  title text not null,
  description text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications(recipient_id, created_at desc);

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  template_key text not null,
  request_id uuid references public.requests(id) on delete set null,
  provider_message_id text,
  status text not null default 'queued' check(status in ('queued','sent','failed')),
  error_message text,
  idempotency_key text not null unique,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.reminder_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  job_type text not null check(job_type in ('12_hour_reminder','24_hour_overdue')),
  due_at timestamptz not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(request_id, job_type)
);
create index reminder_jobs_due_idx on public.reminder_jobs(due_at) where processed_at is null;

alter table public.requests enable row level security;
alter table public.request_comments enable row level security;
alter table public.request_activity enable row level security;
alter table public.notifications enable row level security;
alter table public.email_logs enable row level security;
alter table public.reminder_jobs enable row level security;

create policy requests_select_participants on public.requests for select using (public.is_admin() or (public.is_active_user() and (sender_id=auth.uid() or receiver_id=auth.uid() or partner_id=auth.uid())));
create policy requests_insert_sender on public.requests for insert with check (
  public.is_active_user() and sender_id=auth.uid() and
  ((public.is_admin() and direction='admin_to_partner') or
   (public.current_app_role()='partner' and direction='partner_to_admin' and partner_id=auth.uid() and receiver_id in (select id from public.profiles where role='admin' and account_status='active')))
);
create policy requests_update_participants on public.requests for update using (public.is_admin() or (public.is_active_user() and (sender_id=auth.uid() or receiver_id=auth.uid() or partner_id=auth.uid()))) with check (public.is_admin() or (public.is_active_user() and (sender_id=auth.uid() or receiver_id=auth.uid() or partner_id=auth.uid())));
create policy requests_delete_admin on public.requests for delete using (public.is_admin());

create policy comments_select_participants on public.request_comments for select using (exists(select 1 from public.requests r where r.id=request_id and (public.is_admin() or r.sender_id=auth.uid() or r.receiver_id=auth.uid() or r.partner_id=auth.uid())));
create policy comments_insert_participants on public.request_comments for insert with check (author_id=auth.uid() and exists(select 1 from public.requests r where r.id=request_id and (public.is_admin() or r.sender_id=auth.uid() or r.receiver_id=auth.uid() or r.partner_id=auth.uid())));
create policy activity_select_scope on public.request_activity for select using (public.is_admin() or partner_id=auth.uid() or actor_id=auth.uid());
create policy notifications_select_own on public.notifications for select using (recipient_id=auth.uid() or public.is_admin());
create policy notifications_update_own on public.notifications for update using (recipient_id=auth.uid() or public.is_admin()) with check (recipient_id=auth.uid() or public.is_admin());
-- Service role only for delivery and scheduler tables; no client-facing policies.

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end; $$;
create trigger requests_touch_updated_at before update on public.requests for each row execute function public.touch_updated_at();

create or replace function public.schedule_request_reminders() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.reminder_jobs(request_id,job_type,due_at) values
    (new.id,'12_hour_reminder',new.created_at + interval '12 hours'),
    (new.id,'24_hour_overdue',new.created_at + interval '24 hours')
  on conflict(request_id,job_type) do nothing;
  insert into public.request_activity(request_id,partner_id,actor_id,action_type,new_value)
  values(new.id,new.partner_id,new.sender_id,'request_created',jsonb_build_object('status',new.status,'request_code',new.request_code));
  insert into public.notifications(recipient_id,actor_id,request_id,type,title,description)
  values(new.receiver_id,new.sender_id,new.id,'new_request_received','New Request Received', 'A new collaboration request is waiting for your review.');
  return new;
end; $$;
create trigger requests_after_insert after insert on public.requests for each row execute function public.schedule_request_reminders();

create or replace function public.mark_request_seen(target_request uuid) returns void language plpgsql security definer set search_path=public as $$
declare r public.requests;
begin
  select * into r from public.requests where id=target_request for update;
  if not found then raise exception 'Request not found'; end if;
  if auth.uid() is distinct from r.receiver_id and not public.is_admin() then raise exception 'Not authorized'; end if;
  if r.first_viewed_at is null then
    update public.requests set first_viewed_at=now(), status=case when status='new_request' then 'seen'::public.request_status else status end, last_updated_by=auth.uid() where id=target_request;
    insert into public.request_activity(request_id,partner_id,actor_id,action_type,new_value) values(target_request,r.partner_id,auth.uid(),'request_viewed',jsonb_build_object('first_viewed_at',now()));
    insert into public.notifications(recipient_id,actor_id,request_id,type,title,description) values(r.sender_id,auth.uid(),target_request,'request_viewed','Request Viewed','Your collaboration request has been opened.');
  end if;
end; $$;
revoke all on function public.mark_request_seen(uuid) from public;
grant execute on function public.mark_request_seen(uuid) to authenticated;

-- Keep the invitation acceptance notification compatible with the API.
