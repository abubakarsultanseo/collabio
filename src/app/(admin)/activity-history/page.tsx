"use client";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { History } from "lucide-react";
import { useToast } from "@/components/app/toast";
import { useEffect, useState } from "react";
type Row = {
  id: string;
  request_id: string | null;
  action_type: string;
  actor: { full_name: string } | null;
  created_at: string;
  new_value: Record<string, unknown> | null;
};
export default function ActivityHistoryPage() {
  const notify = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    fetch("/api/activity", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Could not load activity.");
        setRows(data.activity ?? []);
      })
      .catch((e) => notify(e.message, "error"));
  }, [notify]);
  return (
    <div className="page-enter mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Activity History</h1>
          <p className="text-[var(--muted)] mt-2 text-sm">
            Request and communication events in your accessible workspaces.
          </p>
        </div>
        <Link href="/requests/inbox" className={buttonVariants()}>
          View requests
        </Link>
      </header>
      <section className="os-card divide-y">
        {rows.length === 0 ? (
          <div className="p-3">
            <EmptyState
              icon={History}
              title="No activity recorded"
              hint="Request and message events will appear here."
            />
          </div>
        ) : (
          rows.map((row) => (
            <article
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-3 p-4"
            >
              <div>
                <h2 className="font-medium capitalize">
                  {row.action_type.replaceAll("_", " ")}
                </h2>
                <p className="text-[var(--muted)] mt-1 text-xs">
                  {row.actor?.full_name ?? "Workspace member"}
                  {row.request_id
                    ? ` · Request ${row.request_id.slice(0, 8)}`
                    : ""}
                </p>
              </div>
              <time className="text-[var(--muted)] text-xs">
                {new Date(row.created_at).toLocaleString("en-PK", {
                  timeZone: "Asia/Karachi",
                })}
              </time>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
