"use client";
import { useToast } from "@/components/app/toast";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
type Notification = {
  id: string;
  request_id: string | null;
  type: string;
  title: string;
  description: string;
  read_at: string | null;
  created_at: string;
};
export default function NotificationsWorkspace() {
  const notify = useToast();
  const [items, setItems] = useState<Notification[]>([]);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not load notifications.");
      setItems(data.notifications ?? []);
    } catch (caught) {
      notify(
        caught instanceof Error
          ? caught.message
          : "Could not load notifications.",
        "error",
      );
    }
  }, [notify]);
  useEffect(() => {
    void load();
  }, [load]);
  async function mark(item: Notification) {
    if (item.read_at) return;
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
    setItems((current) =>
      current.map((row) =>
        row.id === item.id
          ? { ...row, read_at: new Date().toISOString() }
          : row,
      ),
    );
  }
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6 md:p-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-700">
          Updates
        </p>
        <h1 className="mt-2 text-3xl font-bold">Notifications</h1>
        <p className="muted mt-2">
          New requests, status updates, and partner activity.
        </p>
      </header>
      <section className="panel divide-y">
        {items.length === 0 ? (
          <p className="muted p-8 text-sm">You’re all caught up.</p>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={item.request_id ? "/requests/inbox" : "/team"}
              onClick={() => void mark(item)}
              className={`block p-5 hover:bg-slate-50 ${item.read_at ? "" : "bg-blue-50/40"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{item.title}</h2>
                  <p className="muted mt-1 text-sm">{item.description}</p>
                  <p className="muted mt-2 text-xs">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
                {!item.read_at && (
                  <span
                    className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-600"
                    aria-label="Unread"
                  />
                )}
              </div>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
