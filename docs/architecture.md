# Architecture

The application uses Next.js App Router with TypeScript. Supabase provides PostgreSQL, Auth and Row Level Security. Browser code uses only the Supabase anon/publishable key. Privileged operations use a server-only service-role client and must never be imported into Client Components.

## Trust boundaries
- Browser: presentation and user-initiated requests only.
- Next.js server routes: authentication, role checks, Zod validation and privileged workflows.
- Supabase RLS: database-level isolation, independent of UI visibility.
- Resend: transactional email delivery from server routes only.

## Identity
Profiles are linked one-to-one to `auth.users`. New auth identities default to the partner role and pending status. Admin provisioning is a separate, controlled setup step. Google OAuth does not grant admin privileges.

## Invitations
A cryptographically random 256-bit token is emailed to the invited address. Only its SHA-256 hash is stored. The acceptance endpoint checks pending state and expiry before creating an Auth user and private workspace records.

## Deployment
Deploy the GitHub repository to Vercel. Configure environment variables in Vercel Project Settings. Configure Supabase Auth redirect URLs for both local development and the production domain.

## Automation decision
Phase 3 will use Supabase `pg_cron` to invoke a secured Edge Function through `pg_net` every five minutes. This runs independently of a browser and avoids relying on Vercel Hobby's daily cron limit. The function must be idempotent and log each attempt.
