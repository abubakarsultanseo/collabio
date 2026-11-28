# Security and RLS Notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser code or variables prefixed with `NEXT_PUBLIC_`.
- All new metadata tables in migration 0015 have RLS enabled.
- Direct chat Realtime reads are limited by `admin_id = auth.uid()` or `partner_id = auth.uid()`.
- Request comment Realtime reads use the pre-existing `comments_select_participants` policy, which checks the parent request participants or admin status.
- The private `chat-attachments` bucket has a participant-read policy. The upload/download API and signed URL workflow are not included yet; keep the bucket private.
- `/api/preferences/last-partnership` checks active account status and validates membership before saving a partnership ID.
- Privileged operations remain server-only. New routes should use `getAuthUser()` and Zod validation.

## Required live verification

Run `supabase/tests/rls-chat-realtime.sql` in a disposable test project after applying migrations. Then use two partner accounts, the admin and an unrelated account to verify isolation. This package has not been connected to the user's live Supabase project, so live RLS and Realtime behavior remain unverified.
