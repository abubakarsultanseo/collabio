# Deployment guide

1. Confirm the Collabio Supabase project and take a database backup.
2. Check which migrations are already applied. Run 0001 only for a fresh database, then 0002 if missing, then 0003 once. Never rerun an earlier migration blindly.
3. Configure Supabase Auth Site URL and Redirect URLs for the Vercel domain.
4. Add environment variables from `.env.example` to Vercel Project Settings → Environment Variables. Include `NEXT_PUBLIC_SITE_URL=https://www.collabio.online` and `INVITATION_EXPIRY_HOURS=72`.
5. Keep `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` server-only. Configure Resend and verify sender-domain DNS before sending external email.
6. Upload the project contents to a separate GitHub branch, deploy a Vercel Preview, and verify the app with two test users before merging to production.

Never commit `.env.local`. `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` are secret server-side values. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_APP_URL` are browser-visible configuration values, not privileged credentials.

For browser-only GitHub workflow, extract the ZIP, upload the contents of `collabio-main/` into the repository root on a new branch, then open a Preview deployment. A ZIP uploaded as a single file is not a deployable Next.js repository.
