# Deployment guide

1. Create a new Supabase project dedicated to Partner Collaboration Manager.
2. Apply migrations in `supabase/migrations/` in ascending order using Supabase SQL Editor or Supabase CLI.
3. Configure Supabase Auth Site URL and Redirect URLs for the Vercel domain.
4. Add environment variables from `.env.example` to Vercel Project Settings → Environment Variables.
5. Configure Resend and verify `rankviz.com` DNS before sending to external recipients.
6. Import the private GitHub repository into Vercel and deploy.

Never commit `.env.local`. `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` are secret server-side values. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_APP_URL` are browser-visible configuration values, not privileged credentials.

For browser-only GitHub workflow, create a private repository, open it in GitHub Codespaces, upload/extract the project files in the browser, commit, then import the repository into Vercel. A ZIP uploaded as a single file is not a deployable Next.js repository.
