import { redirect } from "next/navigation";
import { AuthCard } from "@/components/app/auth-card";
import { GoogleSignIn } from "@/components/app/google-sign-in";
import { googleErrors, isGoogleError } from "@/lib/google-sign-in";
import { returnPath } from "@/lib/return-path";
import { getWorkspaceAccess } from "@/server/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const destination = returnPath(next);
  if (next && !error && (await getWorkspaceAccess()).state === "active")
    redirect(destination);
  return (
    <AuthCard
      title="Sign in to Collabio"
      description="Continue with the Google email address invited to your workspace."
    >
      <GoogleSignIn
        next={destination}
        initialError={isGoogleError(error) ? googleErrors[error] : undefined}
      />
    </AuthCard>
  );
}
