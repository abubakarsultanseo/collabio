# Database schema

## Foundation tables
- `profiles`: Auth-linked identity, role and account state.
- `invitations`: hashed invitation tokens, recipient, expiry and lifecycle state.
- `partners`: partner profile extension.
- `collaborations`: one private workspace per partner.
- `memberships`: user-to-workspace membership.
- `partner_permissions`: ten independent permission flags.
- `app_settings`: configurable application values.

## Relationships
`auth.users` 1:1 `profiles`; `profiles` 1:1 `partners` for partner accounts; `profiles` 1:1 `collaborations` through `partner_id`; `profiles` 1:N `invitations` through `invited_by`; `profiles` 1:1 `partner_permissions` through `partner_id`; memberships connect a partner workspace to its user(s).

Phase 2 adds requests, comments and immutable activity. Phase 3 adds notifications, email logs and reminder jobs. Each later migration will be versioned separately.

All identifiers are UUIDs and all timestamps use `timestamptz` in UTC. Application display timezone defaults to Asia/Karachi.
