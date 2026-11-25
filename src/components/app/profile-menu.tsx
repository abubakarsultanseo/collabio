"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { useRef } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { Avatar } from "@/components/app/avatar";
import { Button } from "@/components/ui/button";

export type MenuProfile = {
  name: string;
  email: string;
  role: string;
  status: string;
  avatarUrl?: string | null;
};

export function ProfileMenu({ profile }: { profile: MenuProfile }) {
  const signOut = useRef<HTMLFormElement>(null);
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <Button
          type="button"
          variant="secondary"
          className="h-9 max-w-44 px-2"
          aria-label="Account menu"
        >
          <Avatar
            name={profile.name}
            url={profile.avatarUrl}
            className="size-6 text-[10px]"
          />
          <span className="hidden truncate md:inline">{profile.name}</span>
          <ChevronDown size={14} className="shrink-0" aria-hidden />
        </Button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="end"
          sideOffset={8}
          className="os-card z-40 w-64 p-2 shadow-lg"
        >
          <Dropdown.Label className="space-y-1 p-2 text-sm">
            <p className="break-words font-semibold">{profile.name}</p>
            <p className="break-all text-xs text-[var(--muted)]">
              {profile.email}
            </p>
            <span className="inline-flex gap-2 pt-1 text-xs capitalize">
              <span className="rounded-full bg-[var(--info-bg)] px-2 py-1 text-[var(--brand-dark)]">
                {profile.role}
              </span>
              <span className="rounded-full bg-[var(--success-bg)] px-2 py-1 text-[var(--green)]">
                {profile.status}
              </span>
            </span>
          </Dropdown.Label>
          <Dropdown.Separator className="my-1 border-t border-[var(--border)]" />
          <form ref={signOut} action="/auth/signout" method="post">
            <Dropdown.Item
              asChild
              onSelect={(event) => {
                event.preventDefault();
                signOut.current?.requestSubmit();
              }}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm outline-none data-[highlighted]:bg-[var(--canvas)]"
              >
                <LogOut size={16} aria-hidden /> Sign out
              </button>
            </Dropdown.Item>
          </form>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
