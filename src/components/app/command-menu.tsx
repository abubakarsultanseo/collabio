"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { adminItems, workspaceItems } from "@/components/app/nav-items";

export function CommandMenu({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const firstResult = useRef<HTMLAnchorElement>(null);
  const items = isAdmin ? [...workspaceItems, ...adminItems] : workspaceItems;
  const matches = items.filter((item) =>
    item.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function updateOpen(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "k" ||
        event.repeat
      )
        return;
      event.preventDefault();
      setOpen((current) => !current);
      setQuery("");
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  return (
    <Dialog open={open} onOpenChange={updateOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          className="size-9 px-0 sm:w-auto sm:px-3"
          aria-label="Search pages"
        >
          <Search size={16} aria-hidden />
          <span className="hidden sm:inline">Jump to</span>
          <kbd className="hidden rounded border border-[var(--border)] px-1 text-[10px] text-[var(--muted)] sm:inline">
            ⌘/Ctrl K
          </kbd>
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Jump to a page"
        description="Search by page name."
        initialFocus={input}
      >
        <Input
          ref={input}
          type="search"
          aria-label="Find a page"
          placeholder="Search pages"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              firstResult.current?.click();
            }
          }}
        />
        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto p-1">
          {matches.length === 0 && (
            <p role="status" className="px-3 py-4 text-sm text-[var(--muted)]">
              No pages found.
            </p>
          )}
          {matches.map(({ href, label, icon: Icon }, index) => (
            <Link
              key={href}
              href={href}
              ref={index === 0 ? firstResult : undefined}
              onClick={() => updateOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-[var(--canvas)]"
            >
              <Icon size={16} className="text-[var(--muted)]" aria-hidden />{" "}
              {label}
            </Link>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
