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

## Request workflow update

Apply `supabase/migrations/0007_request_notes_and_rejections.sql` after 0006, before deploying this build. Existing rejected requests keep their history even if no reason was recorded at the time.

- The header bell shows unread notifications. The floating Chat button opens the direct chat contacts for the assigned admin and opens the partner’s direct thread on partner accounts.
- The chat popup can be moved on desktop using the three dots, or using arrow keys while the handle has focus. Minimize and restore to keep a draft during the current session. Enter sends a message and Shift+Enter adds a line.
- Open a request with **View**, add shared notes via **Add note**, and use the status control in the list. Rejecting requires a reason. Only admins can change request fields or delete records.
- In a preview, verify these actions as the assigned admin and as a partner. Check rejection with blank and valid reasons, copy the full request, and confirm note and reason visibility stays within the request workspace.

## Local development

Install Node.js LTS, then run `npm install`, copy `.env.example` to `.env.local`, fill in the values, and run `npm run dev`.

## Verification

Run `npm run typecheck`, `npm run lint`, and `npm run build` before deploying. Verify live Supabase, Resend, and OAuth behavior in a preview. The included GitHub Actions workflow calls the reminder endpoint on a 30-minute schedule. When using the workflow, set the same `CRON_SECRET` in Vercel and GitHub Actions.

## Google sign-in, branded email, and historical imports

1. Apply `supabase/migrations/0008_partner_onboarding.sql` once, after 0007 and before deploying this build.
2. Enable the Google provider in **Supabase → Authentication → Providers**. Keep the Supabase callback URL in Google Cloud's authorized redirect URIs and add the app's exact `/auth/callback` URL to Supabase's redirect allowlist for production and the Vercel Preview you use for testing.
3. Verify that the existing admin can sign in with Google using the email of their existing Collabio account. Verify an invited partner can accept with the invited Google address and gets an error if they select another account. Collabio's sign-in page now offers Google only.
4. Set `NEXT_PUBLIC_SITE_URL` to the deployed Collabio origin so Resend emails point to the correct request or conversation. Preview a status email in Gmail or Outlook and check its subject, named actor, before and after status, rejection reason, and request link.
5. For each partner, go to **Import requests**, download the CSV template, and map the sheet to the template. Select **Sent** for your original requests and **Received** for the partner's original requests. Use the exact invited Google email. Preview the counts and flagged rows, confirm the import, and verify the requests in the partner workspace before sending an invitation. The import stores historical requests without triggering new request emails or review reminders. It can stage a pending account when the partner has one yet to activate.

Use batches of up to 1,000 rows or 2 MB per CSV. Add a stable `source_id` when available to help identify repeat uploads. Keep original dates in ISO format and supply the original reason for rejected records. The importer flags ambiguous or invalid rows for review before saving.

## Google sign-in popup and branding

The homepage now checks the session and sends visitors to `/login` or `/dashboard`. The Google button opens an account chooser in a separate window. The workspace opens in the original window after sign-in. When a browser blocks the popup, Collabio opens the sign-in flow in the current tab.

### Use the official Google button and show the Collabio name

1. Open the Google Cloud project for the **same Web application OAuth client** configured in Supabase's Google provider. Under **Google Auth Platform → Branding**, set the app name to **Collabio**, complete the domain and brand setup, and submit for verification if required for your external production app.
2. Under that OAuth client's **Authorized JavaScript origins**, add `https://collabio.online` and `https://www.collabio.online` if both hosts serve the app. Add the exact preview origin when testing a Vercel Preview.
3. Add `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in Vercel with that Web OAuth client ID, ending in `.apps.googleusercontent.com`. Redeploy. The client ID is public. Keep the client secret in Supabase's Google provider settings.
4. Keep the Supabase **Authentication → URL Configuration** allowlist aligned with the deployed origin. For the fallback sign-in flow, register the app's exact `/auth/callback` URL for each active hostname. Under the Google OAuth client, keep the Supabase provider callback URL in **Authorized redirect URIs**.

The official Google button sends a nonce-bound Google credential to Collabio, where Supabase verifies it. Google controls the name and account chooser. The fallback uses the Supabase OAuth redirect and may show its project hostname. To brand the fallback hostname too, configure a Supabase custom domain such as `auth.collabio.online` and register that domain's `/auth/v1/callback` with Google before activating it.

### Check a dashboard server error

Confirm migration `0008_partner_onboarding.sql` has already run once in the production Supabase project. The dashboard can render if the optional avatar or historical request column is absent. Imported requests, invitation activation and other features from migration 0008 still depend on that migration. If the dashboard error recurs, use the reference on the error screen to find the server exception in Vercel's runtime logs. Verify that the URL, anon key and service-role key in Vercel belong to the same Supabase project.
