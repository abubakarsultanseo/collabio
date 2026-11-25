"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  importFormats,
  importTemplates,
  type ImportFormat,
} from "@/lib/request-import-templates";
import { Input } from "@/components/ui/input";

type Preview = {
  name: string;
  email: string;
  accountStatus: string;
  sent: number;
  received: number;
  duplicates: number;
  unknownDates: number;
  issues: { row: number; message: string }[];
  sample: {
    line: number;
    anchor: string;
    direction: string;
    placement: string;
    status: string;
  }[];
  inserted?: number;
};

export function ImportRequests() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [format, setFormat] = useState<ImportFormat>("collab");
  const [direction, setDirection] = useState<"" | "sent" | "received">("");
  const [blockName, setBlockName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(action: "preview" | "import") {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > 2_000_000)
        throw new Error("Choose a CSV smaller than 2 MB.");
      const response = await fetch("/api/requests/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          csv: await file.text(),
          action,
          format,
          direction: direction || undefined,
          blockName,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPreview(data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not process this import.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Import historical requests</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Upload a CSV from either sheet layout. Import one partner block or
          sender tab at a time.
        </p>
      </header>
      <form
        className="os-card grid gap-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit("preview");
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Partner name
            <Input
              className="mt-1"
              required
              value={name}
              disabled={busy}
              onChange={(event) => {
                setName(event.target.value);
                setPreview(null);
              }}
            />
          </label>
          <label className="text-sm">
            Invited Google email
            <Input
              type="email"
              className="mt-1"
              required
              value={email}
              disabled={busy}
              onChange={(event) => {
                setEmail(event.target.value);
                setPreview(null);
              }}
            />
          </label>
        </div>
        <label className="text-sm">
          Sheet layout
          <Select
            className="mt-1"
            value={format}
            disabled={busy}
            onChange={(event) => {
              setFormat(event.target.value as ImportFormat);
              setPreview(null);
            }}
          >
            {importFormats.map((key) => (
              <option key={key} value={key}>
                {importTemplates[key].label}
              </option>
            ))}
          </Select>
        </label>
        {format !== "standard" && (
          <label className="text-sm">
            Requests in this block or tab *
            <Select
              className="mt-1"
              required
              value={direction}
              disabled={busy}
              onChange={(event) => {
                setDirection(event.target.value as typeof direction);
                setPreview(null);
              }}
            >
              <option value="">Choose a direction</option>
              <option value="sent">Sent by me</option>
              <option value="received">Received from partner</option>
            </Select>
          </label>
        )}
        {format === "collab" && (
          <label className="text-sm">
            Partner heading (exactly as shown in the sheet)
            <Input
              className="mt-1"
              value={blockName}
              disabled={busy}
              placeholder="e.g. Justin Hall"
              onChange={(event) => {
                setBlockName(event.target.value);
                setPreview(null);
              }}
            />
          </label>
        )}
        <label className="text-sm">
          Request CSV
          <Input
            type="file"
            accept=".csv,text/csv"
            className="mt-1 py-2"
            required
            disabled={busy}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
            }}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "Working…" : "Preview import"}
          </Button>
          <a
            download={`collabio-${format}-import-template.csv`}
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(importTemplates[format].csv)}`}
            className="text-sm text-[var(--brand-dark)] underline"
          >
            Download this layout’s CSV template
          </a>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Leave unknown dates empty. For document chips, paste the full document
          URL into a Document URL column. Rejected rows need the original
          reason.
        </p>
      </form>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-[var(--danger-bg)] p-3 text-sm"
        >
          {error}
        </p>
      )}
      {preview && (
        <section className="os-card space-y-3 p-5">
          <h2 className="font-semibold">
            {preview.name} · {preview.email}
          </h2>
          {preview.inserted !== undefined ? (
            <p role="status">
              {preview.inserted} rows imported. No request emails or review
              timers were started.
            </p>
          ) : (
            <>
              <p>
                {preview.sent} sent · {preview.received} received ·{" "}
                {preview.duplicates} existing duplicates skipped
              </p>
              {preview.unknownDates > 0 && (
                <p className="text-sm text-[var(--muted)]">
                  {preview.unknownDates} rows have no original date. Collabio
                  will show “Original date unavailable”.
                </p>
              )}
              {format !== "standard" && (
                <p className="text-sm text-[var(--muted)]">
                  Requested and New Req map to New Request. Not Live and Want to
                  remove map to Hold and keep their original label in notes.
                </p>
              )}
              {preview.sample.length > 0 && (
                <ul className="divide-y divide-[var(--border)] text-sm">
                  {preview.sample.map((row) => (
                    <li key={row.line} className="break-words py-2">
                      {row.direction} · {row.anchor} · {row.placement} ·{" "}
                      {row.status}
                    </li>
                  ))}
                </ul>
              )}
              {preview.issues.length > 0 && (
                <div className="text-sm">
                  <h3 className="font-semibold">
                    Fix {preview.issues.length} flagged rows
                  </h3>
                  <ul className="max-h-64 list-disc overflow-auto pl-5">
                    {preview.issues.map((row) => (
                      <li key={row.row}>
                        Row {row.row}: {row.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.accountStatus === "pending" && (
                <p className="text-sm text-[var(--muted)]">
                  This account remains pending until the partner accepts a
                  Google invitation.
                </p>
              )}
              <Button
                disabled={
                  busy ||
                  !!preview.issues.length ||
                  (!preview.sent && !preview.received)
                }
                onClick={() => void submit("import")}
              >
                Confirm and import
              </Button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
