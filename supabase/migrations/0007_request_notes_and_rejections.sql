begin;

alter table public.requests add column rejection_reason text;

create function public.validate_request_rejection() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'rejected' and new.rejection_reason is null and tg_op = 'UPDATE' then
    if old.status = 'rejected' and old.rejection_reason is null then
      return new; -- Existing rejections may predate reasons.
    end if;
  end if;
  if new.status = 'rejected' then
    new.rejection_reason := btrim(new.rejection_reason);
    if new.rejection_reason is null or new.rejection_reason !~ '[^[:space:]]'
       or char_length(new.rejection_reason) > 2000 then
      raise exception 'A rejection reason is required (maximum 2,000 characters).'
        using errcode = '23514';
    end if;
  else
    new.rejection_reason := null;
  end if;
  return new;
end;
$$;

create trigger request_rejection_requires_reason
before insert or update of status, rejection_reason on public.requests
for each row execute function public.validate_request_rejection();

create or replace function public.log_request_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare recipient uuid;
begin
  if old.status is distinct from new.status or old.rejection_reason is distinct from new.rejection_reason then
    insert into public.request_activity(request_id,partner_id,actor_id,action_type,previous_value,new_value)
    values(new.id,new.partner_id,coalesce(new.last_updated_by,auth.uid(),new.sender_id),'status_changed',
      jsonb_strip_nulls(jsonb_build_object('status',old.status::text,'reason',old.rejection_reason)),
      jsonb_strip_nulls(jsonb_build_object('status',new.status::text,'reason',new.rejection_reason)));
    select case when new.last_updated_by=p.user_a_id then p.user_b_id else p.user_a_id end into recipient
      from public.partnerships p where p.id=new.partnership_id;
    if recipient is not null and old.status is distinct from new.status then
      insert into public.notifications(recipient_id,actor_id,request_id,type,title,description)
      values(recipient,coalesce(new.last_updated_by,auth.uid(),new.sender_id),new.id,'request_status_changed','Request status updated',
        'A shared request status changed to '||replace(new.status::text,'_',' ')||'.');
    end if;
  end if;
  return new;
end;
$$;

drop trigger requests_log_status_change on public.requests;
create trigger requests_log_status_change after update of status, rejection_reason on public.requests
for each row execute function public.log_request_status_change();

create table public.request_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (body ~ '[^[:space:]]' and char_length(body) <= 5000),
  created_at timestamptz not null default clock_timestamp()
);
create index request_notes_thread_idx on public.request_notes(request_id, created_at desc, id desc);
alter table public.request_notes enable row level security;
revoke all on public.request_notes from public, anon, authenticated;
grant select, insert on public.request_notes to service_role;

commit;
