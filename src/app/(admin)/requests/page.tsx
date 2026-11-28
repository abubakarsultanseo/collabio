import type { Metadata } from "next";
import { initialRequestList } from "@/server/request-page";
import UnifiedRequestsWorkspace from "@/components/unified-requests-workspace";

export const metadata: Metadata = { title: "Requests | Collabio" };

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string; view?: string; request?: string }>;
}) {
  const params = await searchParams;
  const selected = params.view === "sent" ? "sent" : "inbox";
  const [received, sent] = await Promise.all([
    initialRequestList("inbox", params.partner),
    initialRequestList("sent", params.partner),
  ]);
  return (
    <div className="page-enter mx-auto max-w-7xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Requests</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Manage sent and received link-building collaborations with one partner selected at a time.</p>
      </header>
      <UnifiedRequestsWorkspace received={received} sent={sent} initialView={selected} requestId={params.request} />
    </div>
  );
}
