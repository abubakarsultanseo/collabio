"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { googleErrors, isGoogleError } from "@/lib/google-sign-in";
import { returnPath } from "@/lib/return-path";

type IdentityApi = {
  initialize: (options: {
    client_id: string;
    ux_mode: "popup";
    nonce: string;
    callback: (result: { credential?: string }) => void;
  }) => void;
  renderButton: (
    element: HTMLElement,
    options: {
      type: "standard";
      size: "large";
      text: "continue_with";
      shape: "rectangular";
      theme: "outline";
      width: number;
    },
  ) => void;
};

function googleIdentity() {
  return (window as Window & { google?: { accounts?: { id?: IdentityApi } } })
    .google?.accounts?.id;
}

export function GoogleIdentityButton({
  clientId,
  token,
  next,
  onError,
  onReady,
  onBusy,
}: {
  clientId: string;
  token?: string;
  next?: string;
  onError: (error: string) => void;
  onReady: (ready: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!scriptReady || !slot.current) return;
    const element = slot.current;
    const controller = new AbortController();
    let authorizing = false;

    async function prepare() {
      const google = googleIdentity();
      if (!google) return;
      try {
        const response = await fetch("/auth/google/identity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "challenge" }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const { id, digest } = await response.json();
        if (controller.signal.aborted) return;

        google.initialize({
          client_id: clientId,
          ux_mode: "popup",
          nonce: digest,
          callback: async ({ credential }) => {
            if (!credential || controller.signal.aborted || authorizing) return;
            authorizing = true;
            onError("");
            onBusy(true);
            try {
              const exchanged = await fetch("/auth/google/identity", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  challenge: id,
                  credential,
                  invite: token,
                  next,
                }),
              });
              const outcome = (await exchanged.json()) as {
                error?: unknown;
                next?: string;
              };
              if (!exchanged.ok) {
                onError(
                  isGoogleError(outcome.error)
                    ? googleErrors[outcome.error]
                    : googleErrors.sign_in,
                );
                setRetry((value) => value + 1);
                return;
              }
              window.location.replace(returnPath(outcome.next));
            } catch {
              onError(googleErrors.auth_unavailable);
              setRetry((value) => value + 1);
            } finally {
              onBusy(false);
            }
          },
        });
        google.renderButton(element, {
          type: "standard",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          theme: "outline",
          width: Math.min(400, element.clientWidth || 280),
        });
        const visible = element.querySelector("iframe, [role='button']");
        if (visible) onReady(true);
      } catch {
        if (!controller.signal.aborted) onReady(false);
      }
    }

    const observer = new MutationObserver(() => {
      if (element.querySelector("iframe, [role='button']")) onReady(true);
    });
    observer.observe(element, { childList: true, subtree: true });
    void prepare();
    return () => {
      controller.abort();
      observer.disconnect();
      element.replaceChildren();
    };
  }, [clientId, next, token, retry, scriptReady, onError, onReady, onBusy]);

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => onReady(false)}
      />
      <div ref={slot} className="min-w-0 overflow-hidden" />
    </>
  );
}
