import { AuthCard } from "@/components/app/auth-card";
import { GooglePopupResult } from "@/components/app/google-popup-result";
import { googleAttempt, isGoogleError } from "@/lib/google-sign-in";
import { returnPath } from "@/lib/return-path";

export default async function GooglePopupPage({
  searchParams,
}: {
  searchParams: Promise<{ attempt?: string; result?: string; next?: string }>;
}) {
  const { attempt, result, next } = await searchParams;
  if (
    !googleAttempt(attempt) ||
    !(result === "success" || isGoogleError(result))
  ) {
    return (
      <AuthCard
        title="Opening Google"
        description="Continue in this window to sign in to Collabio."
      >
        <p role="status">Connecting…</p>
      </AuthCard>
    );
  }
  return (
    <GooglePopupResult
      attempt={attempt}
      result={result}
      next={returnPath(next)}
    />
  );
}
