import { createServerClient } from "@supabase/ssr";
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
