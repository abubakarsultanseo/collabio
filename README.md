# Collabio

Collabio is an invite-only collaboration workspace for managing SEO outreach partners and two-way placement requests.

## Current build status

This update follows the supplied five-phase product brief: invite and permission management, private SEO partner directories, two-way partner workspaces, request inbox/sent views, status and activity history, in-app notifications, messages, a responsive sidebar, and an activity dashboard. A scheduled job handles 12-hour reminders and 24-hour overdue alerts. Review [`docs/phase-1-to-3-review.md`](docs/phase-1-to-3-review.md) and [`docs/deal-system.md`](docs/deal-system.md) before deploying.

## Stack
- Next.js App Router, React, TypeScript, Tailwind CSS
- Supabase Auth, PostgreSQL and Row Level Security
- Resend email delivery
- Vercel hosting

## Environment variables

| Variable | Purpose | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side privileged Supabase access | **Yes** |
| `RESEND_API_KEY` | Resend email API | **Yes** |
| `EMAIL_FROM` | Verified sender identity | No |
| `EMAIL_REPLY_TO` | Optional inbox for replies to invitation emails | No |
| `NEXT_PUBLIC_SITE_URL` | Public Collabio URL | No |
| `NEXT_PUBLIC_APP_URL` | Backward-compatible URL fallback | No |
| `INVITATION_EXPIRY_HOURS` | Invitation lifetime (default 48) | No |
| `APP_TIMEZONE` | Display timezone | No |
| `CRON_SECRET` | Protects the reminder scheduler endpoint | **Yes** |

Never commit `.env.local`, API keys, or the Supabase service-role key. `.env.local` is ignored by Git.

## Database migrations

Apply SQL migrations in numeric order in the Supabase SQL Editor. Do not rerun migrations already applied. After confirming migrations 0001 through 0004, apply `0005_permissions_and_request_workspace.sql` once. It allows requests without quota deals and adds permission audit history.

## Local development

Install Node.js LTS, then run `npm install`, copy `.env.example` to `.env.local`, fill in the values, and run `npm run dev`.

## Verification

Typecheck, lint, and production build passed before the Hobby-plan scheduling adjustment. Live Supabase, Resend and OAuth behavior cannot be confirmed from the ZIP alone. Apply migration 0005, configure `CRON_SECRET` in Vercel and as a GitHub Actions repository secret, then deploy. GitHub Actions calls the secured reminder endpoint every 30 minutes because Vercel Hobby does not allow 15-minute Cron schedules.
