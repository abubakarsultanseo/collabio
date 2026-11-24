# Collabio

Collabio is an invite-only collaboration workspace for managing SEO outreach partners and two-way placement requests.

## Current build status

This update follows the supplied five-phase product brief: invite and permission management, two-way partner workspaces, request inbox/sent views, status and activity history, in-app notifications, request discussions, monthly reports, Excel exports, bulk request entry, advanced filters, and responsive dashboards. A scheduled job handles 12-hour reminders and 24-hour overdue alerts. Review [`docs/phase-1-to-3-review.md`](docs/phase-1-to-3-review.md) and [`docs/deal-system.md`](docs/deal-system.md) before deploying.

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

## Chat update

1. Apply `supabase/migrations/0006_private_chat.sql` in Supabase after migrations 0001–0005. Deploy the updated app afterward.
2. In Vercel, set `CHAT_ADMIN_USER_ID` to Abubakar’s UUID from **Supabase → Authentication → Users**. A single active admin is used automatically if this variable is empty. If more than one admin is active, the variable is required and other admins cannot open direct chats.
3. Keep the existing `RESEND_API_KEY` and reminder workflow configured if you use request chat email alerts. Replies are saved before email delivery. The existing scheduled reminder endpoint also retries queued request chat emails. Direct chats are available inside Collabio.
4. In a Vercel Preview, sign in as the assigned admin and two partner accounts. Confirm each partner sees only their direct conversation, request chat history loads independently, and opening the chat leaves the request’s Seen status and review timer unchanged. Verify an admin can reply to both partners and a partner can reply in their own chat.

Chat polls for new messages every five seconds while the panel is open and the tab is visible. Unread counts refresh separately. Existing request comments are retained and initially count as unread until the recipient opens the thread.

## Local development

Install Node.js LTS, then run `npm install`, copy `.env.example` to `.env.local`, fill in the values, and run `npm run dev`.

## Verification

Run `npm run typecheck`, `npm run lint`, and `npm run build` before deploying. Verify live Supabase, Resend, and OAuth behavior in a preview. The included GitHub Actions workflow calls the reminder endpoint on a 30-minute schedule. When using the workflow, set the same `CRON_SECRET` in Vercel and GitHub Actions.
