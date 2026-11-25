"use client";
import { useToast } from "@/components/app/toast";
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
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/app/empty-state";
import {
  InlineStatus,
  placementDomain,
  RequestDetails,
} from "@/components/requests/request-tools";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  request_code: number;
  partnership_id: string;
  sender_id: string;
  receiver_id: string;
  partner_id: string;
  direction: string;
  placement_page_url: string;
  anchor_text: string;
  target_link: string;
  request_type: string;
  instructions: string | null;
  notes: string | null;
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
  sender: { full_name: string; email: string } | null;
  receiver: { full_name: string; email: string } | null;
  workspace: { name: string } | null;
};
type Cursor = { at: string; id: string };
type Workspace = { id: string; name: string };
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
const types = ["guest_post", "link_insertion", "other"];

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

function EditRequestForm({
  row,
  onSave,
  disabled,
}: {
  row: Row;
  onSave: (value: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSave({
          placementPageUrl: String(data.get("placementPageUrl")),
          anchorText: String(data.get("anchorText")),
          targetLink: String(data.get("targetLink")),
          requestType: String(data.get("requestType")),
          instructions: String(data.get("instructions") || ""),
          notes: String(data.get("notes") || ""),
        });
      }}
      className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--canvas)] p-4 md:grid-cols-2"
    >
      <h3 className="font-semibold md:col-span-2">Edit request details</h3>
      <label className="text-xs">
        Placement page
        <Input
          name="placementPageUrl"
          defaultValue={row.placement_page_url}
          className="mt-1"
          type="url"
          required
        />
      </label>
      <label className="text-xs">
        Anchor text
        <Input
          name="anchorText"
          defaultValue={row.anchor_text}
          className="mt-1"
          required
        />
      </label>
      <label className="text-xs">
        Target link
        <Input
          name="targetLink"
          defaultValue={row.target_link}
          className="mt-1"
          type="url"
          required
        />
      </label>
      <label className="text-xs">
        Request type
        <Select
          name="requestType"
          defaultValue={row.request_type}
          className="mt-1"
        >
          <option value="guest_post">Guest post</option>
          <option value="link_insertion">Link insertion</option>
          <option value="other">Other</option>
        </Select>
      </label>
      <label className="text-xs md:col-span-2">
        Instructions
        <Textarea
          name="instructions"
          defaultValue={row.instructions ?? ""}
          className="mt-1"
          rows={3}
        />
      </label>
      <label className="text-xs md:col-span-2">
        Notes
        <Textarea
          name="notes"
          defaultValue={row.notes ?? ""}
          className="mt-1"
          rows={3}
        />
      </label>
      <Button type="submit" disabled={disabled} className="md:col-span-2">
        Save request changes
      </Button>
    </form>
  );
}
export default function RequestListWorkspace({
  scope,
  title,
  initialRequestId,
}: {
  scope: "inbox" | "sent" | "pending" | "overdue";
  title: string;
  initialRequestId?: string;
}) {
  const notify = useToast();
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const matchingRows = rows.filter(
    (row) =>
      (!status || row.status === status) &&
      (scope !== "pending" ||
        !["live", "rejected", "cancelled"].includes(row.status)),
  );
  const { counts: unreadChats, openRequestChat } = useRequestChat(matchingRows);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
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
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [nextPage, setNextPage] = useState<Cursor | null>(null);
  const latestLoad = useRef(0);
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
    setFilters(emptyFilters);
  }
  useEffect(() => {
    if (!advanced && !filters.partnershipId) return;
    fetch("/api/partnerships", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setWorkspaces(data.partnerships ?? []))
      .catch(() => {});
  }, [advanced, filters.partnershipId]);
  const load = useCallback(
    async (cursor?: Cursor) => {
      const loadId = ++latestLoad.current;
      if (cursor) setPaging(true);
      else {
        setPaging(false);
        setNextPage(null);
        recentEdits.current.clear();
      }
      try {
        const params = new URLSearchParams({ scope, paged: "1" });
        if (cursor) {
          params.set("beforeAt", cursor.at);
          params.set("beforeId", cursor.id);
        }
        if (search.trim()) params.set("q", search.trim());
        if (status) params.set("status", status);
        if (filters.type) params.set("type", filters.type);
        if (filters.direction) params.set("direction", filters.direction);
        if (filters.partnershipId)
          params.set("partnershipId", filters.partnershipId);
        if (filters.createdFrom) params.set("createdFrom", filters.createdFrom);
        if (filters.createdTo) params.set("createdTo", filters.createdTo);
        const response = await fetch(`/api/requests?${params}`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Could not load requests.");
        if (loadId === latestLoad.current) {
          const patched = ((data.requests ?? []) as Row[]).flatMap((row) => {
            const edit = recentEdits.current.get(row.id);
            return edit === null ? [] : [{ ...row, ...edit }];
          });
          setRows((current) => {
            if (!cursor) return patched;
            const ids = new Set(current.map((row) => row.id));
            return [...current, ...patched.filter((row) => !ids.has(row.id))];
          });
          setNextPage(data.nextPage ?? null);
        }
      } catch (caught) {
        if (loadId !== latestLoad.current) return;
        notify(
          caught instanceof Error ? caught.message : "Could not load requests.",
          "error",
        );
      } finally {
        if (loadId === latestLoad.current) {
          setLoading(false);
          setPaging(false);
        }
      }
    },
    [scope, search, status, filters, notify],
  );
  useEffect(() => {
    const changedSearch = previousSearch.current !== search;
    previousSearch.current = search;
    if (!changedSearch) {
      void load();
      return;
    }
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  const mergeRow = useCallback((patch: Partial<Row> & { id: string }) => {
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
  }, []);

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

  async function update(row: Row, body: Record<string, unknown>) {
    if (mutation.current) return false;
    mutation.current = true;
    setBusy(row.id);
    try {
      const response = await fetch("/api/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, ...body }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not update request.");
      if (data.request) mergeRow(data.request);
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
      notify(`Request #${row.request_code} deleted.`);
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
  const exportQuery = new URLSearchParams({ scope, format: "xlsx" });
  if (status) exportQuery.set("status", status);
  if (search.trim()) exportQuery.set("q", search.trim());
  if (filters.type) exportQuery.set("type", filters.type);
  if (filters.direction) exportQuery.set("direction", filters.direction);
  if (filters.partnershipId)
    exportQuery.set("partnershipId", filters.partnershipId);
  if (filters.createdFrom) exportQuery.set("createdFrom", filters.createdFrom);
  if (filters.createdTo) exportQuery.set("createdTo", filters.createdTo);
  const activeRow =
    editing && (rows.find((row) => row.id === editing.id) ?? editing);
  const rowAction = "h-auto rounded-md px-2 py-1";
  const overdue = (row: Row) =>
    row.was_overdue ||
    row.status === "overdue" ||
    (!row.import_key &&
      new Date(row.deadline_at) < new Date() &&
      !row.first_viewed_at);

  function openRequest(row: Row) {
    setDetails({ row, mode: "view" });
    if (row.isReceiver && !row.first_viewed_at)
      void markSeen(row).catch(() => {});
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
          onClick={() => openRequest(row)}
        >
          <Eye size={12} aria-hidden /> View
        </Button>
        {chatButton(row, "")}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={rowAction}
          onClick={() => setDetails({ row, mode: "note" })}
        >
          <StickyNote size={12} aria-hidden /> Add note
        </Button>
        {row.canManage && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={rowAction}
              disabled={busy !== null}
              onClick={() => setEditing(row)}
            >
              <Pencil size={12} aria-hidden /> Edit
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(rowAction, "border-[var(--red)] text-[var(--red)]")}
              disabled={busy !== null}
              onClick={() => setDeleteTarget(row)}
            >
              <Trash2 size={12} aria-hidden /> Delete
            </Button>
          </>
        )}
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
          onSave={(status, reason) => update(row, { status, reason })}
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
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Search, review, and update requests shared with your partners.
          </p>
        </div>
        <a
          href={`/api/export?${exportQuery}`}
          className={buttonVariants({ variant: "secondary" })}
        >
          <FileSpreadsheet size={17} aria-hidden /> Export Excel
        </a>
      </header>

      <section className="os-card space-y-4 p-4" aria-label="Request filters">
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
          <label className="text-sm font-medium">
            Status
            <Select
              className="mt-1 capitalize"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {formatStatus(item)}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAdvanced((value) => !value)}
              aria-expanded={advanced}
              aria-controls="advanced-request-filters"
            >
              <SlidersHorizontal size={16} aria-hidden />{" "}
              {advanced ? "Hide filters" : "Advanced filters"}
            </Button>
            <Button type="button" variant="ghost" onClick={reset}>
              Reset
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPresetOpen(true)}
            >
              Save filter
            </Button>
          </div>
        </div>
        {advanced && (
          <div
            id="advanced-request-filters"
            className="grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-2 xl:grid-cols-5"
          >
            <label className="text-sm">
              Workspace
              <Select
                className="mt-1"
                value={filters.partnershipId}
                onChange={(event) =>
                  setFilters({ ...filters, partnershipId: event.target.value })
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
                {types.map((type) => (
                  <option value={type} key={type}>
                    {formatStatus(type)}
                  </option>
                ))}
              </Select>
            </label>
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
          </div>
        )}
        {presets.length > 0 && (
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

      {loading ? (
        <p role="status" className="os-card p-5 text-sm text-[var(--muted)]">
          Loading requests…
        </p>
      ) : matchingRows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No requests match these filters."
          hint="Try another search, status, or date range."
        />
      ) : (
        <section className="space-y-2" aria-label="Request results">
          <p className="text-xs text-[var(--muted)]">
            Showing {matchingRows.length} request
            {matchingRows.length === 1 ? "" : "s"}
          </p>
          <div
            tabIndex={0}
            role="region"
            aria-label="Scrollable request table"
            className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <table className="os-table w-full text-left md:min-w-[890px] text-sm">
              <thead className="text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  {["Request", "Partner", "Type", "Status", "Actions"].map(
                    (label) => (
                      <th
                        key={label}
                        scope="col"
                        className={cn(
                          "px-4 py-3",
                          label !== "Request" && "hidden md:table-cell",
                        )}
                      >
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {matchingRows.map((row) => {
                  const counterpart =
                    (scope === "sent" ? row.receiver : row.sender)?.full_name ??
                    "Partner";
                  return (
                    <tr
                      key={row.id}
                      className={
                        overdue(row) ? "bg-[var(--danger-bg)]" : undefined
                      }
                    >
                      <td className="px-4 py-3">
                        <div
                          className="max-w-60 truncate font-semibold"
                          title={placementDomain(row.placement_page_url)}
                        >
                          #{row.request_code} ·{" "}
                          {placementDomain(row.placement_page_url)}
                        </div>
                        <div
                          className="max-w-60 truncate text-xs text-[var(--muted)]"
                          title={row.anchor_text}
                        >
                          {row.anchor_text}
                        </div>
                        <div className="mt-3 space-y-2 md:hidden">
                          <p className="text-xs text-[var(--muted)]">
                            {counterpart} · {formatStatus(row.request_type)}
                          </p>
                          {rowStatus(row)}
                          {rowActions(row)}
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <div className="max-w-32 truncate" title={counterpart}>
                          {counterpart}
                        </div>
                        <div className="whitespace-nowrap text-xs text-[var(--muted)]">
                          {displayDate(row.created_at)}
                        </div>
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 capitalize md:table-cell">
                        {formatStatus(row.request_type)}
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        {rowStatus(row)}
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
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

      {nextPage && (
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

      {activeRow && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        >
          <DialogContent
            title={`Request #${activeRow.request_code}`}
            description={activeRow.anchor_text}
            className="max-w-2xl"
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
                Placement page ↗
              </a>
              <a
                href={activeRow.target_link}
                title={activeRow.target_link}
                target="_blank"
                rel="noreferrer"
                className="break-all text-[var(--brand-dark)]"
              >
                Target link ↗
              </a>
              <p className="text-[var(--muted)]">
                {activeRow.import_key
                  ? "Historical request · No active review timer"
                  : `Review deadline · ${displayDate(activeRow.deadline_at)}`}
              </p>
            </div>
            <EditRequestForm
              key={activeRow.id}
              row={activeRow}
              disabled={busy !== null}
              onSave={(changes) => void update(activeRow, changes)}
            />
          </DialogContent>
        </Dialog>
      )}
      {details && (
        <RequestDetails
          key={`${details.row.id}:${details.mode}`}
          mode={details.mode}
          row={rows.find((row) => row.id === details.row.id) ?? details.row}
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
