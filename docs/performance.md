# Performance notes (slow "Loading..." screens)

## Why screens felt slow
Data size is NOT the problem. The problem is the number of **sequential network hops** before one screen can show data:

1. Browser loads the page, then JS, then **starts a second request** (`/api/...`) for the data (screens show "Loading requests...").
2. Every request first asks Supabase Auth "who is this?" (`auth.getUser()` = a network call), then reads `profiles`, then runs the real queries.
3. If the Vercel function region and the Supabase region are far apart (for example Vercel in the US, Supabase in Asia/Europe), **each hop costs 150–300 ms** and they add up one after another.
4. Every filter chip / partner change creates a new query, so the whole chain runs again. "Loading exchange balance..." and "Loading chats..." are separate chains of their own.
5. Background polling (notifications, chat, exchange balance) repeats those chains all day and competes with the page you are using.

## Changed in this version
- `getAuthUser()` (in `src/lib/supabase/server.ts`) replaces the 20 `auth.getUser()` calls. It verifies the login token locally, so one network hop disappears from every page and API call. Account status is still re-read from `profiles`, so deactivation stays immediate.
- `src/middleware.ts` refreshes the session cookie once per request (needed now that the token is verified locally).
- Polling slowed down: notifications 30s→60s (idle), exchange balance 20s→60s, request chat 15s→30s, messages 15s→30s. Open chat threads keep their fast refresh.

## Do this next (biggest win, 5 minutes, no code)
**Put Vercel functions in the same region as Supabase.**
1. Supabase → Project Settings → General → note the **Region**.
2. Vercel → your project → Settings → **Functions** → **Function Region** → choose the closest match:

| Supabase region | Vercel region |
|---|---|
| South Asia (Mumbai) `ap-south-1` | Mumbai `bom1` |
| Southeast Asia (Singapore) `ap-southeast-1` | Singapore `sin1` |
| Central EU (Frankfurt) `eu-central-1` | Frankfurt `fra1` |
| West EU (London) `eu-west-2` | London `lhr1` |
| West EU (Ireland) `eu-west-1` | Dublin `dub1` |
| East US (N. Virginia) `us-east-1` | Washington `iad1` |
| West US (N. California) `us-west-1` | San Francisco `sfo1` |

3. Redeploy.

## How to measure (1 minute)
Browser → F12 → **Network** → reload the Requests page → click `requests?...` → **Timing** → look at **Waiting for server response**.
- Over ~800 ms: server-side/region problem (do the step above).
- Under ~300 ms but the page still feels slow: it is the client-side waterfall (next steps below).
Vercel → project → **Logs** also shows each function's duration.

## Further improvements (not done yet)
- Show already-loaded rows instantly when a status chip changes, instead of an empty "Loading requests..." card.
- Include the exchange balance in the same server response as the request list.
- Fetch the profile in parallel with the first real query instead of before it.
- Trigram index for the request search (`ilike '%...%'` over 7 columns) once the table grows to thousands of rows.
