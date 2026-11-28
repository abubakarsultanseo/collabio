"use client";

import { useEffect } from "react";
import { AuthCard } from "@/components/app/auth-card";
import { buttonVariants } from "@/components/ui/button";
import {
  googleChannel,
  googleErrors,
  type GoogleError,
} from "@/lib/google-sign-in";

export function GooglePopupResult({
  attempt,
  result,
  next,
}: {
  attempt: string;
  result: "success" | GoogleError;
  next: string;
}) {
  useEffect(() => {
    const finish = window.setTimeout(() => {
      if (result === "success") window.location.replace(next);
    }, 1800);
    if (typeof BroadcastChannel === "undefined")
      return () => window.clearTimeout(finish);
    const channel = new BroadcastChannel(googleChannel(attempt));
    function acknowledge(event: MessageEvent) {
      if (event.data?.type !== "acknowledged") return;
      window.clearTimeout(finish);
      window.close();
    }
    channel.addEventListener("message", acknowledge);
    channel.postMessage({ type: "result", result });
    return () => {
      channel.close();
      window.clearTimeout(finish);
    };
  }, [attempt, result, next]);

  const success = result === "success";
  return (
    <AuthCard
      title={success ? "Signed in to Collabio" : "Could not sign in"}
      description={success ? "Your workspace is ready." : googleErrors[result]}
    >
      <a href={success ? next : "/login"} className={buttonVariants()}>
        {success ? "Open Collabio" : "Return to sign-in"}
      </a>
    </AuthCard>
  );
}
