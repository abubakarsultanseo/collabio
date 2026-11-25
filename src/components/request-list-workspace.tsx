"use client";
import { useToast } from "@/components/app/toast";
import Link from "next/link";
import dynamic from "next/dynamic";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { StatusBadge, formatStatus } from "@/components/status-badge";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRequestChat } from "@/components/chat/use-request-chat";
import {
  Eye,
  StickyNote,
  FileSpreadsheet,
  Inbox,
  MessageSquare,
  Ellipsis,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  isDocumentRequest,
  requestLabel,
  requestTypes,
} from "@/lib/request-content";
import { EmptyState } from "@/components/app/empty-state";
import {
  InlineStatus,
  placementDomain,
} from "@/components/requests/request-tools";
import {
  requestStatuses,
  requestViews,
  matchesRequestView,
  type RequestView,
} from "@/lib/request-statuses";
import {
  ExchangeBalance,
  useExchangeOverview,
  refreshExchangeOverview,
} from "@/components/requests/exchange-controls";
import { RequestRowSummary } from "@/components/requests/request-row-summary";
import { cn } from "@/lib/utils";

import {
  requestCacheDuration,
  saveRequestPage,
  useRequestListCache,
  type Cursor,
  type InitialRequestList,
  type RequestRow as Row,
  type Workspace,
} from "@/components/requests/request-list-cache";

type Filters = {
  type: string;
  direction: string;
  partnershipId: string;
  createdFrom: string;
  createdTo: string;
};
const emptyFilters: Filters = {
  type: "",
  direction: "",
  partnershipId: "",
  createdFrom: "",
  createdTo: "",
};
type Preset = {
  name: string;
  search: string;
  status: string;
  filters: Filters;
};

function isPreset(value: unknown): value is Preset {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Preset>;
  return (
    typeof item.name === "string" &&
    typeof item.search === "string" &&
    typeof item.status === "string" &&
    !!item.filters &&
    Object.keys(emptyFilters).every(
      (key) => typeof item.filters?.[key as keyof Filters] === "string",
    )
  );
}

function displayDate(value: string) {
  return new Date(value).toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
}

const RequestDetails = dynamic(
  () => import("@/components/requests/request-details-panel"),
  {
    loading: () => (
      <p
        role="status"
        className="fixed bottom-4 right-4 z-50 rounded-lg bg-[var(--card)] p-4 text-sm shadow-lg"
      >
        Opening request…
      </p>
    ),
  },
);
const EditRequestForm = dynamic(
  () => import("@/components/requests/edit-request-form"),
  {
    loading: () => (
      <p role="status" className="text-sm text-[var(--muted)]">
        Loading editor…
      </p>
    ),
  },
);

