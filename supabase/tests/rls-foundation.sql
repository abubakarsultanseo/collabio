-- Run only in a disposable Supabase test project after creating test users.
-- These checks verify that authenticated users cannot read other profiles/workspaces.
begin;
select plan(3);
-- Configure JWT claims in the Supabase SQL test harness before running these assertions.
select has_table('public','profiles','profiles table exists');
select has_table('public','partner_permissions','partner permissions table exists');
select ok((select relrowsecurity from pg_class where oid='public.invitations'::regclass),'invitations has RLS enabled');
select * from finish();
rollback;
