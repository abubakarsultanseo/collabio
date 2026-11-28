create table public.seo_partners (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  website_url text not null,
  domain_rating numeric(5,2) check (domain_rating is null or domain_rating between 0 and 100),
  organic_traffic bigint check (organic_traffic is null or organic_traffic >= 0),
  email text,
  contact_person text,
  niche text,
  country text,
  notes text,
  status text not null default 'prospect' check (status in ('prospect','contacted','active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index seo_partners_owner_created_idx on public.seo_partners(owner_id, created_at desc);
create index seo_partners_owner_status_idx on public.seo_partners(owner_id, status);
alter table public.seo_partners enable row level security;

create policy seo_partners_select_owner_or_admin on public.seo_partners
  for select using (public.is_active_user() and (owner_id = auth.uid() or public.is_admin()));
create policy seo_partners_insert_owner_or_admin on public.seo_partners
  for insert with check ((owner_id = auth.uid() and public.is_active_user()) or public.is_admin());
create policy seo_partners_update_owner_or_admin on public.seo_partners
  for update using (public.is_active_user() and (owner_id = auth.uid() or public.is_admin()))
  with check ((owner_id = auth.uid() and public.is_active_user()) or public.is_admin());
create policy seo_partners_delete_owner_or_admin on public.seo_partners
  for delete using (public.is_active_user() and (owner_id = auth.uid() or public.is_admin()));
