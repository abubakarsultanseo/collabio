"use client";

import { MessageSquare, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useChat, type ChatTarget } from "@/components/chat/chat-context";
import { Avatar } from "@/components/app/avatar";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Contact = {
  id: string;
  name: string;
  avatar_url?: string | null;
  latest_at?: string | null;
  unread: number;
};

export default function MessagesWorkspace({
  requestId,
  compact = false,
}: {
  requestId?: string;
  compact?: boolean;
}) {
  const { open, active } = useChat();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const contactRef = useRef<Contact[]>([]);
  const openedInitial = useRef(false);

  const read = useCallback((id: string) => {
    const updated = contactRef.current.map((contact) =>
      contact.id === id ? { ...contact, unread: 0 } : contact,
    );
    contactRef.current = updated;
    setContacts(updated);
  }, []);

  const select = useCallback(
    function selectContact(contact: Contact): ChatTarget {
      return {
        kind: "direct",
        threadId: contact.id,
        title: contact.name,
        avatarUrl: contact.avatar_url,
        onRead: read,
        nextUnread: () => {
          const next = contactRef.current.find(
            (item) => item.id !== contact.id && item.unread > 0,
          );
          return next ? selectContact(next) : undefined;
        },
      };
    },
    [read],
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (document.hidden) return;
      try {
        const response = await fetch("/api/chats?mode=contacts", {
          cache: "no-store",
          signal,
        });
        const data = await response.json();
        if (signal?.aborted) return;
        if (!response.ok)
          throw new Error(data.error ?? "Could not load direct chats.");
        const next = (data.contacts ?? []) as Contact[];
        contactRef.current = next;
        setContacts(next);
        setIsAdmin(data.isAdmin);
        setError("");
        if (!openedInitial.current && !data.isAdmin && next[0]) {
          openedInitial.current = true;
          open(select(next[0]));
        }
      } catch (caught) {
        if (!signal?.aborted)
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load direct chats.",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [open, select],
  );

  useEffect(() => {
    if (requestId) {
      openedInitial.current = true;
      open({ kind: "request", threadId: requestId });
    }
  }, [open, requestId]);

  useEffect(() => {
    const controller = new AbortController();
    const tick = () => void load(controller.signal);
    tick();
    const timer = window.setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  const visible = contacts.filter((contact) =>
    contact.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <div className="page-enter mx-auto max-w-5xl space-y-5">
      {!compact && (
        <header>
          <h1 className="text-2xl font-bold">
            {isAdmin
              ? "Chats"
              : contacts[0]
                ? `Chat with ${contacts[0].name}`
                : "Direct chat"}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Private messages for general collaboration.
          </p>
        </header>
      )}
      {error ? (
        <section className="os-card p-5" role="alert">
          <p className="text-sm">{error}</p>
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => void load()}
          >
            Retry
          </Button>
        </section>
      ) : loading ? (
        <p role="status" className="os-card p-5 text-sm text-[var(--muted)]">
          Loading chats…
        </p>
      ) : isAdmin ? (
        <section className="os-card overflow-hidden">
          <div className="border-b border-[var(--border)] p-4">
            <div className="relative max-w-md">
              <Search
                size={16}
                aria-hidden
                className="pointer-events-none absolute left-3 top-3 text-[var(--muted)]"
              />
              <Input
                type="search"
                className="pl-9"
                aria-label="Search partners"
                placeholder="Search partners"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          {visible.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={MessageSquare}
                title="No partners found"
                hint="Active partners appear here."
              />
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {visible.map((contact) => (
                <li key={contact.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--canvas)]",
                      active?.kind === "direct" &&
                        active.threadId === contact.id &&
                        "bg-[var(--brand-soft)]",
                    )}
                    onClick={() => open(select(contact))}
                  >
                    <Avatar
                      name={contact.name}
                      url={contact.avatar_url}
                      className="size-9"
                    />
                    <span
                      className="min-w-0 flex-1 truncate text-sm font-medium"
                      title={contact.name}
                    >
                      {contact.name}
                    </span>
                    {contact.unread > 0 && (
                      <span className="rounded-full bg-[var(--brand-soft)] px-2 py-1 text-xs font-semibold text-[var(--brand-dark)]">
                        {contact.unread} unread
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        contacts[0] && (
          <section className="os-card p-5">
            <Button onClick={() => open(select(contacts[0]))}>
              <MessageSquare size={16} aria-hidden /> Chat with{" "}
              {contacts[0].name}
              {contacts[0].unread > 0 ? ` · ${contacts[0].unread} unread` : ""}
            </Button>
          </section>
        )
      )}
    </div>
  );
}
