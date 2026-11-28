"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section role="alert" className="os-card mx-auto max-w-lg space-y-3 p-6">
      <h1 className="text-xl font-semibold">The dashboard could not load</h1>
      <p className="text-sm text-[var(--muted)]">
        Try again in a moment. If the problem continues, share the reference
        below with your Collabio admin.
      </p>
      {error.digest && (
        <p className="text-xs text-[var(--muted)]">Reference {error.digest}</p>
      )}
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </section>
  );
}
