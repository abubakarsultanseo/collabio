# Collabio

Collabio is an invite-only collaboration workspace for managing SEO outreach partners and two-way placement requests.

## Current build status

This is a stabilization and database-foundation update based on the supplied project ZIP. It does **not** yet complete Phases 1–3 of the original master prompt. See [`docs/phase-1-to-3-review.md`](docs/phase-1-to-3-review.md) for included changes, migration order, and outstanding work.

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
| `NEXT_PUBLIC_SITE_URL` | Public Collabio URL | No |
| `NEXT_PUBLIC_APP_URL` | Backward-compatible URL fallback | No |
| `INVITATION_EXPIRY_HOURS` | Invitation lifetime (default 48) | No |
| `APP_TIMEZONE` | Display timezone | No |
| `CRON_SECRET` | Protects a future scheduled runner | **Yes** |

Never commit `.env.local`, API keys, or the Supabase service-role key. `.env.local` is ignored by Git.

## Database migrations

Apply SQL migrations in numeric order in the Supabase SQL Editor. Do not rerun migration 0001 on an already initialized project. Apply migration 0002 after 0001. Back up the project before applying schema changes.

## Local development

Install Node.js LTS, then run `npm install`, copy `.env.example` to `.env.local`, fill in the values, and run `npm run dev`.

## Verification

Run `npm run typecheck`, `npm run lint`, and `npm run build`. Live Supabase RLS, Google OAuth, Resend delivery and scheduled-job behavior require separate manual tests. This supplied update has not passed a fresh build in the preparation environment because dependency installation timed out.
