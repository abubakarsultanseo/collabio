import { AuthCard, AuthError } from "@/components/app/auth-card";
import { GoogleSignIn } from "@/components/app/google-sign-in";

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <AuthCard
      title="Join your Collabio workspace"
      description="Accept using the Google account that received this invitation."
    >
      {token ? (
        <GoogleSignIn
          token={token}
          initialError={
            error === "wrong_account"
              ? "Choose the Google email address that received the invitation."
              : undefined
          }
        />
      ) : (
        <AuthError>Open your invitation link to continue.</AuthError>
      )}
    </AuthCard>
  );
}
