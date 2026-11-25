import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  googleCookie,
  googleOrigin,
  isSameOrigin,
  oauthStateCookie,
  oauthStateSchema,
} from "@/server/google-sign-in";

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "sign_in" }, { status: 403 });
  const parsed = oauthStateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "sign_in" }, { status: 400 });
  try {
    const auth = await createClient();
    const { data, error } = await auth.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: new URL("/auth/callback", googleOrigin(request)).href,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error || !data.url) {
      console.error("Could not start Google OAuth", error?.code);
      return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
    }
    const store = await cookies();
    store.set(
      oauthStateCookie,
      JSON.stringify(parsed.data),
      googleCookie(request),
    );
    return NextResponse.json(
      { url: data.url },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    console.error("Google OAuth setup unavailable");
    return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
  }
}
