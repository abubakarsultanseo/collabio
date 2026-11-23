# Database schema

## Foundation tables
- `profiles`: Auth-linked identity, role and account state.
- `invitations`: hashed invitation tokens, recipient, expiry and lifecycle state.
- `partners`: partner profile extension.
- `collaborations`: one private workspace per partner.
- `memberships`: user-to-workspace membership.
- `partner_permissions`: ten independent permission flags.
- `app_settings`: configurable application values.
- `partnerships`: shared relationship between two active Collabio users.
- `deals`: quotas for each side in a partnership.
- `deal_quota_history`: append-only record of quota changes.
- `requests`: deal-linked placement requests with side, status and Live/Shared timestamps.
- `deal_balance`: security-invoker view for calculated Live, pending, remaining and over-quota totals.

## Relationships
`auth.users` 1:1 `profiles`; `profiles` 1:1 `partners` for partner accounts; `profiles` 1:1 `collaborations` through `partner_id`; `profiles` 1:N `invitations` through `invited_by`; `profiles` 1:1 `partner_permissions` through `partner_id`; memberships connect a partner workspace to its user(s).

Migration 0002 adds requests, comments, activity, notifications, email logs and reminder jobs. Migration 0003 adds shared partnerships, deals, request-to-deal mapping and calculated balances.

All identifiers are UUIDs and all timestamps use `timestamptz` in UTC. Application display timezone defaults to Asia/Karachi.
