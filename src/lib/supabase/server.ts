import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

type CookieStore = Awaited<ReturnType<typeof cookies>>;
type CookieOptions = Parameters<CookieStore["set"]>[2];

export async function createClient() {
  const cookieStore = await cookies();
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const missing=[!url?"NEXT_PUBLIC_SUPABASE_URL":null,!anonKey?"NEXT_PUBLIC_SUPABASE_ANON_KEY":null].filter(Boolean);
  if(missing.length)throw new Error(`Missing server environment variable(s): ${missing.join(", ")}`);

  return createServerClient(
    url!,
    anonKey!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options: CookieOptions;
          }>
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot write cookies. Middleware handles refreshes.
          }
        },
      },
    }
  );
}

/**
 * Fast drop-in for `client.auth.getUser()`.
 *
 * `getUser()` makes a network round trip to Supabase Auth on EVERY call, and this app calls it in the
 * layout, in pages and in every API route (plus background polling). `getClaims()` instead verifies the
 * signed JWT locally using cached public keys, so it costs ~0 ms. For projects that still use the legacy
 * symmetric JWT secret it automatically falls back to the network check, so behaviour stays correct.
 *
 * Account status/role is still re-read from `profiles` by the callers, so a deactivated account is blocked
 * immediately even though the access token itself stays valid until it expires.
 */
export async function getAuthUser(client: { auth: SupabaseClient["auth"] }) {
  const { data, error } = await client.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { data: { user: null as User | null }, error };
  const user = {
    id: claims.sub,
    email: claims.email,
    phone: claims.phone,
    aud: claims.aud,
    role: claims.role,
    app_metadata: claims.app_metadata ?? {},
    user_metadata: claims.user_metadata ?? {},
  } as unknown as User;
  return { data: { user }, error: null };
}
