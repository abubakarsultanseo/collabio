"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export default function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(false);
  }, [pathname, search]);

  useEffect(() => {
    let timeout: number | undefined;
    function handleClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.hasAttribute("download") ||
        (link.target && link.target !== "_self")
      )
        return;
      const destination = new URL(link.href);
      const current = new URL(window.location.href);
      if (
        destination.origin !== current.origin ||
        destination.pathname.startsWith("/api/")
      )
        return;
      if (
        destination.pathname === current.pathname &&
        destination.search === current.search
      )
        return;

      setPending(true);
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setPending(false), 10000);
    }

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      window.clearTimeout(timeout);
    };
  }, []);

  return pending ? (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px] bg-[var(--brand)] motion-safe:animate-pulse"
      role="status"
      aria-label="Loading page"
    />
  ) : null;
}
