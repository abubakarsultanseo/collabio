begin;

-- Collaboration requests do not need a quota deal to exist in a partner workspace.
alter table public.requests alter column deal_id drop not null;

create table public.permission_history (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.profiles(id) on delete cascade,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  previous_values jsonb not null,
  new_values jsonb not null,
  changed_at timestamptz not null default now()
);
create index permission_history_partner_idx on public.permission_history(partner_id, changed_at desc);
alter table public.permission_history enable row level security;
create policy permission_history_admin_select on public.permission_history for select using (public.is_admin());

-- Route request mutations through server-side permission checks. Direct partner
-- table updates/inserts cannot bypass the permission engine.
drop policy if exists requests_select_partnership_members on public.requests;
drop policy if exists requests_insert_partnership_members on public.requests;
drop policy if exists requests_update_partnership_members on public.requests;
create policy requests_select_with_permissions on public.requests for select using (
  public.is_admin() or (
    public.is_active_user() and public.is_partnership_member(partnership_id) and
    (not exists(select 1 from public.partner_permissions pp where pp.partner_id=auth.uid()) or
      exists(select 1 from public.partner_permissions pp where pp.partner_id=auth.uid() and pp.view_requests))
  )
);
create policy requests_insert_admin_only on public.requests for insert with check (public.is_admin());
create policy requests_update_admin_only on public.requests for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists comments_select_participants on public.request_comments;
drop policy if exists comments_insert_participants on public.request_comments;
create policy comments_select_with_permissions on public.request_comments for select using (
  public.is_admin() or exists(select 1 from public.requests r where r.id=request_id and r.partner_id=auth.uid() and public.is_active_user()
    and (not exists(select 1 from public.partner_permissions pp where pp.partner_id=auth.uid()) or
      exists(select 1 from public.partner_permissions pp where pp.partner_id=auth.uid() and pp.view_requests)))
);
create policy comments_insert_admin_only on public.request_comments for insert with check (public.is_admin());

drop policy if exists activity_select_scope on public.request_activity;
create policy activity_select_with_permissions on public.request_activity for select using (
  public.is_admin() or (partner_id=auth.uid() and public.is_active_user() and
    (not exists(select 1 from public.partner_permissions pp where pp.partner_id=auth.uid()) or
      exists(select 1 from public.partner_permissions pp where pp.partner_id=auth.uid() and pp.view_activity_history)))
);

commit;
