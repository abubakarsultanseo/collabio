"use client";

import { useEffect, useRef, useState } from "react";
import { AuthError } from "@/components/app/auth-card";
import { GoogleIdentityButton } from "@/components/app/google-identity-button";
import { Button } from "@/components/ui/button";
import {
  googleChannel,
  googleErrors,
  isGoogleError,
} from "@/lib/google-sign-in";
import { returnPath } from "@/lib/return-path";

const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const popupFeatures =
  "popup=yes,width=500,height=650,resizable=yes,scrollbars=yes";

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
  const [identityBusy, setIdentityBusy] = useState(false);
  const [identityReady, setIdentityReady] = useState(false);
  const active = useRef<{
    window: Window | null;
    channel?: BroadcastChannel;
    timer?: number;
    controller: AbortController;
  } | null>(null);

  function clear(close: boolean) {
    const flow = active.current;
    if (!flow) return;
    active.current = null;
    flow.controller.abort();
    flow.channel?.close();
    window.clearTimeout(flow.timer);
    if (close) flow.window?.close();
  }

  useEffect(() => () => clear(true), []);

  async function google() {
    clear(true);
    setError("");
    setBusy(true);

    // Open during the click so popup blockers do not treat it as unsolicited.
    const popup =
      typeof BroadcastChannel === "function" &&
      typeof globalThis.crypto?.randomUUID === "function"
        ? window.open("/auth/popup", "_blank", popupFeatures)
        : null;
    if (popup) popup.opener = null;
    const attempt = popup ? crypto.randomUUID() : undefined;
    const channel = attempt
      ? new BroadcastChannel(googleChannel(attempt))
      : undefined;
    const controller = new AbortController();
    const flow = {
      window: popup,
      channel,
      controller,
      timer: undefined as number | undefined,
    };
    active.current = flow;
    channel?.addEventListener("message", (event: MessageEvent) => {
      if (active.current !== flow || event.data?.type !== "result") return;
      const result: unknown = event.data.result;
      if (result !== "success" && !isGoogleError(result)) return;
      channel.postMessage({ type: "acknowledged" });
      // The popup closes itself after receiving the acknowledgement.
      clear(false);
      setBusy(false);
      if (result === "success") window.location.replace(returnPath(next));
      else setError(googleErrors[result]);
    });

    try {
      const response = await fetch("/auth/google/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attempt, invite: token, next }),
        signal: controller.signal,
      });
      const result = (await response.json()) as {
        error?: unknown;
        url?: string;
      };
      if (active.current !== flow) return;
      if (!response.ok || typeof result.url !== "string") {
        setError(
          isGoogleError(result.error)
            ? googleErrors[result.error]
            : googleErrors.auth_unavailable,
        );
        clear(true);
        setBusy(false);
        return;
      }
      if (!popup) {
        window.location.assign(result.url);
        return;
      }
      popup.location.replace(result.url);
      flow.timer = window.setTimeout(
        () => {
          if (active.current !== flow) return;
          clear(true);
          setError(googleErrors.sign_in);
          setBusy(false);
        },
        10 * 60 * 1000,
      );
    } catch {
      if (controller.signal.aborted) return;
      clear(true);
      setError(googleErrors.auth_unavailable);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <AuthError>{error}</AuthError>}
      {clientId && (
        <GoogleIdentityButton
          clientId={clientId}
          token={token}
          next={next}
          onReady={setIdentityReady}
          onError={setError}
          onBusy={setIdentityBusy}
        />
      )}
      {(!identityReady || busy) && (
        <Button
          type="button"
          variant="secondary"
          onClick={google}
          disabled={busy || identityBusy}
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
      )}
      {identityBusy && (
        <p className="text-sm text-[var(--muted)]" role="status">
          Finishing sign-in…
        </p>
      )}
      {identityReady && !busy && !identityBusy && (
        <button
          type="button"
          onClick={google}
          className="text-xs text-[var(--muted)] underline underline-offset-2"
        >
          Trouble signing in? Retry with Google
        </button>
      )}
      {busy && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
          <p role="status">Choose your Google account in the sign-in window.</p>
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => {
              clear(true);
              setBusy(false);
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
