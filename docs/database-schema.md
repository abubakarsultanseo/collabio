# Database Schema Notes

Existing migrations `0001` through `0014` are preserved. New work starts at `0015_realtime_chat_and_preferences.sql`.

## Migration 0015

- `profiles.last_partnership_id`: cross-device Requests partner preference.
- `profiles.last_seen_at` and `profiles.hide_last_seen`: presence timestamp and privacy preference foundations.
- `request_comments` and `direct_chat_messages`: delivered, edited, deleted and reply-to metadata columns.
- `message_reactions`: one row per user/message/kind, with a uniqueness constraint and message lookup index.
- `message_attachments`: attachment metadata with a 10 MB database constraint and indexes by message/thread.
- `chat-attachments`: private Storage bucket with a 10 MB file limit and allow-listed MIME types.
- Direct message read RLS is explicitly limited to the admin/partner participants. Request comment read remains governed by the existing participant policy.

The migration is additive and does not edit prior migration files. Apply it once in Supabase SQL Editor before deploying code that uses the new profile preference column.

## Important implementation note

The reaction and attachment tables are schema foundations only in this release. Their full write endpoints and UI are not yet implemented. Do not treat their existence as proof that reaction/attachment flows are ready.
