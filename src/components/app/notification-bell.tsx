"use client";

import Link from "next/link";
import { ArrowRight, Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { notificationLink } from "@/lib/notification-link";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  request_id: string | null;
  type: string;
  title: string;
  description: string;
  read_at: string | null;
  created_at: string;
};

export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [recent, setRecent] = useState<Notification[] | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let controller: AbortController | undefined;
    async function refresh() {
      if (document.hidden) return;
      controller?.abort();
      const active = new AbortController();
      controller = active;
      try {
        const response = await fetch("/api/notifications?mode=preview", {
          cache: "no-store",
          signal: active.signal,
        });
        if (!response.ok) throw new Error("Could not load notifications.");
        const data = await response.json();
        if (!active.signal.aborted) {
          setRecent(data.notifications);
          setUnread(data.unread);
          setError(false);
        }
      } catch {
        if (!active.signal.aborted) setError(true);
      }
    }
    const tick = () => void refresh();
    tick();
    const timer = window.setInterval(tick, open ? 15000 : 30000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("collabio:notification-read", tick);
    return () => {
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("collabio:notification-read", tick);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !wrapper.current?.contains(event.target)
      )
        setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function markRead(item: Notification) {
    setOpen(false);
    if (item.read_at) return;
    const readAt = new Date().toISOString();
    setRecent(
      (items) =>
        items?.map((row) =>
          row.id === item.id ? { ...row, read_at: readAt } : row,
        ) ?? null,
    );
    setUnread((count) => Math.max(0, count - 1));
    void fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id }),
      keepalive: true,
    })
      .catch(() => {})
      .finally(() =>
        window.dispatchEvent(new Event("collabio:notification-read")),
      );
  }

  return (
    <div ref={wrapper} className="relative">
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        size="icon"
        className="relative"
        aria-label={
          unread ? `Notifications, ${unread} unread` : "Notifications"
        }
        aria-expanded={open}
        aria-controls="recent-notifications"
        onClick={() => setOpen(!open)}
      >
        <Bell size={17} aria-hidden />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-1.5 -top-1.5 rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white dark:text-[var(--canvas)]"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>
      {open && (
        <section
          id="recent-notifications"
          aria-label="Recent notifications"
          className="os-card fixed left-4 right-4 top-20 z-50 overflow-hidden shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <h2 className="font-semibold">Notifications</h2>
            <span className="text-xs text-[var(--muted)]">{unread} unread</span>
          </div>
          {recent?.length ? (
            <ul className="max-h-[55dvh] divide-y divide-[var(--border)] overflow-auto">
              {recent.map((item) => (
                <li key={item.id}>
                  <Link
                    href={notificationLink(item)}
                    onClick={() => markRead(item)}
                    className={cn(
                      "block px-4 py-3 hover:bg-[var(--canvas)]",
                      !item.read_at && "bg-[var(--brand-soft)]",
                    )}
                  >
                    <span className="block text-sm font-semibold">
                      {item.title}
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">
                      {item.description}
                    </span>
                    <time
                      className="mt-1 block text-[10px] text-[var(--muted)]"
                      dateTime={item.created_at}
                    >
                      {new Date(item.created_at).toLocaleString("en-PK", {
                        timeZone: "Asia/Karachi",
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="px-4 py-6 text-sm text-[var(--muted)]">
              {error
                ? "Could not load notifications."
                : recent
                  ? "You're all caught up."
                  : "Loading notifications…"}
            </p>
          )}
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--brand-dark)] hover:bg-[var(--canvas)]"
          >
            View all notifications <ArrowRight size={15} aria-hidden />
          </Link>
        </section>
      )}
    </div>
  );
}
