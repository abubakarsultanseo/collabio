# Implementation Status — 2026-11-28

## Included in this update

- Unified `/requests` route with Sent/Received segmented switch and server-provided initial lists.
- Legacy `/requests/inbox` and `/requests/sent` redirects preserve partner and request deep-link parameters.
- Partner selection no longer offers an All option in the main Requests selector. Selection is written to the URL, localStorage, and `profiles.last_partnership_id` through a membership-checked API.
- Default partner selection prefers the saved profile preference, then the newest accessible partnership.
- Chat message delivery now subscribes to Postgres Changes for the active request/direct thread. Direct-message RLS and existing request-comment participant RLS are used as the database authorization boundary.
- Chat thread, unread counts and chat contact list safety refreshes now run at 60 seconds rather than 5/30 seconds.
- Additive migration 0015 adds preference/presence fields, message lifecycle columns, reaction/attachment metadata foundations, private storage bucket and RLS/read policies.
- Updated architecture, database, security, performance and Roman Urdu setup documentation.

## Not completed in this update

The prompt's full feature list is larger than the changes safely verifiable against this archive. These items remain incomplete and must not be advertised as working:

- New Request right-side drawer, paste-to-autofill and Create & add another.
- Bulk status action, density toggle, status counts and skeleton replacement of all existing loading states.
- Chat typing indicator and shared presence/last-seen heartbeat/privacy UI.
- Reaction create/update/delete API and reaction UI.
- Attachment upload/download APIs, server-side MIME/extension validation, signed URL UI and previews.
- Delivered ticks, reply-to, edit/delete message actions, date separators and jump-to-latest.
- Unread badge/notifications from a global realtime provider.
- Email fallback conditioned on online presence.
- Full two-browser and outsider isolation test execution.

## Verification

- TypeScript/TSX syntax transpilation passed for all changed TypeScript files.
- Full `npm run typecheck`, lint and production build could not be run: dependency installation (`npm ci`) timed out and left an incomplete `node_modules` directory. This is an environment limitation, not a passing build.
- Supabase SQL migration and RLS tests were not executed against the user's live Supabase project.
- Realtime delivery requires migration 0015 to be applied and both chat tables enabled in the `supabase_realtime` publication. It has not been verified against the live project.
