"use client";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { Bell } from "lucide-react";
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
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
    if (!response.ok) return;
    window.dispatchEvent(new Event("collabio:notification-read"));
    setItems((current) =>
      current.map((row) =>
        row.id === item.id
          ? { ...row, read_at: new Date().toISOString() }
          : row,
      ),
    );
  }
  return (
    <div className="page-enter mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-[var(--muted)] mt-2 text-sm">
            New requests, status updates, and partner activity.
          </p>
        </div>
        <Link href="/requests/inbox" className={buttonVariants()}>
          View requests
        </Link>
      </header>
      <section className="os-card divide-y">
        {items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="You’re all caught up"
            hint="New request and partner updates will appear here."
          />
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={item.request_id ? "/requests/inbox" : "/team"}
              onClick={() => void mark(item)}
              className={`block p-5 hover:bg-[var(--canvas)] ${item.read_at ? "" : "bg-[var(--info-bg)]"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{item.title}</h2>
                  <p className="text-[var(--muted)] mt-1 text-sm">
                    {item.description}
                  </p>
                  <p className="text-[var(--muted)] mt-2 text-xs">
                    {new Date(item.created_at).toLocaleString("en-PK", {
                      timeZone: "Asia/Karachi",
                    })}
                  </p>
                </div>
                {!item.read_at && (
                  <span
                    className="mt-1 h-2.5 w-2.5 rounded-full bg-[var(--brand)]"
                    aria-label="Unread"
                  />
                )}
              </div>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
