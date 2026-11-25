begin;

create or replace view public.partnership_exchange_summary
with (security_invoker = true) as
with live_placements as (
  select r.partnership_id,
    count(*) filter (where r.receiver_id = p.user_a_id)::integer as side_a_given,
    count(*) filter (where r.receiver_id = p.user_b_id)::integer as side_b_given,
    count(*) filter (
      where r.receiver_id = p.user_a_id and d.first_link_side is null
    )::integer as side_a_previous,
    count(*) filter (
      where r.receiver_id = p.user_b_id and d.first_link_side is null
    )::integer as side_b_previous
  from public.requests r
  join public.partnerships p on p.id = r.partnership_id
  left join public.deals d on d.id = r.deal_id
  where r.status = 'live'
  group by r.partnership_id
), tracked_due as (
  select partnership_id, sum(side_a_due)::integer as side_a_due,
    sum(side_b_due)::integer as side_b_due
  from public.tracked_exchange_balances
  group by partnership_id
), previous_due as (
  select partnership_id, side_a_given, side_b_given,
    greatest(0, side_b_previous - side_a_previous) as side_a_due,
    greatest(0, side_a_previous - side_b_previous) as side_b_due
  from live_placements
)
select p.id as partnership_id,
  coalesce(h.side_a_given, 0) as side_a_given,
  coalesce(h.side_b_given, 0) as side_b_given,
  coalesce(t.side_a_due, 0) + coalesce(h.side_a_due, 0) as side_a_due,
  coalesce(t.side_b_due, 0) + coalesce(h.side_b_due, 0) as side_b_due,
  coalesce(h.side_a_due, 0) as side_a_previous_due,
  coalesce(h.side_b_due, 0) as side_b_previous_due
from public.partnerships p
left join previous_due h on h.partnership_id = p.id
left join tracked_due t on t.partnership_id = p.id;

alter table public.profiles add column deleted_at timestamptz,
  add constraint profiles_deleted_partner_state
    check (deleted_at is null or (role = 'partner' and account_status = 'deactivated'));

create view public.listed_partnerships with (security_invoker = true) as
select p.*
from public.partnerships p
join public.profiles a on a.id = p.user_a_id
join public.profiles b on b.id = p.user_b_id
where a.deleted_at is null and b.deleted_at is null;

revoke all on public.listed_partnerships from public, anon, authenticated;
grant select on public.listed_partnerships to service_role;

create function public.delete_collabio_partner(p_admin uuid, p_partner uuid)
returns boolean language plpgsql set search_path = public as $$
declare
  partner_email text;
  was_deleted timestamptz;
begin
  if not exists (
    select 1 from public.profiles where id = p_admin
      and role = 'admin' and account_status = 'active'
  ) then
    raise exception 'Admin required' using errcode = '42501';
  end if;

  select lower(email) into partner_email from public.profiles
    where id = p_partner and role = 'partner';
  if not found then return false; end if;

  -- Invitation acceptance takes the invitation lock before the profile lock.
  perform 1 from public.invitations
    where lower(email) = partner_email and status = 'pending' for update;

  select deleted_at into was_deleted from public.profiles
    where id = p_partner and role = 'partner' for update;
  if not found then return false; end if;

  if was_deleted is null then
    update public.profiles set account_status = 'deactivated', deleted_at = now()
      where id = p_partner;
  end if;

  update public.invitations set status = 'revoked', revoked_at = now()
    where lower(email) = partner_email and status = 'pending';
  update public.reminder_jobs j set processed_at = now()
    from public.requests r
    where j.request_id = r.id and r.partner_id = p_partner and j.processed_at is null;
  return true;
end;
$$;

revoke all on function public.delete_collabio_partner(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_collabio_partner(uuid, uuid) to service_role;

commit;
