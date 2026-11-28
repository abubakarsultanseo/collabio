"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RequestListWorkspace from "@/components/request-list-workspace";
import type { InitialRequestList } from "@/components/requests/request-list-cache";

export default function UnifiedRequestsWorkspace({
  received,
  sent,
  initialView,
  requestId,
}: {
  received: InitialRequestList;
  sent: InitialRequestList;
  initialView: "sent" | "inbox";
  requestId?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<"sent" | "inbox">(initialView);
  const receivedCount = received.page?.requests.length ?? 0;
  const sentCount = sent.page?.requests.length ?? 0;
  function choose(next: "sent" | "inbox") {
    setView(next);
    const params = new URLSearchParams(window.location.search);
    params.set("view", next === "sent" ? "sent" : "received");
    router.replace(`/requests?${params.toString()}`, { scroll: false });
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-full max-w-[380px] rounded-xl border border-[var(--border)] bg-[var(--canvas)] p-1" role="tablist" aria-label="Request direction">
          {(["sent", "inbox"] as const).map((item) => {
            const selected = view === item;
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => choose(item)}
                className={`min-h-11 flex-1 rounded-lg px-4 text-sm font-semibold transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] ${selected ? "bg-[var(--text)] text-[var(--card)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
              >
                {item === "sent" ? `Sent ${sentCount ? `(${sentCount})` : ""}` : `Received ${receivedCount ? `(${receivedCount})` : ""}`}
              </button>
            );
          })}
        </div>
      </div>
      {view === "sent" ? (
        <RequestListWorkspace scope="sent" title="Requests" initial={sent} initialRequestId={requestId} unified />
      ) : (
        <RequestListWorkspace scope="inbox" title="Requests" initial={received} initialRequestId={requestId} unified />
      )}
    </div>
  );
}
