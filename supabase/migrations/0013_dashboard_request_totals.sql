begin;

create index if not exists requests_sender_created_idx
  on public.requests(sender_id, created_at desc, id desc);
create index if not exists requests_receiver_created_idx
  on public.requests(receiver_id, created_at desc, id desc);
create index if not exists request_activity_request_time_idx
  on public.request_activity(request_id, action_type, created_at desc, id desc);

create or replace function public.collabio_dashboard_request_totals(p_viewer uuid)
returns table (
  partnership_id uuid,
  total bigint,
  sent bigint,
  received bigint,
  live bigint,
  overdue bigint,
  awaiting_review bigint,
  received_today bigint,
  sent_today bigint
)
language sql stable set search_path = public as $$
  with viewer as (
    select id, role from public.profiles where id = p_viewer and account_status = 'active'
  ), today as (
    select date_trunc('day', now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi' as start_at
  )
  select r.partnership_id, count(*),
    count(*) filter (where r.sender_id = v.id),
    count(*) filter (where r.receiver_id = v.id),
    count(*) filter (where r.status = 'live'),
    count(*) filter (
      where r.status not in ('live', 'removed', 'rejected')
        and (r.was_overdue or r.status = 'overdue'
          or (r.import_key is null and r.first_viewed_at is null and r.deadline_at < now()))
    ),
    count(*) filter (
      where r.receiver_id = v.id and r.import_key is null
        and r.first_viewed_at is null and r.status = 'new_request'
    ),
    count(*) filter (
      where r.receiver_id = v.id and not r.import_date_unknown and r.created_at >= today.start_at
    ),
    count(*) filter (
      where r.sender_id = v.id and not r.import_date_unknown and r.created_at >= today.start_at
    )
  from public.requests r
  join public.partnerships p on p.id = r.partnership_id
  cross join viewer v
  cross join today
  where r.status <> 'cancelled' and (
    v.role = 'admin' or (
      v.id in (p.user_a_id, p.user_b_id)
      and not exists (
        select 1 from public.partner_permissions permission
        where permission.partner_id = v.id and not permission.view_requests
      )
    )
  )
  group by r.partnership_id;
$$;

revoke all on function public.collabio_dashboard_request_totals(uuid) from public, anon, authenticated;
grant execute on function public.collabio_dashboard_request_totals(uuid) to service_role;

commit;
