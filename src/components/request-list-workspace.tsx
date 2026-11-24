"use client";
import { useToast } from "@/components/app/toast";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { StatusBadge, formatStatus } from "@/components/status-badge";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
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
  first_viewed_at: string | null;
  deadline_at: string;
  was_overdue: boolean;
  created_at: string;
  sender: { full_name: string; email: string } | null;
  receiver: { full_name: string; email: string } | null;
  workspace: { name: string } | null;
};
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
}: {
  scope: "inbox" | "sent" | "pending" | "overdue";
  title: string;
}) {
  const notify = useToast();
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [pendingStatus, setPendingStatus] = useState<{
    id: string;
    status: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; text: string } | null>(
    null,
  );
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [presetOpen, setPresetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const latestLoad = useRef(0);
  const mutation = useRef(false);
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
    fetch("/api/partnerships", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setWorkspaces(data.partnerships ?? []))
      .catch(() => {});
  }, []);
  const load = useCallback(async () => {
    const loadId = ++latestLoad.current;
    try {
      const params = new URLSearchParams({ scope });
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
      if (loadId === latestLoad.current) setRows(data.requests ?? []);
    } catch (caught) {
      if (loadId !== latestLoad.current) return;
      notify(
        caught instanceof Error ? caught.message : "Could not load requests.",
        "error",
      );
    } finally {
      if (loadId === latestLoad.current) setLoading(false);
    }
  }, [scope, search, status, filters, notify]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function update(row: Row, body: Record<string, unknown>) {
    if (mutation.current) return;
    mutation.current = true;
    const nextStatus = typeof body.status === "string" ? body.status : null;
    if (nextStatus) {
      setPendingStatus({ id: row.id, status: nextStatus });
      setFeedback({ id: row.id, text: "Saving…" });
    }
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
      if (nextStatus) {
        setRows((current) =>
          current.map((item) =>
            item.id === row.id ? { ...item, status: nextStatus } : item,
          ),
        );
      }
      await load();
      if (nextStatus) setFeedback({ id: row.id, text: "Saved ✓" });
      else if (!body.markSeen) notify("Request updated.");
    } catch (caught) {
      if (nextStatus) setFeedback({ id: row.id, text: "Save failed" });
      notify(
        caught instanceof Error ? caught.message : "Could not update request.",
        "error",
      );
    } finally {
      setPendingStatus(null);
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
      await load();
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
    (new Date(row.deadline_at) < new Date() && !row.first_viewed_at);

  function openRequest(row: Row) {
    setEditing(row);
    if (scope === "inbox" && !row.first_viewed_at)
      void update(row, { markSeen: true });
  }

  function statusControls(row: Row) {
    const current =
      pendingStatus?.id === row.id ? pendingStatus.status : row.status;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {["reviewing", "accepted", "hold"].map((value) => (
            <Button
              key={value}
              type="button"
              variant="outline"
              size="sm"
              disabled={busy !== null || value === current}
              onClick={() => void update(row, { status: value })}
              className={cn(
                rowAction,
                "capitalize",
                value === "accepted"
                  ? "bg-[var(--success-bg)] text-[var(--green)]"
                  : value === "hold"
                    ? "bg-[var(--warning-bg)] text-[var(--amber)]"
                    : "bg-[var(--info-bg)] text-[var(--brand-dark)]",
              )}
            >
              {formatStatus(value)}
            </Button>
          ))}
        </div>
        <Select
          aria-label={`Status for request ${row.request_code}`}
          className="h-8 min-w-36 text-xs capitalize"
          value={current}
          disabled={busy !== null}
          onChange={(event) => void update(row, { status: event.target.value })}
        >
          {statuses.map((value) => (
            <option key={value} value={value}>
              {formatStatus(value)}
            </option>
          ))}
        </Select>
        <p role="status" className="min-h-4 text-xs text-[var(--muted)]">
          {feedback?.id === row.id ? feedback.text : ""}
        </p>
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
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No requests match these filters."
          hint="Try another search, status, or date range."
        />
      ) : (
        <section className="space-y-2" aria-label="Request results">
          <p className="text-xs text-[var(--muted)]">
            Showing {rows.length} request{rows.length === 1 ? "" : "s"}
          </p>
          <div
            tabIndex={0}
            role="region"
            aria-label="Scrollable request table"
            className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <table className="os-table w-full min-w-[890px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-[var(--muted)]">
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
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((row) => {
                  const counterpart =
                    (scope === "sent" ? row.receiver : row.sender)?.full_name ??
                    "Partner";
                  const current =
                    pendingStatus?.id === row.id
                      ? pendingStatus.status
                      : row.status;
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
                          title={row.anchor_text}
                        >
                          #{row.request_code} · {row.anchor_text}
                        </div>
                        <div
                          className="max-w-60 truncate text-xs text-[var(--muted)]"
                          title={row.workspace?.name}
                        >
                          {row.workspace?.name ?? "Workspace"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-32 truncate" title={counterpart}>
                          {counterpart}
                        </div>
                        <div className="whitespace-nowrap text-xs text-[var(--muted)]">
                          {displayDate(row.created_at)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 capitalize">
                        {formatStatus(row.request_type)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={current} />
                        {overdue(row) && current !== "overdue" && (
                          <span className="ml-1">
                            <StatusBadge status="overdue" />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 whitespace-nowrap">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={rowAction}
                            onClick={() => openRequest(row)}
                            disabled={busy !== null}
                          >
                            <Pencil size={12} aria-hidden /> Edit
                          </Button>
                          <Link
                            href={`/messages?request=${row.id}`}
                            className={cn(
                              buttonVariants({
                                variant: "outline",
                                size: "sm",
                              }),
                              rowAction,
                            )}
                          >
                            <MessageSquare size={12} aria-hidden /> Open
                            discussion
                          </Link>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy !== null}
                            className={cn(
                              rowAction,
                              "border-[var(--red)] text-[var(--red)]",
                            )}
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 size={12} aria-hidden /> Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
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
                Review deadline · {displayDate(activeRow.deadline_at)}
              </p>
              {statusControls(activeRow)}
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
