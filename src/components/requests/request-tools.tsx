"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  copyRequest,
  isDocumentRequest,
  originalAndEdited,
  requestLabel,
  type RequestContent,
} from "@/lib/request-content";
import { Copy } from "lucide-react";
import { useToast } from "@/components/app/toast";
import { StatusBadge, formatStatus } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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

export function placementDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "Placement";
  }
}

export type RequestSummary = RequestContent & {
  id: string;
  request_code: number;
  status: string;
  rejection_reason?: string | null;
  notes: string | null;
  deadline_at: string;
  import_key?: string | null;
  created_at: string;
};

type Note = { id: string; author: string; body: string; created_at: string };
type StatusChange = {
  id: string;
  author: string;
  from: string | null;
  to: string | null;
  reason: string | null;
  created_at: string;
};

export function InlineStatus({
  status,
  enabled,
  busy,
  onSave,
}: {
  status: string;
  enabled?: boolean;
  busy?: boolean;
  onSave: (status: string, reason?: string) => Promise<boolean>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  async function save(value: string, why?: string) {
    setSaving(value);
    try {
      if (await onSave(value, why)) {
        setRejecting(false);
        setReason("");
      }
    } finally {
      setSaving(null);
    }
  }

  if (!enabled) return <StatusBadge status={status} />;

  return (
    <>
      <Select
        aria-label="Change request status"
        className="h-8 min-w-36 text-xs capitalize"
        value={saving ?? status}
        disabled={busy || !!saving}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "rejected") setRejecting(true);
          else void save(value);
        }}
      >
        {statuses.map((value) => (
          <option key={value} value={value}>
            {formatStatus(value)}
          </option>
        ))}
      </Select>
      {saving && (
        <span role="status" className="sr-only">
          Saving status
        </span>
      )}
      <Dialog
        open={rejecting}
        onOpenChange={(open) => {
          if (!saving) setRejecting(open);
        }}
      >
        <DialogContent
          title="Reject request"
          description="The other participant can see this reason in the request history."
          closeDisabled={!!saving}
        >
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (reason.trim()) void save("rejected", reason.trim());
            }}
          >
            <label className="block text-sm font-medium">
              Reason
              <Textarea
                className="mt-1"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                maxLength={2000}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={!!saving}
                onClick={() => {
                  setRejecting(false);
                  setReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={!!saving || !reason.trim()}
              >
                {saving ? "Saving…" : "Reject request"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function date(value: string) {
  return new Date(value).toLocaleString("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  });
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const notify = useToast();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          notify("Copied.");
        } catch {
          notify("Could not copy to the clipboard.", "error");
        }
      }}
    >
      <Copy size={13} aria-hidden />
      {label}
    </Button>
  );
}

