"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import type { RequestContent } from "@/lib/request-content";

export type RequestRow = RequestContent & {
  id: string;
  request_code: number;
  partnership_id: string;
  deal_id?: string | null;
  sender_id: string;
  receiver_id: string;
  partner_id: string;
  notes?: string | null;
  status: string;
  canManage?: boolean;
  canChangeStatus?: boolean;
  rejection_reason?: string | null;
  first_viewed_at: string | null;
  deadline_at: string;
  was_overdue: boolean;
  import_key?: string | null;
  isReceiver?: boolean;
  created_at: string;
  sender: { full_name: string } | null;
  receiver: { full_name: string } | null;
};

export type Cursor = { at: string; id: string };
export type RequestPage = { requests: RequestRow[]; nextPage: Cursor | null };
export type InitialRequestList = {
  page?: RequestPage;
  error?: string;
  at: number;
  partnershipId?: string;
};
export type Workspace = { id: string; name: string; counterpart_name?: string };

function createCache() {
  return {
    pages: new Map<string, { page: RequestPage; at: number }>(),
    workspaces: undefined as Workspace[] | undefined,
    workspaceRequest: undefined as Promise<Workspace[]> | undefined,
    invalidatedAt: 0,
  };
}

const RequestCacheContext = createContext<ReturnType<
  typeof createCache
> | null>(null);
export const requestCacheDuration = 30_000;

export function RequestListProvider({ children }: { children: ReactNode }) {
  const cache = useRef(createCache()).current;
  return (
    <RequestCacheContext.Provider value={cache}>
      {children}
    </RequestCacheContext.Provider>
  );
}

export function useRequestListCache() {
  const cache = useContext(RequestCacheContext);
  const fallback = useRef(createCache());
  return cache ?? fallback.current;
}

export function saveRequestPage(
  cache: ReturnType<typeof createCache>,
  key: string,
  page: RequestPage,
) {
  cache.pages.delete(key);
  cache.pages.set(key, { page, at: Date.now() });
  if (cache.pages.size > 20) {
    const first = cache.pages.keys().next().value;
    if (first) cache.pages.delete(first);
  }
}
