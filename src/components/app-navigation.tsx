"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, LogOut } from "lucide-react";
import { useEffect, useRef } from "react";
import { Brand } from "@/components/app/brand";
import {
  adminItems,
  isActivePage,
  workspaceItems,
  type NavItem,
} from "@/components/app/nav-items";
import { cn } from "@/lib/utils";

const inactive =
  "text-[var(--muted)] hover:bg-[var(--canvas)] hover:text-[var(--text)]";
const active = "bg-[var(--brand-soft)] text-[var(--brand-dark)]";

function NavLink({
  item,
  path,
  compact,
  onClick,
}: {
  item: NavItem;
  path: string;
  compact?: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  const selected = isActivePage(path, item.href);

  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "group flex min-w-0 items-center rounded-xl font-medium transition",
        compact
          ? "flex-col justify-center gap-1 px-1 py-2 text-[10px]"
          : "gap-3 px-3 py-2.5 text-sm",
        selected ? active : inactive,
      )}
    >
      <Icon
        size={17}
        strokeWidth={1.8}
        className="shrink-0 motion-safe:transition-transform motion-safe:group-hover:scale-110"
        aria-hidden
      />
      <span className="truncate">
        {compact ? item.mobileLabel : item.label}
      </span>
    </Link>
  );
}

function Section({
  title,
  items,
  path,
  onClick,
}: {
  title: string;
  items: NavItem[];
  path: string;
  onClick?: () => void;
}) {
  return (
    <div>
      <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-[var(--muted)]">
        {title}
      </p>
      <nav aria-label={title} className="space-y-1">
        {items.map((item) => (
          <NavLink key={item.href} item={item} path={path} onClick={onClick} />
        ))}
      </nav>
    </div>
  );
}

function SignOut() {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
          inactive,
        )}
      >
        <LogOut size={17} aria-hidden /> Sign out
      </button>
    </form>
  );
}

export default function AppNavigation({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const more = useRef<HTMLDetailsElement>(null);
  const moreTrigger = useRef<HTMLElement>(null);
  const overflow = workspaceItems.filter((item) => !item.mobileLabel);
  const moreActive = [...overflow, ...(isAdmin ? adminItems : [])].some(
    (item) => isActivePage(path, item.href),
  );

  function closeMore() {
    if (more.current) more.current.open = false;
  }

  useEffect(() => {
    closeMore();
  }, [path]);

  useEffect(() => {
    function closeOnOutside(event: PointerEvent) {
      if (event.target instanceof Node && !more.current?.contains(event.target))
        closeMore();
    }
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, []);

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-[var(--border)] bg-[var(--card)] lg:flex">
        <Link href="/dashboard" className="mx-4 my-5 rounded-xl p-2">
          <Brand />
        </Link>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          <Section title="Workspace" items={workspaceItems} path={path} />
          {isAdmin && (
            <Section title="Administration" items={adminItems} path={path} />
          )}
        </div>
        <div className="border-t border-[var(--border)] p-4">
          <SignOut />
        </div>
      </aside>

      <nav
        aria-label="Primary mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 gap-1 border-t border-[var(--border)] bg-[var(--card)] px-2 pt-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] lg:hidden"
      >
        {workspaceItems
          .filter((item) => item.mobileLabel)
          .map((item) => (
            <NavLink
              key={item.href}
              item={item}
              path={path}
              compact
              onClick={closeMore}
            />
          ))}
        <details
          ref={more}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              closeMore();
              moreTrigger.current?.focus();
            }
          }}
        >
          <summary
            ref={moreTrigger}
            className={cn(
              "flex list-none flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium [&::-webkit-details-marker]:hidden",
              moreActive ? active : inactive,
            )}
          >
            <Ellipsis size={17} aria-hidden /> More
          </summary>
          <div className="os-card absolute inset-x-2 bottom-[calc(100%_+_0.5rem)] ml-auto max-h-[65dvh] max-w-sm space-y-4 overflow-y-auto p-3 shadow-lg">
            <Section
              title="Workspace"
              items={overflow}
              path={path}
              onClick={closeMore}
            />
            {isAdmin && (
              <Section
                title="Administration"
                items={adminItems}
                path={path}
                onClick={closeMore}
              />
            )}
            <SignOut />
          </div>
        </details>
      </nav>
    </>
  );
}
