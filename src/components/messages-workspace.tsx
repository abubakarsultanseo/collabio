"use client";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

import { useToast } from "@/components/app/toast";
import { StatusBadge } from "@/components/status-badge";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Search, Send } from "lucide-react";
type Message = {
  id: string;
  request_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: { full_name: string } | null;
  request: {
    request_code: number;
    anchor_text: string;
    status: string;
    deadline_at: string;
  } | null;
};
type RequestOption = {
  id: string;
  request_code: number;
  anchor_text: string;
  status: string;
  deadline_at: string;
  created_at: string;
};
export default function MessagesWorkspace() {
  const notify = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [requests, setRequests] = useState<RequestOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [requestId, setRequestId] = useState("");
  const [body, setBody] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [m, r] = await Promise.all([
      fetch("/api/messages", { cache: "no-store" }),
      fetch("/api/requests", { cache: "no-store" }),
    ]);
    const md = await m.json(),
      rd = await r.json();
    if (!m.ok) throw new Error(md.error ?? "Could not load messages.");
    if (!r.ok) throw new Error(rd.error ?? "Could not load requests.");
    setMessages(md.messages ?? []);
    setCurrentUserId(md.currentUserId ?? "");
    const options = (rd.requests ?? []).map((row: RequestOption) => ({
      id: row.id,
      request_code: row.request_code,
      anchor_text: row.anchor_text,
      status: row.status,
      deadline_at: row.deadline_at,
      created_at: row.created_at,
    }));
    setRequests(options);
    const wanted =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("request")
        : null;
    setRequestId((current) =>
      options.some((item: RequestOption) => item.id === wanted)
        ? wanted!
        : options.some((item: RequestOption) => item.id === current)
          ? current
          : (options[0]?.id ?? ""),
    );
  }, []);
  useEffect(() => {
    load().catch((caught) => notify(caught.message, "error"));
  }, [load, notify]);
  const filtered = useMemo(
    () =>
      requests.filter((row) =>
        `${row.request_code} ${row.anchor_text} ${row.status}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [requests, search],
  );
  const thread = messages.filter((message) => message.request_id === requestId);
  const active = requests.find((row) => row.id === requestId);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, body }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not send message.");
      setBody("");
      await load();
    } catch (caught) {
      notify(
        caught instanceof Error ? caught.message : "Could not send message.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-enter mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Messages</h1>
          <p className="text-[var(--muted)] mt-2 text-sm">
            Each conversation stays connected to its collaboration request.
          </p>
        </div>
        <Link href="/requests/inbox" className={buttonVariants()}>
          Open inbox
        </Link>
      </header>
      <section className="os-card grid min-h-[620px] overflow-hidden lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <aside className="border-b border-[var(--border)] lg:border-b-0 lg:border-r">
          <div className="border-b p-4">
            <h2 className="font-semibold">Request discussions</h2>
            <div className="relative mt-3">
              <Search
                size={15}
                className="absolute left-3 top-3 text-[var(--muted)]"
              />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Find a request"
                placeholder="Find a request"
              />
            </div>
          </div>
          <div className="max-h-[260px] overflow-y-auto lg:max-h-[560px]">
            {filtered.length === 0 ? (
              <div className="p-3">
                <EmptyState
                  icon={MessageCircle}
                  title="No requests found"
                  hint="Try changing your search."
                />
              </div>
            ) : (
              filtered.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  onClick={() => setRequestId(row.id)}
                  className={`block w-full border-b px-4 py-4 text-left transition ${requestId === row.id ? "bg-[var(--info-bg)]" : "hover:bg-[var(--canvas)]"}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-[var(--text)]">
                      #{row.request_code} · {row.anchor_text}
                    </span>
                    {messages.some(
                      (message) => message.request_id === row.id,
                    ) && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--brand)]" />
                    )}
                  </span>
                  <span className="mt-1 block">
                    <StatusBadge status={row.status} />
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>
        <div className="flex min-h-[620px] min-w-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Current discussion
              </p>
              <h2 className="mt-1 truncate font-semibold">
                {active
                  ? `#${active.request_code} · ${active.anchor_text}`
                  : "Choose a request"}
              </h2>
            </div>
          </div>
          {!active ? (
            <div className="grid flex-1 place-items-center p-5">
              <EmptyState
                icon={MessageCircle}
                title="No request selected"
                hint="Create or receive a request to start a discussion."
              />
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-4 overflow-y-auto bg-[var(--canvas)] p-4 md:p-6">
                {thread.length === 0 ? (
                  <EmptyState
                    icon={MessageCircle}
                    title="No messages yet"
                    hint="Send the first update about this request."
                  />
                ) : (
                  thread.map((message) => {
                    const mine = message.author_id === currentUserId;
                    return (
                      <article
                        key={message.id}
                        className={`flex ${mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[min(85%,680px)] rounded-2xl px-4 py-3 shadow-sm ${mine ? "rounded-br-md bg-[var(--brand)] text-white dark:text-[var(--canvas)]" : "rounded-bl-md border border-[var(--border)] bg-[var(--card)] text-[var(--text)]"}`}
                        >
                          <div
                            className={`mb-1 flex flex-wrap items-center justify-between gap-x-4 text-[11px] ${mine ? "text-white dark:text-[var(--canvas)]" : "text-[var(--muted)]"}`}
                          >
                            <span className="font-semibold">
                              {mine
                                ? "You"
                                : (message.author?.full_name ?? "Partner")}
                            </span>
                            <time>
                              {new Date(message.created_at).toLocaleString(
                                "en-PK",
                                { timeZone: "Asia/Karachi" },
                              )}
                            </time>
                          </div>
                          <p className="whitespace-pre-wrap break-words text-sm leading-6">
                            {message.body}
                          </p>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
              <form onSubmit={send} className="border-t bg-[var(--card)] p-4">
                <label htmlFor="message-body" className="sr-only">
                  Write a message
                </label>
                <div className="flex items-end gap-2">
                  <Textarea
                    id="message-body"
                    className="min-h-12 resize-y"
                    rows={2}
                    maxLength={5000}
                    required
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Write a message or placement update…"
                  />
                  <Button
                    disabled={busy || !body.trim()}
                    className="inline-flex shrink-0 items-center gap-2"
                  >
                    <Send size={15} />
                    {busy ? "Sending…" : "Send"}
                  </Button>
                </div>
                <p className="text-[var(--muted)] mt-2 text-right text-[11px]">
                  Messages are saved in this request’s activity history.
                </p>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
