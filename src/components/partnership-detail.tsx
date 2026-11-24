"use client";
import { EmptyState } from "@/components/app/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

import { useToast } from "@/components/app/toast";
import { StatusBadge, formatStatus } from "@/components/status-badge";
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
import BulkRequestForm from "@/components/bulk-request-form";

type RequestRow = {
  id: string;
  request_code: number;
  deal_id: string | null;
  link_side: string;
  sender_id: string;
  receiver_id: string;
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
  live_at: string | null;
  shared_at: string | null;
  sender: { full_name: string } | null;
  receiver: { full_name: string } | null;
};
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
const emptyForm = {
  placementPageUrl: "",
  anchorText: "",
  targetLink: "",
  requestType: "guest_post",
  instructions: "",
  notes: "",
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
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [bulkMode, setBulkMode] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const incoming = requests.filter((row) => row.receiver_id === currentUserId);
  const outgoing = requests.filter((row) => row.sender_id === currentUserId);
  const live = requests.filter((row) => row.status === "live");
  const pending = requests.filter(
    (row) => !["live", "rejected", "cancelled"].includes(row.status),
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
        filter === "all"
          ? true
          : filter === "sent"
            ? row.sender_id === currentUserId
            : filter === "received"
              ? row.receiver_id === currentUserId
              : filter === "live"
                ? row.status === "live"
                : !["live", "rejected", "cancelled"].includes(row.status),
      ),
    [requests, filter, currentUserId],
  );
  const load = useCallback(async () => {
    const response = await fetch(`/api/requests?partnershipId=${id}`, {
      cache: "no-store",
    });
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
    setBusy(true);
    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnershipId: id, ...form }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not send request.");
      setForm(emptyForm);
      notify(
        `Request #${data.request_code} sent. The receiver has 24 hours to review it.`,
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
  async function setStatus(row: RequestRow, status: string) {
    try {
      const response = await fetch("/api/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, status }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not update request status.");
      await load();
    } catch (caught) {
      notify(
        caught instanceof Error
          ? caught.message
          : "Could not update request status.",
        "error",
      );
    }
  }
  async function markSeen(row: RequestRow) {
    if (row.receiver_id !== currentUserId || row.first_viewed_at) return;
    await fetch("/api/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, markSeen: true }),
    });
    await load();
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
              onComplete={(count) => {
                notify(
                  `${count} requests sent. The receiver has 24 hours to review each request.`,
                  "success",
                );
                void load();
              }}
            />
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm font-medium md:col-span-2">
              Placement page URL *
              <Input
                type="url"
                required
                className="mt-1"
                placeholder="https://publisher.com/article"
                value={form.placementPageUrl}
                onChange={(event) =>
                  setForm({ ...form, placementPageUrl: event.target.value })
                }
              />
            </label>
            <label className="text-sm font-medium">
              Anchor text *
              <Input
                required
                className="mt-1"
                placeholder="Exact anchor text"
                value={form.anchorText}
                onChange={(event) =>
                  setForm({ ...form, anchorText: event.target.value })
                }
              />
            </label>
            <label className="text-sm font-medium">
              Target link *
              <Input
                required
                type="url"
                className="mt-1"
                placeholder="https://client.com/page"
                value={form.targetLink}
                onChange={(event) =>
                  setForm({ ...form, targetLink: event.target.value })
                }
              />
            </label>
            <label className="text-sm font-medium">
              Request type
              <Select
                className="mt-1"
                value={form.requestType}
                onChange={(event) =>
                  setForm({ ...form, requestType: event.target.value })
                }
              >
                <option value="guest_post">Guest post</option>
                <option value="link_insertion">Link insertion</option>
                <option value="other">Other</option>
              </Select>
            </label>
            <label className="text-sm font-medium">
              Edit / Guest Post Instructions
              <Textarea
                className="mt-1"
                rows={3}
                maxLength={5000}
                value={form.instructions}
                onChange={(event) =>
                  setForm({ ...form, instructions: event.target.value })
                }
              />
            </label>
            <label className="text-sm font-medium md:col-span-2">
              Notes / reason
              <Textarea
                className="mt-1"
                rows={3}
                maxLength={5000}
                value={form.notes}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
              />
            </label>
            <Button disabled={busy} className="md:col-span-2">
              {busy ? "Sending…" : "Send request"}
            </Button>
          </form>
        )}
      </section>
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Workspace requests</h2>
            <p className="text-[var(--muted)] mt-1 text-sm">
              See both directions and update request progress.
            </p>
          </div>
          <Link
            href={`/messages?request=${shown[0]?.id ?? ""}`}
            className="text-sm font-semibold text-[var(--brand-dark)]"
          >
            Open messages →
          </Link>
        </div>
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {[
            ["all", "All requests"],
            ["sent", "Sent by me"],
            ["received", "Received"],
            ["live", "Live placements"],
            ["pending", "Pending"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
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
              <article
                key={row.id}
                onClick={() => void markSeen(row)}
                className="os-card p-4 md:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      #{row.request_code} · {row.anchor_text}
                    </h3>
                    <p className="text-[var(--muted)] mt-1 text-xs">
                      {row.sender_id === currentUserId
                        ? "Sent by you"
                        : "Received from workspace member"}{" "}
                      ·{" "}
                      {new Date(row.created_at).toLocaleString("en-PK", {
                        timeZone: "Asia/Karachi",
                      })}
                    </p>
                  </div>
                  <StatusBadge
                    status={row.was_overdue ? "overdue" : row.status}
                  />
                </div>
                <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                  <a
                    onClick={(event) => event.stopPropagation()}
                    href={row.placement_page_url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-[var(--brand-dark)]"
                  >
                    Placement: {row.placement_page_url}
                  </a>
                  <a
                    onClick={(event) => event.stopPropagation()}
                    href={row.target_link}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-[var(--brand-dark)]"
                  >
                    Target: {row.target_link}
                  </a>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                  <span className="text-[var(--muted)] text-xs">
                    Review by{" "}
                    {new Date(row.deadline_at).toLocaleString("en-PK", {
                      timeZone: "Asia/Karachi",
                    })}
                  </span>
                  <div className="flex items-center gap-3">
                    <Link
                      onClick={(event) => event.stopPropagation()}
                      href={`/messages?request=${row.id}`}
                      className="text-xs font-semibold text-[var(--brand-dark)]"
                    >
                      Discuss
                    </Link>
                    <label
                      className="flex items-center gap-2 text-xs"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Status
                      <Select
                        className="min-w-36 py-2"
                        value={row.status}
                        onChange={(event) =>
                          void setStatus(row, event.target.value)
                        }
                      >
                        {statuses.map((status) => (
                          <option key={status} value={status}>
                            {formatStatus(status)}
                          </option>
                        ))}
                      </Select>
                    </label>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
