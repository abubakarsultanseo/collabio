import { createHash } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { z } from "zod";
import { googleAvatar } from "@/lib/avatar";
import { googleAttempt, type GoogleError } from "@/lib/google-sign-in";
import { returnPath } from "@/lib/return-path";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

type AuthClient = Awaited<ReturnType<typeof createClient>>;

export const oauthStateCookie = "collabio-google-flow";
export const oauthStateSchema = z.object({
  attempt: z.string().refine(googleAttempt).optional(),
  invite: z.string().min(20).max(200).optional(),
  next: z.string().max(2048).optional().transform(returnPath),
});

export function googleOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  // Next can use an internal hostname in Request.url behind a proxy.
  if (host && /^(?:[a-z\d.-]+|\[[a-f\d:]+\])(?::\d+)?$/i.test(host))
    url.host = host;
  if (process.env.VERCEL === "1") url.protocol = "https:";
  return url.origin;
}

export function googleCookie(request: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: googleOrigin(request).startsWith("https:"),
    path: "/auth",
    maxAge: 15 * 60,
  };
}

export function isSameOrigin(request: Request) {
  return request.headers.get("origin") === googleOrigin(request);
}

export async function checkGoogleAccount(
  auth: AuthClient,
  user: User,
  token?: string,
): Promise<GoogleError | null> {
  const provider = user.identities?.find(
    (identity) => identity.provider === "google",
  );
  const email = user.email?.trim().toLowerCase();
  if (
    !provider ||
    !email ||
    !user.email_confirmed_at ||
    provider.identity_data?.email?.toLowerCase() !== email
  )
    return "sign_in";

  const { data: profile, error } = await auth
    .from("profiles")
    .select("account_status,email")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.error("Google sign-in profile lookup failed", error.code);
    return "auth_unavailable";
  }
  if (!profile || profile.email.toLowerCase() !== email) return "sign_in";
  if (profile.account_status === "deactivated") return "account_inactive";

  if (token) {
    if (token.length < 20 || token.length > 200) return "invalid_invite";
    const { data: outcome, error: invitationError } =
      await createAdminClient().rpc("accept_collabio_google_invitation", {
        p_user: user.id,
        p_email: email,
        p_hash: createHash("sha256").update(token).digest("hex"),
      });
    if (invitationError) {
      console.error(
        "Google invitation acceptance failed",
        invitationError.code,
      );
      return "auth_unavailable";
    }
    if (outcome !== "accepted")
      return outcome === "wrong_account" ? "wrong_account" : "invalid_invite";
  } else if (profile.account_status !== "active") {
    return "invite_required";
  }

  const avatar = googleAvatar(
    provider.identity_data?.picture ?? provider.identity_data?.avatar_url,
  );
  if (avatar) {
    try {
      const { error: photoError } = await createAdminClient()
        .from("profiles")
        .update({ avatar_url: avatar })
        .eq("id", user.id);
      if (photoError)
        console.warn("Google avatar update failed", photoError.code);
    } catch {
      console.warn("Google avatar update unavailable");
    }
  }
  return null;
}
