# Collabio Architecture

Collabio is a Next.js 15 App Router application backed by Supabase PostgreSQL/Auth/Realtime/Storage, with Resend for email and Vercel hosting.

## Existing application boundaries

- Server Components and route handlers authenticate through `createClient()` and the fast `getAuthUser()` helper in `src/lib/supabase/server.ts`.
- `src/middleware.ts` refreshes Supabase sessions before page/API handling.
- Privileged database access is isolated in `src/lib/supabase/admin.ts`; never import it from Client Components.
- Request and chat APIs validate input with Zod and re-check workspace membership before using privileged database operations.
- Partnership and request authorization remains enforced by server checks and PostgreSQL RLS.

## Requests workspace update

- `/requests` is the unified entry point. `?view=sent` selects Sent; Received is the default.
- `/requests/inbox` and `/requests/sent` redirect to `/requests` and preserve `partner` and `request` query parameters.
- The Requests workspace selects one partner by default, preferring `profiles.last_partnership_id`, then the most recently created accessible partnership. The selected partnership is stored in localStorage for instant local restore and in the profile for cross-device restore.
- `/api/preferences/last-partnership` validates the signed-in user, active status, and partnership membership before updating the preference.

## Chat delivery

- Messages are persisted by the existing `/api/chats` API before delivery.
- The browser subscribes to Supabase Postgres Changes for the currently open conversation. The shared browser Supabase client is used so components share the same underlying client connection.
- Realtime row delivery is protected by participant-scoped RLS. Direct messages are visible only to their admin/partner pair; request comments retain the existing request participant policy.
- A 60-second safety refresh remains for reconnect/network gaps. The former 5-second open-thread polling and 30-second chat list/unread polling have been slowed to 60 seconds.

## Current scope limits

The current update establishes the database foundation for presence metadata, reactions, attachments and message lifecycle metadata. Full UI/API flows for typing, presence heartbeat/privacy settings, reaction writes, attachment upload/download, delivered/read ticks, reply/edit/delete and offline-only email delivery still require follow-up implementation and live Supabase testing. These are not represented as completed features.
