-- Run in a disposable Supabase test project after applying migrations 0001-0015.
-- This is a structural security regression check. For row-level identity tests,
-- seed two partners, their admin, and an unrelated active user in the test harness.
begin;
select plan(8);
select has_table('public','message_reactions','message reactions table exists');
select has_table('public','message_attachments','message attachments table exists');
select ok((select relrowsecurity from pg_class where oid='public.message_reactions'::regclass),'message_reactions has RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.message_attachments'::regclass),'message_attachments has RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.direct_chat_messages'::regclass),'direct_chat_messages has RLS enabled');
select ok(exists(select 1 from storage.buckets where id='chat-attachments' and public=false),'chat attachments bucket is private');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='direct_chat_messages' and policyname='direct_chat_messages_participant_read'),'direct chat participant read policy exists');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='message_reactions' and policyname='message_reactions_participant_read'),'reaction participant read policy exists');
select * from finish();
rollback;
