import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/server/profile";
import { AuthCard } from "@/components/app/auth-card";
import { GoogleSignIn } from "@/components/app/google-sign-in";
import { returnPath } from "@/lib/return-path";

const messages: Record<string, string> = {
  invite_required:
    "This Google account does not have access. Open your invitation or ask your admin for one.",
  wrong_account:
    "Use the exact Google email address that received the invitation.",
  invalid_invite:
    "This invitation is expired or unavailable. Ask the admin for a new invitation.",
  account_inactive: "This account is inactive. Contact your workspace admin.",
  sign_in: "Google sign-in was not completed. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  if (next && !error) {
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (user && (await getProfile(user.id))?.account_status === "active")
      redirect(returnPath(next));
  }
  return (
    <AuthCard
      title="Sign in to Collabio"
      description="Continue with the Google email address invited to your workspace."
    >
      <GoogleSignIn
        next={returnPath(next)}
        initialError={error ? messages[error] : undefined}
      />
    </AuthCard>
  );
}
