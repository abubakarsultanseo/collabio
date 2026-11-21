# Security and RLS

- RLS is enabled on every foundation table.
- Partners can read only their own profile, workspace, membership and permission record.
- Admin policies require an active profile with role `admin`.
- Invitation tokens are generated with Node crypto and only SHA-256 hashes are persisted.
- The service-role key and Resend API key are server-only secrets. Never prefix them with `NEXT_PUBLIC_` and never commit them.
- Public signup must be disabled in Supabase Auth before production. Invitation acceptance is the controlled account-provisioning path.
- Google OAuth users default to pending partner status. OAuth never creates an admin.

Before production, run the two-partner/one-admin RLS isolation suite and review every new table's policies. The included initial SQL test is a schema smoke test, not a substitute for the full isolation suite planned for Phase 5.
