# Collabio implementation status (review build)

This ZIP contains a compatibility/stabilization update to the supplied project. It is **not a declaration that Phases 1–3 are complete**.

## Included in this update
- Invitation URL now prefers `NEXT_PUBLIC_SITE_URL` and retains `NEXT_PUBLIC_APP_URL` as a backward-compatible fallback.
- Default invitation expiry is aligned to the master prompt's 48 hours (can be overridden with `INVITATION_EXPIRY_HOURS`).
- Collabio branding replaces the previous generic project name in the main screens and invitation email.
- Added migration `0002_collaboration_and_notifications.sql` for request records, comments, activity, notifications, email logs, reminder jobs, participant-scoped RLS, request-created notifications, reminder scheduling records, and first-view tracking.
- `.env.example` documents `NEXT_PUBLIC_SITE_URL` and `CRON_SECRET`.

## Required before deploying this ZIP
1. Apply `supabase/migrations/0001_foundation.sql` only if it has not already been applied to this new Collabio Supabase project.
2. Apply `supabase/migrations/0002_collaboration_and_notifications.sql` after migration 0001.
3. Set `NEXT_PUBLIC_SITE_URL=https://www.collabio.online` in Vercel. Keep `NEXT_PUBLIC_APP_URL` only if another existing part of the deployment still relies on it.
4. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Never expose it through a `NEXT_PUBLIC_` variable.

## Not yet complete / not verified
- Complete request creation/edit/status UI and server-side permission enforcement for all ten permission toggles.
- Admin/partner workspace navigation and complete private workspace UX.
- End-to-end comments and activity-history UI.
- A deployed, independently scheduled 5–15 minute reminder runner that sends Resend emails, records idempotent delivery, and handles overdue transitions. The migration creates reminder job records but does not itself execute or email them.
- Full RLS isolation tests using two partner identities and one admin identity.
- End-to-end invite, login, request, email and reminder tests against the user's live Supabase/Resend accounts.

The local dependency installation timed out in this environment, so a fresh `npm run build` and `npm run typecheck` could not be completed. Do not treat this ZIP as production-ready until the remaining items and build are verified.
