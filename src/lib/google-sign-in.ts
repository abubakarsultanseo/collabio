export const googleErrors = {
  invite_required:
    "This Google account does not have access. Open your invitation or ask your admin for one.",
  wrong_account:
    "Use the exact Google email address that received the invitation.",
  invalid_invite:
    "This invitation is expired or unavailable. Ask your admin for a new one.",
  account_inactive: "This account is inactive. Contact your workspace admin.",
  sign_in: "Google sign-in was not completed. Please try again.",
  auth_unavailable:
    "Collabio could not verify your account right now. Please try again in a moment.",
} as const;

export type GoogleError = keyof typeof googleErrors;

export function isGoogleError(value: unknown): value is GoogleError {
  return typeof value === "string" && Object.hasOwn(googleErrors, value);
}

export function googleAttempt(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function googleChannel(attempt: string) {
  return `collabio.google.${attempt}`;
}