export default function RequestListWorkspace({
  scope,
  title,
  initialRequestId,
  initial,
}: {
  scope: "inbox" | "sent" | "pending" | "overdue";
  title: string;
  initialRequestId?: string;
  initial?: InitialRequestList;
}) {
  const notify = useToast();
  const cache = useRequestListCache();
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [rows, setRows] = useState<Row[]>(initial?.page?.requests ?? []);
  const [workspaces, setWorkspaces] = useState<Workspace[]>(
    cache.workspaces ?? [],
  );
  const [workspacesError, setWorkspacesError] = useState(false);
  const [workspaceAttempt, setWorkspaceAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const directionList = scope === "inbox" || scope === "sent";
  const [view, setView] = useState<RequestView>("all");
  const [filters, setFilters] = useState<Filters>({
    ...emptyFilters,
    partnershipId: initial?.partnershipId ?? "",
  });
  const exchange = useExchangeOverview(
    directionList ? filters.partnershipId : "",
  );
  const params = new URLSearchParams({
    scope,
    view,
    paged: "1",
    fields: "summary",
  });
  if (search.trim()) params.set("q", search.trim());
  if (status) params.set("status", status);
  if (filters.type) params.set("type", filters.type);
  if (filters.direction) params.set("direction", filters.direction);
  if (filters.partnershipId) params.set("partnershipId", filters.partnershipId);
  if (filters.createdFrom) params.set("createdFrom", filters.createdFrom);
  if (filters.createdTo) params.set("createdTo", filters.createdTo);
  const queryKey = params.toString();
  const [loadedKey, setLoadedKey] = useState(initial?.page ? queryKey : "");
  const matchingRows = (
    loadedKey === queryKey
      ? rows
      : (cache.pages.get(queryKey)?.page.requests ?? [])
  ).filter(
    (row) =>
      (!filters.partnershipId ||
        row.partnership_id === filters.partnershipId) &&
      (!status || row.status === status) &&
      matchesRequestView(row.status, scope === "pending" ? "pending" : view),
  );
  const { counts: unreadChats, openRequestChat } = useRequestChat(matchingRows);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [details, setDetails] = useState<{
    row: Row;
    mode: "view" | "note";
  } | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [presetOpen, setPresetOpen] = useState(false);
  const [loading, setLoading] = useState(!initial);
  const [loadError, setLoadError] = useState(initial?.error ?? "");
  const [paging, setPaging] = useState(false);
  const [nextPage, setNextPage] = useState<Cursor | null>(
    initial?.page?.nextPage ?? null,
  );
  const listRequest = useRef<AbortController | null>(null);
  const detailRequest = useRef<AbortController | null>(null);
  const [opening, setOpening] = useState<{
    row: Row;
    mode: "view" | "note" | "edit";
    error?: string;
  } | null>(null);
  const firstList = useRef(initial);
  const mutation = useRef(false);
  const marking = useRef(new Set<string>());
  const recentEdits = useRef(new Map<string, Partial<Row> | null>());
  const previousSearch = useRef("");
  const presetKey = `collabio-request-filters:${scope}`;

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(presetKey) ?? "[]",
      );
      setPresets(Array.isArray(saved) ? saved.filter(isPreset) : []);
    } catch {
      setPresets([]);
    }
  }, [presetKey]);

  function savePresets(next: Preset[]) {
    try {
      localStorage.setItem(presetKey, JSON.stringify(next));
      setPresets(next);
    } catch {
      notify("Could not save filters on this device.", "error");
    }
  }

  function reset() {
    setSearch("");
    setStatus("");
    setView("all");
    setFilters(emptyFilters);
  }
  useEffect(() => {
    if (!directionList && !advanced) return;
    function fetchWorkspaces() {
      if (cache.workspaces) {
        setWorkspaces(cache.workspaces);
        return;
      }
      setWorkspacesError(false);
      cache.workspaceRequest ??= fetch("/api/partnerships", {
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Could not load partners.");
          const data = await response.json();
          cache.workspaces = data.partnerships ?? [];
          return cache.workspaces!;
        })
        .finally(() => {
          cache.workspaceRequest = undefined;
        });
      void cache.workspaceRequest.then(setWorkspaces, () =>
        setWorkspacesError(true),
      );
    }
    fetchWorkspaces();
  }, [advanced, cache, directionList, workspaceAttempt]);

  const load = useCallback(
    async (cursor?: Cursor, force = false) => {
      listRequest.current?.abort();
      const controller = new AbortController();
      listRequest.current = controller;
      setLoadError("");
      if (cursor) setPaging(true);
      else {
        setPaging(false);
        const saved = cache.pages.get(queryKey);
        if (saved) {
          setRows(saved.page.requests);
          setNextPage(saved.page.nextPage);
          setLoadedKey(queryKey);
          if (!force && Date.now() - saved.at < requestCacheDuration) {
            setLoading(false);
            return;
          }
        } else {
          setNextPage(null);
        }
        setLoading(true);
      }

      if (!cursor) recentEdits.current.clear();
      const requestParams = new URLSearchParams(queryKey);
      if (cursor) {
        requestParams.set("beforeAt", cursor.at);
        requestParams.set("beforeId", cursor.id);
      }
      try {
        const response = await fetch(`/api/requests?${requestParams}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          if ([401, 403].includes(response.status)) {
            cache.pages.clear();
            setRows([]);
            setNextPage(null);
          }
          throw new Error(data.error ?? "Could not load requests.");
        }
        const patched = ((data.requests ?? []) as Row[]).flatMap((row) => {
          const edit = recentEdits.current.get(row.id);
          return edit === null ? [] : [{ ...row, ...edit }];
        });
        const nextPage = data.nextPage ?? null;
        if (cursor) {
          setRows((current) => {
            const ids = new Set(current.map((row) => row.id));
            return [...current, ...patched.filter((row) => !ids.has(row.id))];
          });
        } else {
          setRows(patched);
          saveRequestPage(cache, queryKey, { requests: patched, nextPage });
        }
        setLoadedKey(queryKey);
        setNextPage(nextPage);
      } catch (caught) {
        if (!controller.signal.aborted)
          setLoadError(
            caught instanceof Error
              ? caught.message
              : "Could not load requests.",
          );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setPaging(false);
        }
      }
    },
    [cache, queryKey],
  );

  useEffect(() => {
    const seeded = firstList.current;
    firstList.current = undefined;
    if (
      seeded?.page &&
      seeded.at >= cache.invalidatedAt &&
      !cache.pages.has(queryKey)
    )
      cache.pages.set(queryKey, { page: seeded.page, at: seeded.at });
    const changedSearch = previousSearch.current !== search;
    previousSearch.current = search;
    if (seeded?.error && !cache.pages.has(queryKey)) return;
    if (!changedSearch) void load();
    const timer = changedSearch
      ? window.setTimeout(() => void load(), 200)
      : undefined;
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      listRequest.current?.abort();
    };
  }, [cache, load, queryKey, search]);

  useEffect(() => () => detailRequest.current?.abort(), []);

  const invalidateLists = useCallback(() => {
    cache.pages.clear();
    cache.invalidatedAt = Date.now();
  }, [cache]);

  const mergeRow = useCallback(
    (patch: Partial<Row> & { id: string }) => {
      invalidateLists();
      recentEdits.current.set(patch.id, {
        ...recentEdits.current.get(patch.id),
        ...patch,
      });
      setRows((current) =>
        current.map((item) =>
          item.id === patch.id ? { ...item, ...patch } : item,
        ),
      );
      setEditing((current) =>
        current?.id === patch.id ? { ...current, ...patch } : current,
      );
    },
    [invalidateLists],
  );

  useEffect(() => {
    function onUpdate(event: Event) {
      mergeRow((event as CustomEvent<{ id: string; status: string }>).detail);
    }
    window.addEventListener("collabio:request-updated", onUpdate);
    return () =>
      window.removeEventListener("collabio:request-updated", onUpdate);
  }, [mergeRow]);

  const markSeen = useCallback(
    async (row: Row) => {
      if (row.import_key || row.first_viewed_at || marking.current.has(row.id))
        return;
      marking.current.add(row.id);
      try {
        const response = await fetch("/api/requests", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: row.id, markSeen: true }),
        });
        if (response.ok) {
          const data = await response.json();
          if (data.request) {
            // Only apply the automatic transition if the user has not changed status.
            const { status, ...viewed } = data.request;
            mergeRow(viewed);
            if (status === "seen") {
              const transition = (item: Row) =>
                item.id === row.id && item.status === "new_request"
                  ? { ...item, status }
                  : item;
              setRows((current) => current.map(transition));
              setEditing((current) =>
                current ? transition(current) : current,
              );
            }
          }
        }
      } finally {
        marking.current.delete(row.id);
      }
    },
    [mergeRow],
  );

  useEffect(() => {
    if (!initialRequestId) return;
    const controller = new AbortController();
    async function loadRequest() {
      const params = new URLSearchParams({ requestId: initialRequestId! });
      try {
        const response = await fetch(`/api/requests?${params}`, {
          signal: controller.signal,
        });
        const result = await response.json();
        if (controller.signal.aborted) return;
        const row = result.requests?.[0] as Row | undefined;
        if (!response.ok || !row)
          throw new Error("This request is unavailable in your workspace.");
        setDetails({ row, mode: "view" });
        if (row.isReceiver) void markSeen(row).catch(() => {});
      } catch (error) {
        if (!controller.signal.aborted)
          notify(
            error instanceof Error ? error.message : "Could not open request.",
            "error",
          );
      }
    }
    void loadRequest();
    return () => controller.abort();
  }, [initialRequestId, markSeen, notify]);

  async function update(
    row: Row,
    body: Record<string, unknown>,
    form?: HTMLFormElement,
  ) {
    if (mutation.current) return false;
    mutation.current = true;
    setBusy(row.id);
    try {
      const response = await fetch("/api/requests", {
        method: "PATCH",
        ...(form
          ? (
              await import("@/components/requests/request-content-fields")
            ).requestFormBody(form, { id: row.id })
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: row.id, ...body }),
            }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not update request.");
      if (data.request) mergeRow(data.request);
      refreshExchangeOverview();
      notify(body.status ? "Status saved." : "Request updated.");
      return true;
    } catch (caught) {
      notify(
        caught instanceof Error ? caught.message : "Could not update request.",
        "error",
      );
      return false;
    } finally {
      setBusy(null);
      mutation.current = false;
    }
  }
  async function remove(row: Row) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(row.id);
    try {
      const response = await fetch("/api/requests", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not delete request.");
      setDeleteTarget(null);
      refreshExchangeOverview();
      notify(`Request #${row.request_code} deleted.`);
      invalidateLists();
      recentEdits.current.set(row.id, null);
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch (caught) {
      notify(
        caught instanceof Error ? caught.message : "Could not delete request.",
        "error",
      );
    } finally {
      setBusy(null);
      mutation.current = false;
    }
  }
  const exportQuery = new URLSearchParams({ scope, view, format: "xlsx" });
  if (status) exportQuery.set("status", status);
  if (search.trim()) exportQuery.set("q", search.trim());
  if (filters.type) exportQuery.set("type", filters.type);
  if (filters.direction) exportQuery.set("direction", filters.direction);
  if (filters.partnershipId)
    exportQuery.set("partnershipId", filters.partnershipId);
  if (filters.createdFrom) exportQuery.set("createdFrom", filters.createdFrom);
  if (filters.createdTo) exportQuery.set("createdTo", filters.createdTo);
  const activeRow = editing;
  const rowAction = "h-auto rounded-md px-2 py-1";
  const overdue = (row: Row) =>
    !["live", "cancelled", "removed", "rejected"].includes(row.status) &&
    (row.was_overdue ||
      row.status === "overdue" ||
      (!row.import_key &&
        new Date(row.deadline_at) < new Date() &&
        !row.first_viewed_at));

  async function openRequest(
    row: Row,
    mode: "view" | "note" | "edit" = "view",
  ) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setOpening({ row, mode });
    try {
      const response = await fetch(
        `/api/requests?${new URLSearchParams({ requestId: row.id })}`,
        {
          cache: "no-store",
          signal: controller.signal,
        },
      );
      const data = await response.json();
      if (controller.signal.aborted) return;
      const full = data.requests?.[0] as Row | undefined;
      if (!response.ok || !full)
        throw new Error(data.error ?? "This request is unavailable.");
      setOpening(null);
      if (mode === "edit" && full.canManage) setEditing(full);
      else if (mode !== "edit") {
        setDetails({ row: full, mode });
        if (mode === "view" && full.isReceiver)
          void markSeen(full).catch(() => {});
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setOpening({
          row,
          mode,
          error:
            error instanceof Error
              ? error.message
              : "Could not open the request.",
        });
    }
  }

  function chatButton(row: Row, className: string) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(rowAction, className)}
        onClick={() => openRequestChat(row)}
      >
        <MessageSquare size={12} aria-hidden /> Chat
        {unreadChats[row.id] > 0 && (
          <span
            className="rounded-full bg-[var(--brand-soft)] px-1.5 text-[var(--brand-dark)]"
            aria-label={`${unreadChats[row.id]} unread messages`}
          >
            {unreadChats[row.id]}
          </span>
        )}
      </Button>
    );
  }

  function rowActions(row: Row) {
    return (
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={rowAction}
          onClick={() => void openRequest(row)}
        >
          <Eye size={12} aria-hidden /> View
        </Button>
        {chatButton(row, "")}
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={rowAction}
              aria-label={`More actions for request #${row.request_code}`}
            >
              <Ellipsis size={16} aria-hidden />
            </Button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content
              align="end"
              sideOffset={4}
              className="z-50 min-w-36 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 text-sm shadow-lg"
            >
              <Menu.Item
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 outline-none data-[highlighted]:bg-[var(--canvas)]"
                onSelect={() => void openRequest(row, "note")}
              >
                <StickyNote size={14} aria-hidden /> Add note
              </Menu.Item>
              {row.canManage && (
                <>
                  <Menu.Item
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 outline-none data-[highlighted]:bg-[var(--canvas)]"
                    disabled={busy !== null}
                    onSelect={() => void openRequest(row, "edit")}
                  >
                    <Pencil size={14} aria-hidden /> Edit
                  </Menu.Item>
                  <Menu.Item
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-[var(--red)] outline-none data-[highlighted]:bg-[var(--danger-bg)]"
                    disabled={busy !== null}
                    onSelect={() => setDeleteTarget(row)}
                  >
                    <Trash2 size={14} aria-hidden /> Delete
                  </Menu.Item>
                </>
              )}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      </div>
    );
  }

  function rowStatus(row: Row) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <InlineStatus
          status={row.status}
          enabled={row.canChangeStatus}
          busy={busy !== null}
          guestPost={row.request_type === "guest_post"}
          liveUrl={row.live_url}
          onSave={(status, reason, liveUrl) =>
            update(row, { status, reason, liveUrl })
          }
        />
        {overdue(row) && row.status !== "overdue" && (
          <span className="ml-1">
            <StatusBadge status="overdue" />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="page-enter mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {directionList ? "Requests" : title}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Search, review, and update requests shared with your partners.
          </p>
        </div>
      </header>

      {directionList && (
        <nav
          aria-label="Request direction"
          className="flex gap-5 border-b border-[var(--border)]"
        >
          {[
            { key: "inbox", label: "Received" },
            { key: "sent", label: "Sent" },
          ].map((tab) => (
            <Link
              key={tab.key}
              href={`/requests/${tab.key}${filters.partnershipId ? `?partner=${filters.partnershipId}` : ""}`}
              aria-current={scope === tab.key ? "page" : undefined}
              className={cn(
                "border-b-2 px-2 pb-2 text-sm font-semibold",
                scope === tab.key
                  ? "border-[var(--brand)] text-[var(--brand-dark)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--text)]",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      )}
      <section className="os-card space-y-3 p-3" aria-label="Request filters">
        <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,12rem)] xl:grid-cols-[minmax(0,1fr)_minmax(8rem,12rem)_auto]">
          <label className="text-sm font-medium">
            Search requests
            <span className="relative mt-1 block">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-3 text-[var(--muted)]"
                aria-hidden
              />
              <Input
                type="search"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Request #, anchor, URL, or notes"
              />
            </span>
          </label>
          {directionList ? (
            <label className="text-sm font-medium">
              Partner
              <Select
                className="mt-1"
                value={filters.partnershipId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    partnershipId: event.target.value,
                  }))
                }
              >
                <option value="">All partners</option>
                {workspaces.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.counterpart_name ?? party.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAdvanced((value) => !value)}
              aria-expanded={advanced}
              aria-controls="advanced-request-filters"
            >
              <SlidersHorizontal size={16} aria-hidden />{" "}
              {advanced ? "Hide filters" : "More filters"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void load(undefined, true)}
            >
              Refresh
            </Button>
          </div>
        </div>
        {workspacesError && (
          <p className="text-sm" role="alert">
            Could not load partners.{" "}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setWorkspaceAttempt((value) => value + 1)}
            >
              Retry
            </Button>
          </p>
        )}
        {directionList && (
          <div
            className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3"
            role="group"
            aria-label="Request status groups"
          >
            {requestViews.map((option) => (
              <Button
                type="button"
                key={option.value}
                size="sm"
                aria-pressed={view === option.value}
                variant={view === option.value ? "default" : "outline"}
                onClick={() => {
                  setView(option.value);
                  setStatus("");
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
        )}
        {advanced && (
          <div
            id="advanced-request-filters"
            className="grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-2 xl:grid-cols-5"
          >
            <label className="text-sm font-medium">
              Status
              <Select
                className="mt-1 capitalize"
                value={status}
                onChange={(event) => {
                  const value = event.target.value;
                  setStatus(value);
                  if (directionList && value === "cancelled")
                    setView("cancelled");
                  else if (
                    value &&
                    ((view === "pending" && value === "live") ||
                      (view === "live" && value !== "live") ||
                      view === "cancelled")
                  )
                    setView("all");
                }}
              >
                <option value="">All statuses</option>
                {requestStatuses
                  .filter((item) => directionList || item !== "cancelled")
                  .map((item) => (
                    <option key={item} value={item}>
                      {formatStatus(item)}
                    </option>
                  ))}
              </Select>
            </label>
            {!directionList && (
              <label className="text-sm">
                Workspace
                <Select
                  className="mt-1"
                  value={filters.partnershipId}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      partnershipId: event.target.value,
                    })
                  }
                >
                  <option value="">All workspaces</option>
                  {workspaces.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <label className="text-sm">
              Request type
              <Select
                className="mt-1 capitalize"
                value={filters.type}
                onChange={(event) =>
                  setFilters({ ...filters, type: event.target.value })
                }
              >
                <option value="">All types</option>
                {requestTypes.map((type) => (
                  <option value={type} key={type}>
                    {formatStatus(type)}
                  </option>
                ))}
              </Select>
            </label>
            {!directionList && (
              <label className="text-sm">
                Direction
                <Select
                  className="mt-1"
                  value={filters.direction}
                  onChange={(event) =>
                    setFilters({ ...filters, direction: event.target.value })
                  }
                >
                  <option value="">Both directions</option>
                  <option value="sent">Sent by me</option>
                  <option value="received">Received by me</option>
                </Select>
              </label>
            )}
            <label className="text-sm">
              Created from
              <Input
                className="mt-1"
                type="date"
                value={filters.createdFrom}
                onChange={(event) =>
                  setFilters({ ...filters, createdFrom: event.target.value })
                }
              />
            </label>
            <label className="text-sm">
              Created to
              <Input
                className="mt-1"
                type="date"
                value={filters.createdTo}
                onChange={(event) =>
                  setFilters({ ...filters, createdTo: event.target.value })
                }
              />
            </label>
            <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-3 sm:col-span-2 xl:col-span-5">
              <Button type="button" variant="ghost" onClick={reset}>
                Reset filters
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPresetOpen(true)}
              >
                Save filter
              </Button>
              <a
                href={`/api/export?${exportQuery}`}
                className={buttonVariants({ variant: "secondary" })}
              >
                <FileSpreadsheet size={16} aria-hidden /> Export Excel
              </a>
            </div>
          </div>
        )}
        {advanced && presets.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Saved filters">
            {presets.map((preset) => (
              <li
                key={preset.name}
                className="flex items-center gap-1 rounded-full bg-[var(--brand-soft)] px-2 text-[var(--brand-dark)]"
              >
                <button
                  type="button"
                  className="rounded-full px-1 py-1 text-xs font-medium"
                  onClick={() => {
                    setSearch(preset.search);
                    setStatus(preset.status);
                    setView(
                      directionList && preset.status === "cancelled"
                        ? "cancelled"
                        : "all",
                    );
                    setFilters(preset.filters);
                    setAdvanced(Object.values(preset.filters).some(Boolean));
                  }}
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  className="rounded-full p-1"
                  aria-label={`Remove saved filter ${preset.name}`}
                  onClick={() =>
                    savePresets(
                      presets.filter((item) => item.name !== preset.name),
                    )
                  }
                >
                  <X size={13} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {directionList && filters.partnershipId && (
        <ExchangeBalance
          overview={exchange?.overview}
          error={exchange?.error}
          showExchanges
        />
      )}

      {loadError && (
        <section
          role="alert"
          className="os-card flex items-center justify-between gap-3 p-4 text-sm"
        >
          <span>{loadError}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(undefined, true)}
          >
            Retry
          </Button>
        </section>
      )}
      {loading && matchingRows.length ? (
        <p role="status" className="text-sm text-[var(--muted)]">
          Refreshing requests…
        </p>
      ) : null}
      {(loading || loadedKey !== queryKey) &&
      !matchingRows.length &&
      !loadError ? (
        <p role="status" className="os-card p-5 text-sm text-[var(--muted)]">
          Loading requests…
        </p>
      ) : matchingRows.length === 0 ? (
        loadError ? null : (
          <EmptyState
            icon={Inbox}
            title="No requests match these filters."
            hint="Try another search, status, or date range."
          />
        )
      ) : (
        <section className="space-y-2" aria-label="Request results">
          {view !== "cancelled" && (
            <p className="text-xs text-[var(--muted)]">
              Showing {matchingRows.length} request
              {matchingRows.length === 1 ? "" : "s"}
            </p>
          )}
          <div
            tabIndex={0}
            role="region"
            aria-label="Scrollable request table"
            className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <table className="os-table w-full text-left md:min-w-[890px] text-sm">
              <thead className="hidden text-xs uppercase tracking-wide text-[var(--muted)] md:table-header-group">
                <tr>
                  {["Request", "Partner", "Type", "Status", "Actions"].map(
                    (label) => (
                      <th key={label} scope="col" className="px-4 py-3">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="block divide-y divide-[var(--border)] md:table-row-group">
                {matchingRows.map((row) => {
                  const counterpart =
                    (row.isReceiver ? row.sender : row.receiver)?.full_name ??
                    "Partner";
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "grid grid-cols-[minmax(0,1fr)_auto] md:table-row",
                        overdue(row) && "bg-[var(--danger-bg)]",
                      )}
                    >
                      <td className="col-span-2 min-w-0 px-4 py-3">
                        <RequestRowSummary
                          row={row}
                          className="max-w-[24rem]"
                        />
                        <p className="mt-1 text-xs text-[var(--muted)] md:hidden">
                          {counterpart} · {formatStatus(row.request_type)}
                        </p>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <div className="max-w-32 truncate" title={counterpart}>
                          {counterpart}
                        </div>
                        <div className="whitespace-nowrap text-xs text-[var(--muted)]">
                          {row.import_date_unknown
                            ? "Original date unavailable"
                            : displayDate(row.created_at)}
                        </div>
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 capitalize md:table-cell">
                        {formatStatus(row.request_type)}
                      </td>
                      <td className="min-w-0 pb-3 pl-4 md:px-4 md:py-3">
                        {rowStatus(row)}
                      </td>
                      <td className="pb-3 pr-4 md:px-4 md:py-3">
                        {rowActions(row)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {nextPage && loadedKey === queryKey && (
        <Button
          type="button"
          variant="secondary"
          disabled={paging}
          onClick={() => void load(nextPage)}
        >
          {paging ? "Loading older requests…" : "Load older requests"}
        </Button>
      )}

      <Dialog
        open={presetOpen}
        onOpenChange={(open) => {
          setPresetOpen(open);
          if (!open) setPresetName("");
        }}
      >
        <DialogContent
          title="Save request filter"
          description="Name this filter to reuse it on this device."
        >
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const name = presetName.trim();
              if (!name) return;
              savePresets([
                ...presets.filter((item) => item.name !== name),
                { name, search, status, filters },
              ]);
              setPresetName("");
              setPresetOpen(false);
            }}
          >
            <label className="block text-sm">
              Filter name
              <Input
                className="mt-1"
                maxLength={48}
                required
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
              />
            </label>
            <Button type="submit">Save filter</Button>
          </form>
        </DialogContent>
      </Dialog>

      {opening && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              detailRequest.current?.abort();
              setOpening(null);
            }
          }}
        >
          <DialogContent
            placement="side"
            title={`Request #${opening.row.request_code} · ${placementDomain(opening.row.placement_page_url)}`}
            description={requestLabel(opening.row)}
          >
            {opening.error ? (
              <div role="alert" className="space-y-3 text-sm">
                <p>{opening.error}</p>
                <Button
                  variant="outline"
                  onClick={() => void openRequest(opening.row, opening.mode)}
                >
                  Retry
                </Button>
              </div>
            ) : (
              <p role="status" className="text-sm text-[var(--muted)]">
                Loading request details…
              </p>
            )}
          </DialogContent>
        </Dialog>
      )}
      {activeRow && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        >
          <DialogContent
            title={`Request #${activeRow.request_code}`}
            description={requestLabel(activeRow)}
            placement="side"
            closeDisabled={busy === activeRow.id}
          >
            <div className="mb-4 grid gap-3 text-sm sm:grid-cols-2">
              <a
                href={activeRow.placement_page_url}
                title={activeRow.placement_page_url}
                target="_blank"
                rel="noreferrer"
                className="break-all text-[var(--brand-dark)]"
              >
                {isDocumentRequest(activeRow.request_type)
                  ? "Site ↗"
                  : "Placement page ↗"}
              </a>
              {activeRow.target_link && (
                <a
                  href={activeRow.target_link}
                  title={activeRow.target_link}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-[var(--brand-dark)]"
                >
                  Target link ↗
                </a>
              )}
              <p className="text-[var(--muted)]">
                {activeRow.import_key
                  ? "Historical request · No active review timer"
                  : `Review deadline · ${displayDate(activeRow.deadline_at)}`}
              </p>
            </div>
            <EditRequestForm
              key={activeRow.id}
              row={activeRow}
              onSaveExchange={(dealId) => {
                void update(activeRow, { dealId }).then((ok) => {
                  if (ok) setEditing(null);
                });
              }}
              disabled={busy !== null}
              onSave={(form) => {
                void update(activeRow, {}, form).then((ok) => {
                  if (ok) setEditing(null);
                });
              }}
            />
          </DialogContent>
        </Dialog>
      )}
      {details && (
        <RequestDetails
          key={`${details.row.id}:${details.mode}`}
          mode={details.mode}
          partnerName={
            (details.row.isReceiver ? details.row.sender : details.row.receiver)
              ?.full_name
          }
          row={{
            ...details.row,
            ...(rows.find((row) => row.id === details.row.id) ?? {}),
          }}
          onClose={() => setDetails(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          open
          title={`Delete request #${deleteTarget.request_code}?`}
          description="This permanently removes the request."
          confirmLabel="Delete request"
          busy={busy === deleteTarget.id}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void remove(deleteTarget)}
        />
      )}
    </div>
  );
}
