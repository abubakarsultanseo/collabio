import { cookies } from "next/headers";
import type { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { GoogleError } from "@/lib/google-sign-in";
import {
  checkGoogleAccount,
  googleCookie,
  googleOrigin,
  oauthStateCookie,
  oauthStateSchema,
} from "@/server/google-sign-in";
import { returnPath } from "@/lib/return-path";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = googleOrigin(request);
  const store = await cookies();
  const saved = store.get(oauthStateCookie)?.value;
  let state: z.output<typeof oauthStateSchema> | null = null;
  if (saved) {
    store.set(oauthStateCookie, "", { ...googleCookie(request), maxAge: 0 });
    try {
      const parsed = oauthStateSchema.safeParse(JSON.parse(saved));
      if (parsed.success) state = parsed.data;
    } catch {
      // The code exchange still requires a valid Supabase PKCE verifier.
    }
  }

  // Old sign-in pages can still return with their original callback parameters.
  const token = state?.invite ?? url.searchParams.get("invite") ?? undefined;
  const next = state?.next ?? returnPath(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  function complete(error?: GoogleError) {
    const target = new URL(error ? "/login" : next, origin);
    if (error) {
      target.searchParams.set("error", error);
      target.searchParams.set("next", next);
      if (
        token &&
        ["wrong_account", "auth_unavailable", "sign_in"].includes(error)
      ) {
        target.pathname = "/accept-invitation";
        target.searchParams.set("token", token);
      }
    }
    if (state?.attempt) {
      const popup = new URL("/auth/popup", origin);
      popup.searchParams.set("attempt", state.attempt);
      popup.searchParams.set("result", error ?? "success");
      if (!error) popup.searchParams.set("next", next);
      return NextResponse.redirect(popup);
    }
    return NextResponse.redirect(target);
  }

  if (!code) return complete("sign_in");
  let auth: Awaited<ReturnType<typeof createClient>> | undefined;
  let signedIn = false;
  try {
    auth = await createClient();
    const { data, error } = await auth.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      console.warn("Google code exchange failed", error?.code);
      return complete("sign_in");
    }
    signedIn = true;
    const denial = await checkGoogleAccount(auth, data.user, token);
    if (denial) {
      await auth.auth.signOut({ scope: "local" });
      return complete(denial);
    }
    return complete();
  } catch {
    if (signedIn) await auth?.auth.signOut({ scope: "local" }).catch(() => {});
    console.error("Google OAuth callback unavailable");
    return complete("auth_unavailable");
  }
}
