"use client";
import { useRequestChat } from "@/components/chat/use-request-chat";
import {
  InlineStatus,
  placementDomain,
} from "@/components/requests/request-tools";
import RequestDetails from "@/components/requests/request-details-panel";
import { EmptyState } from "@/components/app/empty-state";
import {
  RequestContentFields,
  requestFormBody,
} from "@/components/requests/request-content-fields";
import { requestLabel, type RequestContent } from "@/lib/request-content";
import { Button } from "@/components/ui/button";

import { useToast } from "@/components/app/toast";
import { StatusBadge } from "@/components/status-badge";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Clock3,
  Inbox,
  Send,
  type LucideIcon,
} from "lucide-react";
import {
  ExchangeBalance,
  ExchangeFields,
  useExchangeOverview,
  refreshExchangeOverview,
} from "@/components/requests/exchange-controls";
import { matchesRequestView, type RequestView } from "@/lib/request-statuses";
import BulkRequestForm from "@/components/bulk-request-form";

type RequestRow = RequestContent & {
  id: string;
  request_code: number;
  deal_id: string | null;
  link_side: string;
  sender_id: string;
  receiver_id: string;
  direction: string;
  notes: string | null;
  status: string;
  canChangeStatus?: boolean;
  rejection_reason?: string | null;
  first_viewed_at: string | null;
  deadline_at: string;
  import_key?: string | null;
  was_overdue: boolean;
  created_at: string;
  live_at: string | null;
  shared_at: string | null;
  sender: { full_name: string } | null;
  receiver: { full_name: string } | null;
};
export default function PartnershipDetail({
  id,
  name,
  currentUserId,
  isAdmin,
}: {
  id: string;
  name: string;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const notify = useToast();
  const [details, setDetails] = useState<{
    row: RequestRow;
    mode: "view" | "note";
  } | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<RequestView | "sent" | "received">(
    "all",
  );
  const exchange = useExchangeOverview(id);
  const [bulkMode, setBulkMode] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const incoming = requests.filter(
    (row) => row.status !== "cancelled" && row.receiver_id === currentUserId,
  );
  const outgoing = requests.filter(
    (row) => row.status !== "cancelled" && row.sender_id === currentUserId,
  );
  const live = requests.filter((row) => row.status === "live");
  const pending = requests.filter((row) =>
    matchesRequestView(row.status, "pending"),
  );
  const metrics: Array<{ label: string; value: number; icon: LucideIcon }> = [
    { label: "Requests sent by you", value: outgoing.length, icon: Send },
    { label: "Requests received", value: incoming.length, icon: Inbox },
    { label: "Live placements", value: live.length, icon: ArrowUpRight },
    { label: "Pending requests", value: pending.length, icon: Clock3 },
  ];
  const shown = useMemo(
    () =>
      requests.filter((row) =>
        filter === "sent"
          ? row.status !== "cancelled" && row.sender_id === currentUserId
          : filter === "received"
            ? row.status !== "cancelled" && row.receiver_id === currentUserId
            : matchesRequestView(row.status, filter),
      ),
    [requests, filter, currentUserId],
  );
  const { counts: unreadChats, openRequestChat } = useRequestChat(shown);
  const mergeRow = useCallback(
    (patch: Partial<RequestRow> & { id: string }) => {
      setRequests((current) =>
        current.map((row) =>
          row.id === patch.id ? { ...row, ...patch } : row,
        ),
      );
    },
    [],
  );

  useEffect(() => {
    function onUpdate(event: Event) {
      mergeRow((event as CustomEvent<{ id: string; status: string }>).detail);
    }
    window.addEventListener("collabio:request-updated", onUpdate);
    return () =>
      window.removeEventListener("collabio:request-updated", onUpdate);
  }, [mergeRow]);
  const load = useCallback(async () => {
    const response = await fetch(
      `/api/requests?partnershipId=${id}&view=workspace`,
      {
        cache: "no-store",
      },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error ?? "Could not load workspace requests.");
    setRequests(data.requests ?? []);
  }, [id]);
  useEffect(() => {
    load().catch((caught) => notify(caught.message, "error"));
  }, [load, notify]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = requestFormBody(event.currentTarget as HTMLFormElement, {
      partnershipId: id,
    });
    setBusy(true);
    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        ...payload,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not send request.");
      setFormVersion((version) => version + 1);
      refreshExchangeOverview();
      notify(
        data.count > 1
          ? `${data.count} requests sent. Each link has its own request number.`
          : `Request #${data.request_code} sent. The receiver has 24 hours to review it.`,
        "success",
      );
      await load();
    } catch (caught) {
      notify(
        caught instanceof Error ? caught.message : "Could not send request.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  async function setStatus(
    row: RequestRow,
    status: string,
    reason?: string,
    liveUrl?: string,
  ) {
    try {
      const response = await fetch("/api/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, status, reason, liveUrl }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not update request status.");
      if (data.request) mergeRow(data.request);
      refreshExchangeOverview();
      notify("Status saved.");
      return true;
    } catch (caught) {
      notify(
        caught instanceof Error
          ? caught.message
          : "Could not update request status.",
        "error",
      );
      return false;
    }
  }
  async function markSeen(row: RequestRow) {
    if (row.receiver_id !== currentUserId || row.first_viewed_at) return;
    const response = await fetch("/api/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, markSeen: true }),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.request) {
        const { status, ...fields } = data.request;
        setRequests((current) =>
          current.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  ...fields,
                  status:
                    item.status === "new_request" && status === "seen"
                      ? "seen"
                      : item.status,
                }
              : item,
          ),
        );
      }
    }
  }
  return (
    <div className="page-enter mx-auto max-w-6xl space-y-6">
      <Link
        href="/partnerships"
        className="text-sm font-medium text-[var(--brand-dark)]"
      >
        ← Partner workspaces
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{name}</h1>
          <p className="text-[var(--muted)] mt-2 text-sm">
            Send requests to your partner, review incoming work, and keep the
            conversation with each request.
          </p>
        </div>
        <Link href="#create-request" className={buttonVariants()}>
          Create request
        </Link>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon }) => (
          <article key={label} className="os-card p-5">
            <Icon className="text-[var(--muted)]" size={18} />
            <p className="mt-3 text-3xl font-bold">{value}</p>
            <p className="text-[var(--muted)] mt-1 text-sm">{label}</p>
          </article>
        ))}
      </section>
      <section id="create-request" className="os-card p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Create request</h2>
            <p className="text-[var(--muted)] mt-1 text-sm">
              A request goes to the other person in this workspace, with a
              24-hour review deadline.
            </p>
          </div>
          <div className="inline-flex rounded-lg bg-[var(--canvas)] p-1">
            <button
              type="button"
              onClick={() => setBulkMode(false)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${!bulkMode ? "bg-[var(--card)] text-[var(--text)] shadow-sm" : "text-[var(--muted)]"}`}
            >
              One request
            </button>
            <button
              type="button"
              onClick={() => setBulkMode(true)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${bulkMode ? "bg-[var(--card)] text-[var(--text)] shadow-sm" : "text-[var(--muted)]"}`}
            >
              Bulk entry
            </button>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-[var(--info-bg)] px-3 py-2 text-sm text-[var(--brand-dark)]">
          Sender: {isAdmin ? "Admin" : "Partner"} · Receiver:{" "}
          {isAdmin ? "Partner" : "Admin"}
        </div>
        {bulkMode ? (
          <div className="mt-4">
            <BulkRequestForm
              partnershipId={id}
              overview={exchange?.overview}
              partnerName={name}
              onComplete={(count) => {
                notify(
                  `${count} requests sent. The receiver has 24 hours to review each request.`,
                  "success",
                );
                refreshExchangeOverview();
                void load();
              }}
            />
          </div>
        ) : (
          <form
            key={formVersion}
            onSubmit={submit}
            className="mt-4 grid gap-3 md:grid-cols-2"
          >
            <ExchangeFields overview={exchange?.overview} partnerName={name} />
            <RequestContentFields />
            <Button disabled={busy} className="md:col-span-2">
              {busy ? "Sending…" : "Send request"}
            </Button>
          </form>
        )}
      </section>
      <ExchangeBalance
        overview={exchange?.overview}
        error={exchange?.error}
        showExchanges
      />
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Workspace requests</h2>
            <p className="text-[var(--muted)] mt-1 text-sm">
              See both directions and update request progress.
            </p>
          </div>
        </div>
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {[
            ["all", "All requests"],
            ["sent", "Sent by me"],
            ["received", "Received"],
            ["live", "Live placements"],
            ["pending", "Pending"],
            ["cancelled", "Cancelled"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key as typeof filter)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${filter === key ? "border-[var(--brand)] bg-[var(--brand)] text-white dark:text-[var(--canvas)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--text)]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No requests in this view yet"
            hint="Choose a different filter or send a request."
          />
        ) : (
          <div className="space-y-3">
            {shown.map((row) => (
              <article key={row.id} className="os-card p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      #{row.request_code} ·{" "}
                      {placementDomain(row.placement_page_url)}
                    </h3>
                    <p className="text-sm text-[var(--muted)]">
                      {requestLabel(row)}
                    </p>
                    <p className="text-[var(--muted)] mt-1 text-xs">
                      {row.sender_id === currentUserId
                        ? "Sent by you"
                        : "Received from workspace member"}{" "}
                      ·{" "}
                      {row.import_date_unknown
                        ? "Original date unavailable"
                        : new Date(row.created_at).toLocaleString("en-PK", {
                            timeZone: "Asia/Karachi",
                          })}
                    </p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                  <span className="text-[var(--muted)] text-xs">
                    {row.import_key
                      ? "Historical request"
                      : `Review by ${new Date(row.deadline_at).toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}`}
                  </span>
                  <div className="flex items-center gap-3">
                    {row.status === "live" && row.live_url && (
                      <a
                        href={row.live_url}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        Published link <ArrowUpRight size={14} aria-hidden />
                      </a>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        openRequestChat(row);
                      }}
                    >
                      Chat{" "}
                      {unreadChats[row.id] > 0 && (
                        <span
                          className="rounded-full bg-[var(--brand-soft)] px-1.5 text-[var(--brand-dark)]"
                          aria-label={`${unreadChats[row.id]} unread messages`}
                        >
                          {unreadChats[row.id]}
                        </span>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDetails({ row, mode: "view" });
                        void markSeen(row).catch(() => {});
                      }}
                    >
                      View
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setDetails({ row, mode: "note" })}
                    >
                      Add note
                    </Button>
                    <InlineStatus
                      status={row.status}
                      enabled={row.canChangeStatus}
                      guestPost={row.request_type === "guest_post"}
                      liveUrl={row.live_url}
                      onSave={(status, reason, liveUrl) =>
                        setStatus(row, status, reason, liveUrl)
                      }
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {details && (
        <RequestDetails
          key={`${details.row.id}:${details.mode}`}
          mode={details.mode}
          row={requests.find((row) => row.id === details.row.id) ?? details.row}
          onClose={() => setDetails(null)}
        />
      )}
    </div>
  );
}
