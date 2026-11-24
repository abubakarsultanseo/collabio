# Collabio release status

## Included in this ZIP
- Phase 1 team setup: email/password login, Google OAuth callback, invite acceptance, admin-only team and invitation view, role changes, account activation/deactivation, active-admin protection, and protected workspace routes.
- Invitation diagnostics identify missing Supabase environment variable names without exposing values; missing email settings are checked before an invitation row is created. Existing pending invites can be replaced cleanly, and pending Google-auth profiles can finish setup through their email invitation.
- Default invitation expiry is 72 hours.
- Phase 2 SEO partner directory: create, view, update, and delete records; search by partner details; filter by status; store website, DR, traffic, contact, niche, country, notes, and status; admin can review records by workspace.
- New migration `0004_seo_partners.sql` creates the directory table and row-level security policies. Team members see and edit their own records; active admins can review all workspaces.
- Shared partnerships for two active Collabio users, with database access rules for partnership members.
- Deals with flexible side quotas, edit history, calculated Live/pending/remaining/over-quota values, and automatic close/reopen behavior.
- Deal-linked request creation, status updates, reassignment between deals, Live/Shared timestamps, stale Shared dashboard indicators and in-app notifications.
- Responsive workspace navigation, dashboard partner summaries, and partnership/deal screens based on the supplied outreach-tool UI reference.

## Required deployment steps
1. Confirm this is the correct Collabio Supabase project and take a backup.
2. Check which migrations are already applied. Do not rerun migrations 0001 or 0002 on an initialized database.
3. Apply migration `0003_shared_partnership_deals.sql` only after migrations 0001 and 0002. It maps old requests to Legacy deals and raises a clear error if any record cannot be mapped.
4. Apply migration `0004_seo_partners.sql` once after 0003.
5. Set `NEXT_PUBLIC_SITE_URL=https://www.collabio.online` and `INVITATION_EXPIRY_HOURS=72` in the correct Vercel environments. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
6. Deploy to Preview first and verify with two active test accounts before production.

## Verification performed for this ZIP
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with Next.js 15.5.29.

## Not verified against live services
- Supabase migration execution and existing production request backfill.
- Migration `0004` execution, private workspace RLS behavior, and admin cross-workspace review against the live database.
- Live team changes, invitation acceptance, and the updated missing-environment-variable diagnostic.
- Two-account RLS behavior, live invitations, Google OAuth, and Resend email delivery.
- Optional email-on-Live and weekly summary scheduler. In-app notifications and stale Shared dashboard counts are included; scheduled email summaries are not.
