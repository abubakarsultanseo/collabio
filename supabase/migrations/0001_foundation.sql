create extension if not exists pgcrypto;
create type public.app_role as enum ('admin','partner');
create type public.account_state as enum ('active','deactivated','pending');
create type public.invitation_state as enum ('pending','accepted','expired','revoked','email_failed');
create type public.collaboration_state as enum ('active','archived');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null unique,
 full_name text not null,
 company text,
 website text,
 role public.app_role not null default 'partner',
 account_status public.account_state not null default 'pending',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.invitations (
 id uuid primary key default gen_random_uuid(), email text not null,
 full_name text not null, company text, website text, token_hash text not null unique,
 invited_by uuid not null references public.profiles(id), status public.invitation_state not null default 'pending',
 expires_at timestamptz not null, accepted_at timestamptz, revoked_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index invitations_one_pending_per_email on public.invitations(lower(email)) where status='pending';
create table public.partners (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null unique references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.collaborations (
 id uuid primary key default gen_random_uuid(), partner_id uuid not null unique references public.profiles(id) on delete restrict,
 status public.collaboration_state not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.memberships (
 id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.profiles(id) on delete restrict,
 user_id uuid not null references public.profiles(id) on delete restrict, role text not null check(role in ('admin','partner')),
 created_at timestamptz not null default now(), unique(partner_id,user_id)
);
create table public.partner_permissions (
 id uuid primary key default gen_random_uuid(), partner_id uuid not null unique references public.profiles(id) on delete cascade,
 view_requests boolean not null default true, add_new_requests boolean not null default true,
 edit_own_requests boolean not null default true, edit_admin_requests boolean not null default false,
 edit_partner_requests boolean not null default false, update_request_status boolean not null default true,
 add_comments boolean not null default true, delete_requests boolean not null default false,
 view_activity_history boolean not null default true, download_reports boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.app_settings (
 key text primary key, value jsonb not null, updated_by uuid references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.app_settings(key,value) values
 ('application_name','"Partner Collaboration Manager"'::jsonb),('timezone','"Asia/Karachi"'::jsonb),
 ('invitation_expiry_hours','48'::jsonb),('reminder_hours','[12,24]'::jsonb),
 ('default_partner_permissions','{"view_requests":true,"add_new_requests":true,"edit_own_requests":true,"edit_admin_requests":false,"edit_partner_requests":false,"update_request_status":true,"add_comments":true,"delete_requests":false,"view_activity_history":true,"download_reports":false}'::jsonb);

create or replace function public.current_app_role() returns public.app_role language sql stable security definer set search_path=public as $$ select role from public.profiles where id=auth.uid() $$;
create or replace function public.is_active_user() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and account_status='active') $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select public.current_app_role()='admin' and public.is_active_user() $$;
create or replace function public.owns_partner_workspace(target_partner uuid) returns boolean language sql stable security definer set search_path=public as $$ select public.is_active_user() and (public.is_admin() or target_partner=auth.uid()) $$;

alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.partners enable row level security;
alter table public.collaborations enable row level security;
alter table public.memberships enable row level security;
alter table public.partner_permissions enable row level security;
alter table public.app_settings enable row level security;
create policy profiles_select_self_or_admin on public.profiles for select using (id=auth.uid() or public.is_admin());
create policy profiles_admin_update on public.profiles for update using(public.is_admin()) with check(public.is_admin());
create policy invitations_admin_all on public.invitations for all using(public.is_admin()) with check(public.is_admin());
create policy partners_select_own_or_admin on public.partners for select using(profile_id=auth.uid() or public.is_admin());
create policy partners_admin_manage on public.partners for all using(public.is_admin()) with check(public.is_admin());
create policy collaborations_select_own_or_admin on public.collaborations for select using(partner_id=auth.uid() or public.is_admin());
create policy collaborations_admin_manage on public.collaborations for all using(public.is_admin()) with check(public.is_admin());
create policy memberships_select_own_or_admin on public.memberships for select using(user_id=auth.uid() or public.is_admin());
create policy memberships_admin_manage on public.memberships for all using(public.is_admin()) with check(public.is_admin());
create policy permissions_select_own_or_admin on public.partner_permissions for select using(partner_id=auth.uid() or public.is_admin());
create policy permissions_admin_manage on public.partner_permissions for all using(public.is_admin()) with check(public.is_admin());
create policy settings_admin_all on public.app_settings for all using(public.is_admin()) with check(public.is_admin());
create policy settings_authenticated_read on public.app_settings for select using(public.is_active_user());

create or replace function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,email,full_name,role,account_status)
 values(new.id,lower(new.email),coalesce(new.raw_user_meta_data->>'full_name','User'),'partner','pending')
 on conflict(id) do nothing;
 return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_auth_user();
