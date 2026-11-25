"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat, type ChatTarget } from "@/components/chat/chat-drawer";
import { requestLabel } from "@/lib/request-content";
import { requestChatTitle } from "@/components/chat/chat-thread";

type SourceRow = {
  id: string;
  placement_page_url: string;
  anchor_text: string | null;
  request_type?: string;
};

export function useRequestChat(rows: SourceRow[]) {
  const { open } = useChat();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const current = useRef(rows);
  const currentCounts = useRef<Record<string, number>>({});
  const readVersion = useRef(new Map<string, number>());
  const ids = rows.map((row) => row.id).join(",");

  useEffect(() => {
    current.current = rows;
  }, [rows]);
  useEffect(() => {
    if (!ids) return;
    const controller = new AbortController();
    let loading = false;

    async function load() {
      if (document.hidden || loading) return;
      loading = true;
      const started = Date.now();
      try {
        const requestIds = ids.split(",");
        const batches: string[][] = [];
        for (let index = 0; index < requestIds.length; index += 500)
          batches.push(requestIds.slice(index, index + 500));
        const results = (
          await Promise.all(
            batches.map(async (batch) => {
              const response = await fetch("/api/chats", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "unread", ids: batch }),
                signal: controller.signal,
              });
              if (!response.ok)
                throw new Error("Could not refresh unread counts.");
              const { counts } = (await response.json()) as {
                counts: Array<{ thread_id: string; unread: number }>;
              };
              return counts;
            }),
          )
        ).flat();
        if (controller.signal.aborted) return;
        const next = Object.fromEntries(
          results
            .filter(
              (item) =>
                (readVersion.current.get(item.thread_id) ?? 0) < started,
            )
            .map((item) => [item.thread_id, item.unread]),
        );
        currentCounts.current = next;
        setCounts(next);
      } catch {
        // Leave the previous counts visible until the next refresh.
      } finally {
        loading = false;
      }
    }

    const tick = () => void load();
    tick();
    const timer = window.setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ids]);

  const target = useCallback(function forRow(row: SourceRow): ChatTarget {
    return {
      kind: "request",
      threadId: row.id,
      title: requestChatTitle(row.placement_page_url, requestLabel(row)),
      onRead: (id) => {
        readVersion.current.set(id, Date.now());
        currentCounts.current = { ...currentCounts.current, [id]: 0 };
        setCounts(currentCounts.current);
      },
      nextUnread: () => {
        const list = current.current;
        const index = list.findIndex((item) => item.id === row.id);
        const next = [
          ...list.slice(index + 1),
          ...list.slice(0, Math.max(index, 0)),
        ].find(
          (item) => item.id !== row.id && currentCounts.current[item.id] > 0,
        );
        return next ? forRow(next) : undefined;
      },
    };
  }, []);

  return { counts, openRequestChat: (row: SourceRow) => open(target(row)) };
}
