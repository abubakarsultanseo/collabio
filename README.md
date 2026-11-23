# Collabio

Collabio is an invite-only collaboration workspace for managing SEO outreach partners and two-way placement requests.

## Current build status

This update adds shared two-user partnerships, flexible link-exchange deals, calculated balances, request status tracking, quota history, and stale Shared indicators to the supplied Collabio foundation. Review [`docs/phase-1-to-3-review.md`](docs/phase-1-to-3-review.md) and [`docs/deal-system.md`](docs/deal-system.md) before deploying.

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
| `INVITATION_EXPIRY_HOURS` | Invitation lifetime (default 72) | No |
| `APP_TIMEZONE` | Display timezone | No |
| `CRON_SECRET` | Protects a future scheduled runner | **Yes** |

Never commit `.env.local`, API keys, or the Supabase service-role key. `.env.local` is ignored by Git.

## Database migrations

Apply SQL migrations in numeric order in the Supabase SQL Editor. Do not rerun migration 0001 or 0002 if already applied. Apply 0003 only after confirming the earlier migrations and backing up the database. The new migration maps existing requests into per-member Legacy deals and stops safely if an old request cannot be mapped.

## Local development

Install Node.js LTS, then run `npm install`, copy `.env.example` to `.env.local`, fill in the values, and run `npm run dev`.

## Verification

Before production, run `npm run typecheck`, `npm run lint`, and `npm run build` in a network-enabled environment. Verify the migration, invitation, both partnership member logins, deal quota balances, status changes, stale flags, and RLS on a Preview deployment first. Live Supabase, Resend and OAuth behavior are not verified by the ZIP preparation process.
