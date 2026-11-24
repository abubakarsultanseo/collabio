"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let controller: AbortController | undefined;
    async function refresh() {
      if (document.hidden) return;
      controller?.abort();
      const active = new AbortController();
      controller = active;
      try {
        const response = await fetch("/api/notifications?mode=count", {
          cache: "no-store",
          signal: active.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!active.signal.aborted && typeof data.unread === "number")
          setUnread(data.unread);
      } catch {
        /* preserve the current count during transient failures */
      }
    }
    const tick = () => void refresh();
    tick();
    const timer = window.setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("collabio:notification-read", tick);
    return () => {
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("collabio:notification-read", tick);
    };
  }, []);

  return (
    <Link
      href="/notifications"
      className={cn(
        buttonVariants({ variant: "outline", size: "icon" }),
        "relative",
      )}
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      title="Notifications"
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
    </Link>
  );
}
