# Shared partnerships and deals

## Data model
- A partnership joins two active Collabio profiles. Both users see the same partnership, deals and requests.
- Each deal stores quotas for partnership side A and side B. The interface translates those into “you” and “partner” for the signed-in user.
- Each request belongs to exactly one partnership and deal. Its `link_side` records which side is providing the link.
- `deal_balance` calculates live, pending, remaining and over-quota values. Balances are not stored manually.
- Quota edits are written to `deal_quota_history`; request status changes are written to `request_activity` and create in-app notifications.

## Rules implemented
- Only `live` requests fill a quota. `shared`, `in_progress`, and `seen` are pending; `hold`, `rejected`, and `cancelled` do not count.
- A database trigger sets `live_at` when a request enters Live and `shared_at` when it enters Shared.
- A deal automatically closes when both sides have no remaining quota. If a Live request moves to Hold and creates remaining quota again, an automatically closed deal reopens.
- Requests that become Live beyond quota remain allowed and are marked with an over-quota warning.
- The dashboard flags requests that remain Shared for seven or more days.

## Migration and legacy records
Run `0003_shared_partnership_deals.sql` after `0001_foundation.sql` and `0002_collaboration_and_notifications.sql`, and only after a database backup. It creates shared partnerships from the existing request `partner_id` and the active admin profile, then maps requests to a Legacy deal. The Legacy quotas are initialized from existing Live and pending requests. The migration intentionally raises an error if any request cannot be mapped; stop and review those records instead of removing the safety check.

## Deployment limitations
- Email on Live and a weekly summary scheduler are not enabled in this update. In-app request notifications and stale dashboard counts are included.
- The admin invitation flow still requires a valid server-side Supabase URL and service-role key, plus working Resend configuration. Never put the service-role key in a `NEXT_PUBLIC_` variable.
- Do not deploy the migration to production until Preview confirms the actual existing schema and request records map correctly.
