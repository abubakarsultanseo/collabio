"use client";

import { useState } from "react";
import { AuthError } from "@/components/app/auth-card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function GoogleSignIn({
  token,
  next,
  initialError,
}: {
  token?: string;
  next?: string;
  initialError?: string;
}) {
  const [error, setError] = useState(initialError ?? "");
  const [busy, setBusy] = useState(false);
  async function google() {
    setError("");
    setBusy(true);
    try {
      const callback = new URL("/auth/callback", window.location.origin);
      if (token) callback.searchParams.set("invite", token);
      if (next) callback.searchParams.set("next", next);
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callback.href,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch {
      setError("Could not start Google sign-in. Please try again.");
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      {error && <AuthError>{error}</AuthError>}
      <Button
        type="button"
        variant="secondary"
        onClick={google}
        disabled={busy}
        className="h-12 w-full rounded-xl shadow-sm"
      >
        <svg viewBox="0 0 48 48" width="21" height="21" aria-hidden>
          <path
            fill="#4285F4"
            d="M43.6 20.5H24v8h11.2c-.5 2.6-2 4.8-4.2 6.3l6.8 5.3c4-3.7 6.3-9.1 6.3-15.5 0-1.4-.2-2.8-.5-4.1Z"
          />
          <path
            fill="#34A853"
            d="M24 45c5.7 0 10.5-1.9 14-5.2l-6.8-5.3c-1.9 1.3-4.3 2-7.2 2-5.5 0-10.2-3.7-11.9-8.7l-7 5.5C8.7 40.3 15.8 45 24 45Z"
          />
          <path
            fill="#FBBC05"
            d="M12.1 27.8a12.6 12.6 0 0 1 0-7.6l-7-5.5a21 21 0 0 0 0 18.6l7-5.5Z"
          />
          <path
            fill="#EA4335"
            d="M24 11.5c3.1 0 5.9 1.1 8 3.1l6-6C34.5 5.1 29.7 3 24 3 15.8 3 8.7 7.7 5.1 14.7l7 5.5c1.7-5 6.4-8.7 11.9-8.7Z"
          />
        </svg>
        {busy ? "Opening Google…" : "Continue with Google"}
      </Button>
    </div>
  );
}
