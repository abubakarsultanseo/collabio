"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Copy, ExternalLink, Send } from "lucide-react";
import type { ChatTarget } from "@/components/chat/chat-drawer";
import { useToast } from "@/components/app/toast";
import { StatusBadge, formatStatus } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Message = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
};
type Outbox = { id: string; body: string; state: "sending" | "failed" };
type RequestDetails = {
  id: string;
  request_code: number;
  placement_page_url: string;
  anchor_text: string;
  target_link: string;
  request_type: string;
  status: string;
};
type ThreadResponse = {
  messages: Message[];
  hasOlder: boolean;
  userId: string;
  canWrite: boolean;
  title?: string;
  request?: RequestDetails;
  canUpdateStatus?: boolean;
};

class ThreadAccessError extends Error {}

const statuses = [
  "new_request",
  "seen",
  "reviewing",
  "accepted",
  "rejected",
  "in_progress",
  "live",
  "shared",
  "hold",
  "waiting_for_partner",
  "cancelled",
  "overdue",
];

export function requestChatTitle(url: string, anchor: string) {
  try {
    return `${new URL(url).hostname} (${anchor})`;
  } catch {
    return anchor;
  }
}

function date(value: string) {
  return new Date(value).toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function chatAction(
  target: ChatTarget,
  action: "send" | "read",
  id: string,
  body?: string,
) {
  const response = await fetch("/api/chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: target.kind,
      threadId: target.threadId,
      action,
      id,
      body,
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Chat is unavailable.");
  return result;
}

export function ChatThread({
  target,
  open,
}: {
  target: ChatTarget;
  open: (target: ChatTarget) => void;
}) {
  const notify = useToast();
  const [info, setInfo] = useState<ThreadResponse | null>(null);
  const [history, setHistory] = useState<Message[]>([]);
  const [outbox, setOutbox] = useState<Outbox[]>([]);
  const [older, setOlder] = useState(false);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = useState("");
  const [next, setNext] = useState<ChatTarget | undefined>();
  const list = useRef<HTMLDivElement>(null);
  const historyRef = useRef<Message[]>([]);
  const savedFloor = useRef<{ height: number; top: number } | null>(null);
  const shouldScroll = useRef(true);
  const latestRead = useRef<string | null>(null);
  const readPending = useRef(false);
  const historyGeneration = useRef(0);
  const refreshing = useRef(false);
  const pending = useRef(new Set<string>());
  const requestStatusInFlight = useRef(false);
  const latestRequestStatus = useRef<{
    status: string;
    savedAt: number;
  } | null>(null);
  const actions = useRef(target);

  useEffect(() => {
    actions.current = target;
  }, [target]);

  const markVisible = useCallback(async () => {
    const newest = historyRef.current.at(-1);
    const viewport = list.current;
    if (
      !newest ||
      !viewport ||
      document.hidden ||
      readPending.current ||
      latestRead.current === newest.id
    )
      return;
    if (viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 80)
      return;
    readPending.current = true;
    try {
      await chatAction(actions.current, "read", newest.id);
      latestRead.current = newest.id;
      actions.current.onRead?.(actions.current.threadId);
      setNext(actions.current.nextUnread?.());
    } catch {
      // The next refresh retries without advancing the local unread marker.
    } finally {
      readPending.current = false;
    }
  }, []);

  const fetchPage = useCallback(
    async (before?: Message, signal?: AbortSignal): Promise<ThreadResponse> => {
      const params = new URLSearchParams({
        kind: target.kind,
        threadId: target.threadId,
      });
      if (before) {
        params.set("beforeAt", before.created_at);
        params.set("beforeId", before.id);
      }
      const response = await fetch(`/api/chats?${params}`, {
        cache: "no-store",
        signal,
      });
      const result = await response.json();
      if ([401, 403, 404].includes(response.status))
        throw new ThreadAccessError(
          result.error ?? "Conversation unavailable.",
        );
      if (!response.ok)
        throw new Error(result.error ?? "Could not open this chat.");
      return result;
    },
    [target.kind, target.threadId],
  );

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (document.hidden || refreshing.current) return;
      refreshing.current = true;
      const started = Date.now();
      const generation = historyGeneration.current;
      try {
        const result = await fetchPage(undefined, signal);
        if (signal?.aborted) return;
        const current = historyRef.current;
        if (
          generation !== historyGeneration.current &&
          current.at(-1)?.id !== result.messages.at(-1)?.id
        )
          return;
        const newest = result.messages.at(-1);
        const changes = newest?.id !== current.at(-1)?.id;
        const isFirst = !current.length;
        const viewport = list.current;
        shouldScroll.current =
          isFirst ||
          (!!viewport &&
            viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
              80);
        if (changes || isFirst) {
          const overlap = new Set(result.messages.map((message) => message.id));
          const firstMatch = current.findIndex((message) =>
            overlap.has(message.id),
          );
          const previous =
            firstMatch === -1 ? [] : current.slice(0, firstMatch);
          const combined = [...previous, ...result.messages];
          historyRef.current = combined;
          setHistory(combined);
          if (!previous.length) setOlder(result.hasOlder);
        }
        const confirmed = new Set(result.messages.map((message) => message.id));
        setOutbox((items) => items.filter((item) => !confirmed.has(item.id)));
        const localStatus = latestRequestStatus.current;
        if (result.request && localStatus && localStatus.savedAt >= started) {
          result.request.status = localStatus.status;
        }
        setInfo(result);
        setError("");
        setNext(actions.current.nextUnread?.());
        if (!changes) void markVisible();
      } catch (caught) {
        if (signal?.aborted) return;
        if (caught instanceof ThreadAccessError) {
          setInfo(null);
          historyRef.current = [];
          setHistory([]);
          setOlder(false);
        }
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load this chat.",
        );
      } finally {
        refreshing.current = false;
      }
    },
    [fetchPage, markVisible],
  );

  useEffect(() => {
    const controller = new AbortController();
    const tick = () => void refresh(controller.signal);
    tick();
    document.addEventListener("visibilitychange", tick);
    const timer = window.setInterval(tick, 5000);
    return () => {
      controller.abort();
      refreshing.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  useLayoutEffect(() => {
    const viewport = list.current;
    if (viewport && savedFloor.current) {
      viewport.scrollTop =
        savedFloor.current.top +
        (viewport.scrollHeight - savedFloor.current.height);
      savedFloor.current = null;
    } else if (viewport && shouldScroll.current) {
      viewport.scrollTop = viewport.scrollHeight;
    }
    if (info) void markVisible();
  }, [history, info, outbox, markVisible]);

  async function loadOlder() {
    const first = historyRef.current[0];
    if (!first || paging) return;
    setPaging(true);
    try {
      const result = await fetchPage(first);
      const known = new Set(historyRef.current.map((message) => message.id));
      const viewport = list.current;
      if (viewport)
        savedFloor.current = {
          height: viewport.scrollHeight,
          top: viewport.scrollTop,
        };
      historyRef.current = [
        ...result.messages.filter((message) => !known.has(message.id)),
        ...historyRef.current,
      ];
      setHistory(historyRef.current);
      setOlder(result.hasOlder);
    } catch (caught) {
      notify(
        caught instanceof Error
          ? caught.message
          : "Could not load older messages.",
        "error",
      );
    } finally {
      setPaging(false);
    }
  }

  async function send(item: Outbox) {
    if (pending.current.has(item.id)) return;
    pending.current.add(item.id);
    shouldScroll.current = true;
    setOutbox((items) =>
      items.some((current) => current.id === item.id)
        ? items.map((current) =>
            current.id === item.id ? { ...current, state: "sending" } : current,
          )
        : [...items, item],
    );
    try {
      const data = await chatAction(target, "send", item.id, item.body);
      const saved = data.message as Message;
      historyGeneration.current++;
      if (!historyRef.current.some((message) => message.id === saved.id)) {
        historyRef.current = [...historyRef.current, saved].sort(
          (a, b) =>
            a.created_at.localeCompare(b.created_at) ||
            a.id.localeCompare(b.id),
        );
        setHistory(historyRef.current);
      }
      setOutbox((items) => items.filter((current) => current.id !== item.id));
    } catch {
      setOutbox((items) =>
        items.map((current) =>
          current.id === item.id ? { ...current, state: "failed" } : current,
        ),
      );
    } finally {
      pending.current.delete(item.id);
    }
  }

  async function changeStatus(requestId: string, status: string) {
    if (requestStatusInFlight.current) return;
    requestStatusInFlight.current = true;
    setSavingStatus(status);
    setStatusFeedback("Saving…");
    try {
      const response = await fetch("/api/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: requestId, status }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not save this status.");
      const saved = result.request?.status ?? status;
      latestRequestStatus.current = { status: saved, savedAt: Date.now() };
      setInfo((current) =>
        current?.request
          ? { ...current, request: { ...current.request, status: saved } }
          : current,
      );
      window.dispatchEvent(
        new CustomEvent("collabio:request-updated", {
          detail: { id: requestId, status: saved },
        }),
      );
      setStatusFeedback("Saved");
    } catch (caught) {
      setStatusFeedback("Save failed");
      notify(
        caught instanceof Error
          ? caught.message
          : "Could not save this status.",
        "error",
      );
    } finally {
      requestStatusInFlight.current = false;
      setSavingStatus(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || !info?.canWrite) return;
    const item: Outbox = {
      id: crypto.randomUUID(),
      body: body.trim(),
      state: "sending",
    };
    setBody("");
    void send(item);
  }

  const request = info?.request;
  const title = request
    ? requestChatTitle(request.placement_page_url, request.anchor_text)
    : (info?.title ?? target.title ?? "Conversation");
  return (
    <>
      <header className="shrink-0 space-y-3 border-b border-[var(--border)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="min-w-0 break-words text-base font-semibold">
            {title}
          </h2>
          {next && (
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => open(next)}
            >
              Next unread →
            </Button>
          )}
        </div>
        {request && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
              <span>
                Request #{request.request_code} ·{" "}
                <span className="capitalize">
                  {formatStatus(request.request_type)}
                </span>
              </span>
              <StatusBadge status={savingStatus ?? request.status} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-[var(--brand-dark)]">
              <a
                href={request.placement_page_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1"
              >
                Placement page <ExternalLink size={12} aria-hidden />
              </a>
              <button
                type="button"
                className="inline-flex items-center gap-1"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(request.anchor_text)
                    .then(() => notify("Anchor copied."))
                    .catch(() => notify("Could not copy the anchor.", "error"));
                }}
              >
                <Copy size={12} aria-hidden /> Copy anchor
              </button>
              <a
                href={request.target_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1"
              >
                Target URL <ExternalLink size={12} aria-hidden />
              </a>
            </div>
            {info?.canUpdateStatus && (
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label="Update request status"
                  className="h-8 w-auto capitalize"
                  disabled={!!savingStatus}
                  value={savingStatus ?? request.status}
                  onChange={(event) =>
                    void changeStatus(request.id, event.target.value)
                  }
                >
                  {statuses.map((status) => (
                    <option value={status} key={status}>
                      {formatStatus(status)}
                    </option>
                  ))}
                </Select>
                <span role="status" className="text-xs text-[var(--muted)]">
                  {statusFeedback}
                </span>
              </div>
            )}
          </>
        )}
      </header>

      <div
        ref={list}
        onScroll={() => void markVisible()}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[var(--canvas)] p-4"
      >
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm"
          >
            <p>{error}</p>
            <Button
              className="mt-2"
              variant="secondary"
              size="sm"
              onClick={() => void refresh()}
            >
              Retry
            </Button>
          </div>
        )}
        {!info && !error && (
          <p role="status" className="text-sm text-[var(--muted)]">
            Loading conversation…
          </p>
        )}
        {older && (
          <Button
            variant="secondary"
            size="sm"
            className="mx-auto flex"
            disabled={paging}
            onClick={() => void loadOlder()}
          >
            {paging ? "Loading…" : "Load older messages"}
          </Button>
        )}
        {info && !error && !history.length && !outbox.length && (
          <p className="py-12 text-center text-sm text-[var(--muted)]">
            No messages yet. Start the conversation below.
          </p>
        )}
        {history.map((message) => {
          const own = message.author_id === info?.userId;
          return (
            <div
              key={message.id}
              className={`flex ${own ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-xl border border-[var(--border)] px-3 py-2 ${own ? "bg-[var(--brand-soft)]" : "bg-[var(--card)]"}`}
              >
                <p className="whitespace-pre-wrap break-words text-sm">
                  {message.body}
                </p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">
                  {own ? "You" : (info?.title ?? "Other participant")} ·{" "}
                  <time dateTime={message.created_at}>
                    {date(message.created_at)}
                  </time>
                </p>
              </div>
            </div>
          );
        })}
        {outbox.map((item) => (
          <div
            key={item.id}
            className="ml-auto max-w-[88%] rounded-xl border border-[var(--border)] bg-[var(--brand-soft)] px-3 py-2"
          >
            <p className="whitespace-pre-wrap break-words text-sm">
              {item.body}
            </p>
            <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
              <span role="status">
                {item.state === "sending" ? "Sending…" : "Could not send"}
              </span>
              {item.state === "failed" && (
                <button
                  type="button"
                  className="font-semibold text-[var(--brand-dark)]"
                  onClick={() => void send(item)}
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {info?.canWrite && (
        <form
          onSubmit={submit}
          className="flex shrink-0 items-end gap-2 border-t border-[var(--border)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <Textarea
            className="min-h-12 resize-y"
            maxLength={5000}
            rows={2}
            aria-label="Message"
            placeholder="Write a message…"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <Button type="submit" disabled={!body.trim()}>
            <Send size={15} aria-hidden /> Send
          </Button>
        </form>
      )}
      {info && !info.canWrite && (
        <p className="border-t border-[var(--border)] p-3 text-sm text-[var(--muted)]">
          You can read this conversation. Your admin has disabled replies.
        </p>
      )}
    </>
  );
}
