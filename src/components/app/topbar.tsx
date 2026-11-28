"use client";

import { usePathname } from "next/navigation";
import { CommandMenu } from "@/components/app/command-menu";
import {
  adminItems,
  isActivePage,
  workspaceNav,
} from "@/components/app/nav-items";
import { ProfileMenu, type MenuProfile } from "@/components/app/profile-menu";
import { NotificationBell } from "@/components/app/notification-bell";
import { ThemeToggle } from "@/components/app/theme-toggle";

export function Topbar({ profile }: { profile: MenuProfile }) {
  const path = usePathname();
  const isAdmin = profile.role === "admin";
  const page = [...workspaceNav(isAdmin), ...(isAdmin ? adminItems : [])].find(
    (item) => isActivePage(path, item.href),
  );

  return (
    <header className="mb-5 flex min-w-0 items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-semibold">
          {page?.label ?? "Collabio"}
        </span>
        {isAdmin && (
          <span className="rounded-full bg-[var(--info-bg)] px-2 py-0.5 text-[9px] font-bold text-[var(--brand-dark)]">
            ADMIN
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <CommandMenu isAdmin={isAdmin} />
        <NotificationBell />
        <ThemeToggle />
        <ProfileMenu profile={profile} />
      </div>
    </header>
  );
}
