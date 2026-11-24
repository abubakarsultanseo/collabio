# Collabio implementation status

## Included in this update

- Foundation: Google and email/password sign-in, protected routes, 48-hour invitations, invitation acceptance, automatic partner workspace creation, team role/account controls, partner directory, and admin-managed permissions.
- Permissions: request visibility, creation, editing, status changes, comments, activity history, deletion, and report access. Permission changes are recorded in `permission_history`.
- Collaboration core: requests in both directions inside the same admin-partner workspace; request number, source page, anchor, target URL, request type, instructions, notes, created/updated times, first-viewed time, 24-hour deadline, and status.
- Request views: inbox, sent, pending/overdue, filters, search, editable request fields, status updates, and a shared message thread.
- Activity and alerts: in-app notifications, unread tracking, request activity, comments, event emails for new requests/views/status/comments, 12-hour reminder jobs, and 24-hour overdue jobs. Vercel Cron invokes the secured reminder endpoint every 15 minutes. Reminder email uses Resend when configured.
- Dashboard and UI: responsive left sidebar and mobile menu, admin and partner metrics, recent requests, deadlines, partner workspaces, and responsive forms/lists.
- SEO partner directory from migration `0004_seo_partners.sql` remains available in each workspace, with admin cross-workspace review.

## Database migration order

1. Confirm which migrations are already applied and back up the correct Supabase project.
2. Apply any missing migrations 0001–0004 in order. Do not rerun migrations blindly. Migration 0003 backfills existing request records into partnerships/deals.
3. Apply `0005_permissions_and_request_workspace.sql` once after 0004. It makes `deal_id` optional for standard requests and adds permission audit history.
4. Keep `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, and `CRON_SECRET` server-only. Set invitation expiry to 48 hours.
5. Deploy a Vercel Preview and verify with an admin and a partner account before production.

## Verification performed

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with Next.js 15.5.29.

## Not verified against live services

- Applying migrations and checking existing production data/backfills.
- Two-account RLS behavior and role/permission enforcement against the live Supabase project.
- Live invitation acceptance, Google OAuth, Resend delivery, and Vercel Cron execution.
- Email delivery, including event and reminder messages, depends on verified Resend sender settings.
- CSV/Excel exports and monthly reports from Phase 5/4 expansion.