export function RequestDetails({
  row,
  mode,
  onClose,
}: {
  row: RequestSummary;
  mode: "view" | "note";
  onClose: () => void;
}) {
  const notify = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [history, setHistory] = useState<StatusChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode !== "view") return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/requests/details?id=${row.id}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (controller.signal.aborted) return;
        setNotes(data.notes);
        setHistory(data.history);
      } catch (caught) {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load details.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [mode, row.id]);

  async function saveNote() {
    if (saving || !noteBody.trim()) return;
    setSaving(true);
    try {
      const response = await fetch("/api/requests/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: row.id, body: noteBody }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setNotes((current) => [data.note, ...current]);
      setNoteBody("");
      notify("Note added.");
      onClose();
    } catch (caught) {
      notify(
        caught instanceof Error ? caught.message : "Could not save the note.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  }

  const documentRequest =
    isDocumentRequest(row.request_type) && !row.anchor_text;
  const legacyContent = originalAndEdited(row.instructions);
  const fields: {
    label: string;
    value: string;
    link?: boolean;
    copy?: boolean;
    href?: string;
  }[] = [
    {
      label: documentRequest ? "Site" : "Placement page",
      value: row.placement_page_url,
      link: true,
      copy: true,
    },
    ...(documentRequest
      ? [
          {
            label: "Listicle position",
            value: row.listicle_position ?? "",
            copy: true,
          },
          {
            label: "Document link",
            value: row.document_url ?? "",
            link: true,
            copy: true,
          },
          {
            label: "Attachment",
            value: row.attachment_name ?? "",
            link: true,
            href: `/api/requests/attachment?requestId=${row.id}`,
          },
        ]
      : [
          { label: "Anchor text", value: requestLabel(row) ?? "", copy: true },
          {
            label: "Target URL",
            value: row.target_link ?? "",
            link: true,
            copy: true,
          },
          {
            label: "Original Content",
            value: row.original_content ?? legacyContent.original,
            copy: true,
          },
          {
            label: "Edited Content",
            value: row.edited_content ?? legacyContent.edited,
            copy: true,
          },
        ]),
    { label: "Instructions", value: row.instructions || "", copy: true },
    { label: "Original notes", value: row.notes || "" },
    { label: "Type", value: formatStatus(row.request_type) },
    { label: "Status", value: formatStatus(row.status) },
    {
      label: "Created",
      value: row.import_date_unknown
        ? "Original date unavailable"
        : date(row.created_at),
    },
    {
      label: "Review deadline",
      value: row.import_key
        ? "Historical request · No active timer"
        : date(row.deadline_at),
    },
    { label: "Rejection reason", value: row.rejection_reason || "" },
  ].filter((field) => field.value);
  const all = copyRequest(row);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        title={
          mode === "note"
            ? `Add note to request #${row.request_code}`
            : `Request #${row.request_code} · ${placementDomain(row.placement_page_url)}`
        }
        description={
          mode === "note"
            ? "The note is visible to people who can view this request."
            : requestLabel(row)
        }
        className="max-w-2xl"
        closeDisabled={saving}
      >
        {mode === "note" ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveNote();
            }}
          >
            <label className="block text-sm font-medium">
              Note
              <Textarea
                className="mt-1"
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                maxLength={5000}
                required
              />
            </label>
            <Button type="submit" disabled={saving || !noteBody.trim()}>
              {saving ? "Saving…" : "Save note"}
            </Button>
          </form>
        ) : (
          <div className="space-y-5">
            <div className="flex justify-end">
              <CopyButton value={all} label="Copy full request" />
            </div>
            <dl className="divide-y divide-[var(--border)]">
              {fields.map(({ label, value, link, copy, href }) => (
                <div
                  key={label}
                  className="flex items-start justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold text-[var(--muted)]">
                      {label}
                    </dt>
                    <dd className="whitespace-pre-wrap break-words text-sm">
                      {link ? (
                        <a
                          className="text-[var(--brand-dark)] underline"
                          href={href ?? value}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {value}
                        </a>
                      ) : (
                        value || "—"
                      )}
                    </dd>
                  </div>
                  {copy && value && (
                    <CopyButton
                      value={value}
                      label={`Copy ${label.toLowerCase()}`}
                    />
                  )}
                </div>
              ))}
            </dl>
            {loading && (
              <p role="status" className="text-sm text-[var(--muted)]">
                Loading notes and history…
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-[var(--red)]">
                {error}
              </p>
            )}
            {!loading && !error && (
              <>
                <DetailList
                  title="Request notes"
                  items={notes.map((note) => ({
                    id: note.id,
                    label: `${note.author} · ${date(note.created_at)}`,
                    text: note.body,
                  }))}
                />
                <DetailList
                  title="Status history"
                  items={history.map((change) => ({
                    id: change.id,
                    label: `${change.author} · ${date(change.created_at)}`,
                    text: (
                      <>
                        {formatStatus(change.from ?? "unknown")} →{" "}
                        {formatStatus(change.to ?? "unknown")}
                        {change.reason && (
                          <div className="mt-1">Reason: {change.reason}</div>
                        )}
                      </>
                    ),
                  }))}
                />
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailList({
  title,
  items,
}: {
  title: string;
  items: { id: string; label: string; text: ReactNode }[];
}) {
  return (
    <section>
      <h3 className="font-semibold">{title}</h3>
      {!items.length && (
        <p className="mt-1 text-sm text-[var(--muted)]">No entries yet.</p>
      )}
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border)] p-3"
          >
            <div className="min-w-0">
              <p className="text-xs text-[var(--muted)]">{item.label}</p>
              <div className="mt-1 whitespace-pre-wrap break-words text-sm">
                {item.text}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
