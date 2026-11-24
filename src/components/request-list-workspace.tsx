"use client";
import { useToast } from "@/components/app/toast";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { StatusBadge, formatStatus } from "@/components/status-badge";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileSpreadsheet, Search, SlidersHorizontal } from "lucide-react";

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
function EditRequestForm({
  row,
  onSave,
}: {
  row: Row;
  onSave: (value: Record<string, unknown>) => void;
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
      className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-2"
    >
      <h3 className="font-semibold md:col-span-2">Edit request details</h3>
      <label className="text-xs">
        Placement page
        <input
          name="placementPageUrl"
          defaultValue={row.placement_page_url}
          className="field mt-1"
          type="url"
          required
        />
      </label>
      <label className="text-xs">
        Anchor text
        <input
          name="anchorText"
          defaultValue={row.anchor_text}
          className="field mt-1"
          required
        />
      </label>
      <label className="text-xs">
        Target link
        <input
          name="targetLink"
          defaultValue={row.target_link}
          className="field mt-1"
          type="url"
          required
        />
      </label>
      <label className="text-xs">
        Request type
        <select
          name="requestType"
          defaultValue={row.request_type}
          className="field mt-1"
        >
          <option value="guest_post">Guest post</option>
          <option value="link_insertion">Link insertion</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="text-xs md:col-span-2">
        Instructions
        <textarea
          name="instructions"
          defaultValue={row.instructions ?? ""}
          className="field mt-1"
          rows={3}
        />
      </label>
      <label className="text-xs md:col-span-2">
        Notes
        <textarea
          name="notes"
          defaultValue={row.notes ?? ""}
          className="field mt-1"
          rows={3}
        />
      </label>
      <button className="primary md:col-span-2">Save request changes</button>
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
  const [filters, setFilters] = useState<Filters>({
    type: "",
    direction: "",
    partnershipId: "",
    createdFrom: "",
    createdTo: "",
  });
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/partnerships", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setWorkspaces(data.partnerships ?? []))
      .catch(() => {});
  }, []);
  const load = useCallback(async () => {
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
      setRows(data.requests ?? []);
    } catch (caught) {
      notify(
        caught instanceof Error ? caught.message : "Could not load requests.",
        "error",
      );
    }
  }, [scope, search, status, filters, notify]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function update(row: Row, body: Record<string, unknown>) {
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
      await load();
    } catch (caught) {
      notify(
        caught instanceof Error ? caught.message : "Could not update request.",
        "error",
      );
    } finally {
      setBusy(null);
    }
  }
  async function remove(row: Row) {
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
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-5 md:p-8 lg:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-700">
            Collaboration requests
          </p>
          <h1 className="mt-2 text-3xl font-bold">{title}</h1>
          <p className="muted mt-2">
            Search, review, and update requests shared with your partners.
          </p>
        </div>
        <a
          href={`/api/export?${exportQuery}`}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <FileSpreadsheet size={17} /> Export Excel
        </a>
      </header>

      <section className="panel space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
          <label className="text-sm font-medium">
            Search requests
            <div className="relative mt-1">
              <Search
                size={16}
                className="absolute left-3 top-3 text-slate-400"
              />
              <input
                className="field pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Request #, anchor, URL, or notes"
              />
            </div>
          </label>
          <label className="text-sm font-medium">
            Status
            <select
              className="field mt-1"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {formatStatus(item)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setAdvanced(!advanced)}
            className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium ${advanced ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-700"}`}
          >
            <SlidersHorizontal size={16} />{" "}
            {advanced ? "Hide filters" : "Advanced filters"}
          </button>
        </div>
        {advanced && (
          <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs font-medium">
              Workspace
              <select
                className="field mt-1 py-2"
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
              </select>
            </label>
            <label className="text-xs font-medium">
              Request type
              <select
                className="field mt-1 py-2"
                value={filters.type}
                onChange={(event) =>
                  setFilters({ ...filters, type: event.target.value })
                }
              >
                <option value="">All types</option>
                <option value="guest_post">Guest post</option>
                <option value="link_insertion">Link insertion</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="text-xs font-medium">
              Direction
              <select
                className="field mt-1 py-2"
                value={filters.direction}
                onChange={(event) =>
                  setFilters({ ...filters, direction: event.target.value })
                }
              >
                <option value="">Both directions</option>
                <option value="sent">Sent by me</option>
                <option value="received">Received by me</option>
              </select>
            </label>
            <label className="text-xs font-medium">
              Created from
              <input
                className="field mt-1 py-2"
                type="date"
                value={filters.createdFrom}
                onChange={(event) =>
                  setFilters({ ...filters, createdFrom: event.target.value })
                }
              />
            </label>
            <label className="text-xs font-medium">
              Created to
              <input
                className="field mt-1 py-2"
                type="date"
                value={filters.createdTo}
                onChange={(event) =>
                  setFilters({ ...filters, createdTo: event.target.value })
                }
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatus("");
                setFilters({
                  type: "",
                  direction: "",
                  partnershipId: "",
                  createdFrom: "",
                  createdTo: "",
                });
              }}
              className="justify-self-start text-sm font-semibold text-blue-700"
            >
              Clear filters
            </button>
          </div>
        )}
      </section>
      {rows.length === 0 ? (
        <section className="panel p-10 text-center">
          <p className="font-medium">No requests match these filters.</p>
          <p className="muted mt-1 text-sm">
            Try another search, status, or date range.
          </p>
        </section>
      ) : (
        <section className="space-y-3">
          <p className="muted text-xs">
            Showing {rows.length} request{rows.length === 1 ? "" : "s"}
          </p>
          {rows.map((row) => {
            const counterpart = scope === "sent" ? row.receiver : row.sender;
            const overdue =
              row.was_overdue ||
              row.status === "overdue" ||
              (new Date(row.deadline_at) < new Date() && !row.first_viewed_at);
            return (
              <details key={row.id} className="panel group">
                <summary
                  className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4 md:p-5"
                  onClick={() => {
                    if (scope === "inbox" && !row.first_viewed_at)
                      void update(row, { markSeen: true });
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">
                      #{row.request_code} · {row.anchor_text}{" "}
                      <span className="muted font-normal">
                        · {row.workspace?.name ?? "Workspace"}
                      </span>
                    </p>
                    <p className="muted mt-1 text-xs">
                      {scope === "sent" ? "To" : "From"}{" "}
                      {counterpart?.full_name ?? "Partner"} ·{" "}
                      {new Date(row.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={overdue ? "overdue" : row.status} />
                    <span className="muted text-xs">
                      {row.request_type.replaceAll("_", " ")}
                    </span>
                  </div>
                </summary>
                <div className="space-y-4 border-t px-4 py-4 md:px-5">
                  <div className="grid gap-4 text-sm md:grid-cols-2">
                    <div>
                      <p className="muted text-xs">Placement page</p>
                      <a
                        className="break-all text-blue-700"
                        target="_blank"
                        rel="noreferrer"
                        href={row.placement_page_url}
                      >
                        {row.placement_page_url}
                      </a>
                    </div>
                    <div>
                      <p className="muted text-xs">Target link</p>
                      <a
                        className="break-all text-blue-700"
                        target="_blank"
                        rel="noreferrer"
                        href={row.target_link}
                      >
                        {row.target_link}
                      </a>
                    </div>
                    <div>
                      <p className="muted text-xs">Review deadline</p>
                      <p>{new Date(row.deadline_at).toLocaleString()}</p>
                    </div>
                    <label className="text-xs font-medium">
                      Update status
                      <select
                        disabled={busy === row.id}
                        className="field mt-1 py-2"
                        value={row.status}
                        onChange={(event) =>
                          void update(row, { status: event.target.value })
                        }
                      >
                        {statuses.map((item) => (
                          <option key={item} value={item}>
                            {formatStatus(item)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <EditRequestForm
                    row={row}
                    onSave={(changes) => void update(row, changes)}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link
                      href={`/messages?request=${row.id}`}
                      className="text-sm font-semibold text-blue-700"
                    >
                      Open this discussion →
                    </Link>
                    <button
                      type="button"
                      disabled={busy === row.id}
                      onClick={() => setDeleteTarget(row)}
                      className="rounded-lg border border-[var(--red)] px-3 py-2 text-sm text-[var(--red)]"
                    >
                      Delete request
                    </button>
                  </div>
                </div>
              </details>
            );
          })}
        </section>
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
    </main>
  );
}
