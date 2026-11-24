import AcceptInvitationForm from "@/components/accept-invitation-form";
import { AuthCard, AuthError } from "@/components/app/auth-card";

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthCard
      title="Accept your invitation"
      description="Create your account using the invitation sent to your email."
    >
      {token ? (
        <AcceptInvitationForm token={token} />
      ) : (
        <AuthError>Invitation token is missing.</AuthError>
      )}
    </AuthCard>
  );
}
