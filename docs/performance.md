# Performance Notes

- The existing `getAuthUser()` JWT-claims helper and `src/middleware.ts` session refresh baseline are present in the supplied project and retained.
- New preference writes are a single authenticated API request and validate membership server-side.
- Requests Sent and Received initial lists are fetched in parallel on `/requests`.
- Chat uses Postgres Changes for immediate persisted-message notifications, with a 60-second safety refresh while visible. Chat-related list/unread polling was reduced to 60 seconds.
- No new heavy UI libraries were added, so there is no additional emoji/image-viewer bundle cost in this update.
- Realtime free-plan usage is bounded by open chat subscriptions and the documented 200 concurrent connection assumption. Monitor Supabase Dashboard → Reports → Realtime and keep the 60-second fallback rather than adding more sockets per UI element.
- Storage remains subject to the assumed 1 GB free-plan limit. The private bucket enforces 10 MB per file, but usage monitoring and retention cleanup still need operational setup.
