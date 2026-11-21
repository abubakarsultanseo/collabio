# Partner Collaboration Manager

A private SEO outreach collaboration platform for an administrator and individually isolated partner workspaces.

## Current delivery scope
This repository is the Phase 1 foundation scaffold: Next.js App Router, Supabase clients, authentication pages, admin dashboard shell, partner invitation endpoints, database foundation migration, initial RLS policies and architecture documentation. Phase 2–5 features are intentionally not represented as complete yet.

## Requirements
- Node.js 20.9+ for local development (not required on your laptop if using browser-based Codespaces).
- A dedicated Supabase project.
- Resend account and verified sending domain for external email delivery.
- GitHub and Vercel accounts for deployment.

## Environment variables
Copy `.env.example` to `.env.local` for local development, or enter values in Vercel Project Settings → Environment Variables.

| Variable | Purpose | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key | No, protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side privileged database access | YES |
| `RESEND_API_KEY` | Email API access | YES |
| `EMAIL_FROM` | Verified sender identity | No |
| `NEXT_PUBLIC_APP_URL` | Public app URL | No |
| `APP_TIMEZONE` | Display timezone | No |
| `INVITATION_EXPIRY_HOURS` | Invitation validity | No |

## Run locally
Install dependencies with `npm install`, then run `npm run dev`. Open `http://localhost:3000`.

## Database setup
Apply SQL files in `supabase/migrations/` in filename order. Verify the tables under Supabase Dashboard → Table Editor. Do not apply migrations to the existing Inhouse Request Tracker project.

## Deployment
Push the extracted project files to a private GitHub repository, import that repository in Vercel, configure environment variables, then deploy. Update Supabase Auth URL Configuration with the Vercel production URL.

## First Admin account (bootstrap)
1. In Supabase Dashboard → Authentication → Users, create the owner Auth user for `abubakarsultan@rankviz.com` using the dashboard's user-creation flow.
2. In Supabase Dashboard → SQL Editor, run the following SQL after replacing nothing (the email is the configured owner address):

```sql
update public.profiles
set role = 'admin', account_status = 'active', full_name = 'Abubakar'
where lower(email) = lower('abubakarsultan@rankviz.com');
```

3. Confirm exactly one row was updated, then sign in through the application. Do not expose the service-role key to the browser.

## Invite a partner
After the first Admin account and Resend are configured, use My Partners → Invite Partner. The invitation is email-based and expires after the configured number of hours (72 by default).

## Troubleshooting
- Missing Supabase environment variables: check Vercel Project Settings → Environment Variables and redeploy.
- Invitation email not delivered: verify the Resend API key, sender identity and domain DNS.
- Login redirect errors: verify Supabase Authentication → URL Configuration redirect URLs.
- Permission denied: confirm profile is active and RLS policies are applied.

## Important security note
The service-role key bypasses RLS. Keep it only in server-side environment variables. Never commit secrets or `.env.local`.
