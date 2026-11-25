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
import type { ChatTarget } from "@/components/chat/chat-context";
import { isDocumentRequest, requestLabel } from "@/lib/request-content";
import { Avatar } from "@/components/app/avatar";
import { useToast } from "@/components/app/toast";
import { StatusBadge, formatStatus } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Message = {
  id: string;
  author_id: string;
  author?: { full_name: string; avatar_url: string | null } | null;
  body: string;
  created_at: string;
};
type Outbox = { id: string; body: string; state: "sending" | "failed" };
type RequestDetails = {
  id: string;
  request_code: number;
  placement_page_url: string;
  anchor_text: string | null;
  target_link: string | null;
  document_url?: string | null;
  live_url?: string | null;
  attachment_name?: string | null;
  request_type: string;
  status: string;
};
type ThreadResponse = {
  messages: Message[];
  hasOlder: boolean;
  hasNewer?: boolean;
  threadId?: string;
  userId: string;
  canWrite: boolean;
  title?: string;
  avatar_url?: string | null;
  request?: RequestDetails;
};

export type ChatSnapshot = {
  data: ThreadResponse;
  cursor?: Message;
  at: number;
};

class ThreadAccessError extends Error {}

function LinkifiedMessage({ text }: { text: string }) {
  return text
    .split(/((?:https?:\/\/|www\.)[^\s<>"']+)/gi)
    .map((part, index) => {
      if (!/^(?:https?:\/\/|www\.)/i.test(part)) return part;
      const cleaned = part.replace(/[.,!?;:]+$/, "");
      try {
        const url = new URL(
          /^www\./i.test(cleaned) ? `https://${cleaned}` : cleaned,
        );
        if (url.protocol !== "http:" && url.protocol !== "https:") return part;
        return (
          <span key={index}>
            <a
              className="text-[var(--brand-dark)] underline underline-offset-2"
              href={url.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {cleaned}
            </a>
            {part.slice(cleaned.length)}
          </span>
        );
      } catch {
        return part;
      }
    });
}

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
  initialDraft = "",
  onDraft,
  initialSnapshot,
  onSnapshot,
}: {
  target: ChatTarget;
  open: (target: ChatTarget) => void;
  initialDraft?: string;
  onDraft?: (value: string) => void;
  initialSnapshot?: ChatSnapshot;
  onSnapshot: (snapshot?: ChatSnapshot) => void;
}) {
  const notify = useToast();
  const [info, setInfo] = useState<ThreadResponse | null>(
    initialSnapshot?.data ?? null,
  );
  const [history, setHistory] = useState<Message[]>(
    initialSnapshot?.data.messages ?? [],
  );
  const [outbox, setOutbox] = useState<Outbox[]>([]);
  const [older, setOlder] = useState(initialSnapshot?.data.hasOlder ?? false);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState("");
  const [body, setBody] = useState(initialDraft);
  const [next, setNext] = useState<ChatTarget | undefined>();
  const list = useRef<HTMLDivElement>(null);
  const historyRef = useRef<Message[]>(initialSnapshot?.data.messages ?? []);
  const cursor = useRef(initialSnapshot?.cursor);
  const olderAvailable = useRef(initialSnapshot?.data.hasOlder ?? false);
  const resolvedThreadId = useRef(initialSnapshot?.data.threadId);
  const snapshot = useRef(onSnapshot);
  const savedFloor = useRef<{ height: number; top: number } | null>(null);
  const shouldScroll = useRef(true);
  const latestRead = useRef<string | null>(null);
  const readPending = useRef(false);
  const refreshing = useRef(false);
  const pending = useRef(new Set<string>());
  const actions = useRef(target);

  useEffect(() => {
    actions.current = target;
    snapshot.current = onSnapshot;
  }, [target, onSnapshot]);

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
      const thread = actions.current;
      if (thread.threadId === "assigned" && !resolvedThreadId.current) return;
      await chatAction(
        { ...thread, threadId: resolvedThreadId.current ?? thread.threadId },
        "read",
        newest.id,
      );
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
    async (
      anchor?: Message,
      signal?: AbortSignal,
      direction = "before",
    ): Promise<ThreadResponse> => {
      const params = new URLSearchParams({
        kind: target.kind,
        threadId: target.threadId,
      });
      if (anchor) {
        params.set(`${direction}At`, anchor.created_at);
        params.set(`${direction}Id`, anchor.id);
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
      try {
        let result: ThreadResponse;
        let pages = 0;
        const current = historyRef.current;
        const viewport = list.current;
        shouldScroll.current =
          !current.length ||
          (!!viewport &&
            viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
              80);
        do {
          const after = cursor.current;
          result = await fetchPage(after, signal, "after");
          if (signal?.aborted) return;
          if (
            after &&
            resolvedThreadId.current &&
            result.threadId &&
            result.threadId !== resolvedThreadId.current
          ) {
            cursor.current = undefined;
            latestRead.current = null;
            historyRef.current = [];
            setHistory([]);
            setOutbox([]);
            setInfo(null);
            snapshot.current();
            result = await fetchPage(undefined, signal);
            if (signal?.aborted) return;
            olderAvailable.current = result.hasOlder;
            setOlder(result.hasOlder);
          }
          if (result.threadId) resolvedThreadId.current = result.threadId;
          if (!after) {
            olderAvailable.current = result.hasOlder;
            setOlder(result.hasOlder);
          }
          const known = new Set(
            historyRef.current.map((message) => message.id),
          );
          const incoming = result.messages.filter(
            (message) => !known.has(message.id),
          );
          if (incoming.length) {
            historyRef.current = [...historyRef.current, ...incoming].sort(
              (a, b) =>
                a.created_at.localeCompare(b.created_at) ||
                a.id.localeCompare(b.id),
            );
            setHistory(historyRef.current);
          }
          cursor.current = result.messages.at(-1) ?? cursor.current;
          pages += 1;
        } while (result.hasNewer && pages < 4);

        if (signal?.aborted) return;
        if (historyRef.current !== current) {
          const confirmed = new Set(
            historyRef.current.map((message) => message.id),
          );
          setOutbox((items) => items.filter((item) => !confirmed.has(item.id)));
        }
        const metadata = {
          ...result,
          messages: [],
          hasOlder: olderAvailable.current,
        };
        setInfo(metadata);
        snapshot.current({
          data: {
            ...metadata,
            messages: historyRef.current.slice(-80),
            hasOlder: olderAvailable.current || historyRef.current.length > 80,
          },
          cursor: cursor.current,
          at: Date.now(),
        });
        setError("");
        setNext(actions.current.nextUnread?.());
        void markVisible();
      } catch (caught) {
        if (signal?.aborted) return;
        if (caught instanceof ThreadAccessError) {
          snapshot.current();
          cursor.current = undefined;
          resolvedThreadId.current = undefined;
          setInfo(null);
          historyRef.current = [];
          setHistory([]);
          setOutbox([]);
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
      olderAvailable.current = result.hasOlder;
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
      const data = await chatAction(
        { ...target, threadId: resolvedThreadId.current ?? target.threadId },
        "send",
        item.id,
        item.body,
      );
      const saved = data.message as Message;
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || !info?.canWrite) return;
    const item: Outbox = {
      id: crypto.randomUUID(),
      body: body.trim(),
      state: "sending",
    };
    setBody("");
    onDraft?.("");
    void send(item);
  }

  const request = info?.request;
  const title = request
    ? requestChatTitle(request.placement_page_url, requestLabel(request))
    : (info?.title ?? target.title ?? "Conversation");
  return (
    <>
      <header className="shrink-0 space-y-3 border-b border-[var(--border)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {target.kind === "direct" && (
              <Avatar name={title} url={info?.avatar_url ?? target.avatarUrl} />
            )}
            <h2 className="min-w-0 break-words text-base font-semibold">
              {title}
            </h2>
          </div>
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
        {(request || target.requestInfo?.code) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <span>
              Request #{request?.request_code ?? target.requestInfo?.code}
            </span>
            {target.requestInfo?.partnerName && (
              <span>· {target.requestInfo.partnerName}</span>
            )}
            {request ? (
              <StatusBadge status={request.status} />
            ) : (
              target.requestInfo?.status && (
                <StatusBadge status={target.requestInfo.status} />
              )
            )}
            {request && (
              <span className="capitalize">
                {formatStatus(request.request_type)}
              </span>
            )}
          </div>
        )}
        {request && (
          <>
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-[var(--brand-dark)]">
              <a
                href={request.placement_page_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1"
              >
                {isDocumentRequest(request.request_type)
                  ? "Site"
                  : "Placement page"}{" "}
                <ExternalLink size={12} aria-hidden />
              </a>
              {request.anchor_text && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(request.anchor_text ?? "")
                      .then(() => notify("Anchor copied."))
                      .catch(() =>
                        notify("Could not copy the anchor.", "error"),
                      );
                  }}
                >
                  <Copy size={12} aria-hidden /> Copy anchor
                </button>
              )}
              {request.target_link && (
                <a
                  href={request.target_link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1"
                >
                  Target URL <ExternalLink size={12} aria-hidden />
                </a>
              )}
              {request.document_url && (
                <a
                  href={request.document_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1"
                >
                  Document <ExternalLink size={12} aria-hidden />
                </a>
              )}
              {request.status === "live" && request.live_url && (
                <a
                  href={request.live_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1"
                >
                  Published link <ExternalLink size={12} aria-hidden />
                </a>
              )}
              {request.attachment_name && (
                <a
                  href={`/api/requests/attachment?requestId=${request.id}`}
                  className="inline-flex items-center gap-1"
                >
                  Download document
                </a>
              )}
            </div>
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
              className={`flex items-end gap-2 ${own ? "flex-row-reverse" : "justify-start"}`}
            >
              <Avatar
                name={message.author?.full_name ?? (own ? "You" : title)}
                url={message.author?.avatar_url}
                className="size-6 text-[9px]"
              />
              <div
                className={`min-w-0 max-w-[82%] rounded-xl border border-[var(--border)] px-3 py-2 ${own ? "bg-[var(--brand-soft)]" : "bg-[var(--card)]"}`}
              >
                <p className="whitespace-pre-wrap break-words text-sm">
                  <LinkifiedMessage text={message.body} />
                </p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">
                  {own
                    ? "You"
                    : (message.author?.full_name ??
                      info?.title ??
                      "Other participant")}{" "}
                  ·{" "}
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
              <LinkifiedMessage text={item.body} />
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
            onChange={(event) => {
              setBody(event.target.value);
              onDraft?.(event.target.value);
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                if (!event.repeat) event.currentTarget.form?.requestSubmit();
              }
            }}
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
