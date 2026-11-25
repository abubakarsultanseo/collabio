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
import { formatStatus } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { placementDomain } from "@/components/requests/request-tools";

export type RequestSummary = RequestContent & {
  id: string;
  request_code: number;
  status: string;
  rejection_reason?: string | null;
  notes?: string | null;
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

export default function RequestDetails({
  row,
  mode,
  onClose,
  partnerName,
}: {
  row: RequestSummary;
  mode: "view" | "note";
  onClose: () => void;
  partnerName?: string;
}) {
  const notify = useToast();
  const [tab, setTab] = useState<"details" | "notes" | "history">("details");
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const historyVisible = tab !== "details";
  const [notes, setNotes] = useState<Note[]>([]);
  const [history, setHistory] = useState<StatusChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode !== "view" || !historyVisible || loaded) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
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
        setLoaded(true);
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
  }, [mode, row.id, historyVisible, loaded, attempt]);

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
            : [requestLabel(row), partnerName, formatStatus(row.status)]
                .filter(Boolean)
                .join(" · ")
        }
        placement="side"
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
            <div
              className="flex gap-2 border-b border-[var(--border)] pb-2"
              aria-label="Request sections"
            >
              {(["details", "notes", "history"] as const).map((section) => (
                <Button
                  key={section}
                  variant={section === tab ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={section === tab}
                  className="capitalize"
                  onClick={() => setTab(section)}
                >
                  {section}
                </Button>
              ))}
            </div>
            {tab === "details" ? (
              <div className="space-y-4">
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
              </div>
            ) : error ? (
              <div role="alert" className="space-y-3 text-sm">
                <p>{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Retry
                </Button>
              </div>
            ) : loading ? (
              <p role="status" className="text-sm text-[var(--muted)]">
                Loading {tab}…
              </p>
            ) : tab === "notes" ? (
              <DetailList
                title="Request notes"
                items={notes.map((note) => ({
                  id: note.id,
                  label: `${note.author} · ${date(note.created_at)}`,
                  text: note.body,
                }))}
              />
            ) : (
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
