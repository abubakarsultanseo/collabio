import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { returnPath } from "@/lib/return-path";
import { googleAvatar } from "@/lib/avatar";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const token = url.searchParams.get("invite");
  const next = returnPath(url.searchParams.get("next"));
  const login = (reason: string) => {
    const target = new URL("/login", url.origin);
    target.searchParams.set("error", reason);
    target.searchParams.set("next", next);
    return NextResponse.redirect(target);
  };
  if (!code) return login("sign_in");
  const auth = await createClient();
  const { data, error } = await auth.auth.exchangeCodeForSession(code);
  if (error || !data.user) return login("sign_in");

  async function deny(reason: string) {
    await auth.auth.signOut({ scope: "local" });
    if (reason === "wrong_account" && token) {
      const target = new URL("/accept-invitation", url.origin);
      target.searchParams.set("token", token);
      target.searchParams.set("error", reason);
      return NextResponse.redirect(target);
    }
    return login(reason);
  }

  const user = data.user;
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
    return deny("sign_in");
  const avatar = googleAvatar(
    provider.identity_data?.picture ?? provider.identity_data?.avatar_url,
  );
  const db = createAdminClient();
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("account_status,email")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile || profile.email.toLowerCase() !== email)
    return deny("sign_in");
  if (profile.account_status === "deactivated") return deny("account_inactive");

  if (token) {
    if (token.length < 20 || token.length > 200) return deny("invalid_invite");
    const { data: outcome, error: invitationError } = await db.rpc(
      "accept_collabio_google_invitation",
      {
        p_user: user.id,
        p_email: email,
        p_hash: createHash("sha256").update(token).digest("hex"),
      },
    );
    if (invitationError || outcome !== "accepted")
      return deny(outcome === "wrong_account" ? outcome : "invalid_invite");
  } else if (profile.account_status !== "active") {
    return deny("invite_required");
  }
  if (avatar) {
    const { error: photoError } = await db
      .from("profiles")
      .update({ avatar_url: avatar })
      .eq("id", user.id);
    if (photoError)
      console.error("Could not store Google photo", photoError.code);
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
