"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const header =
  "direction,placement,anchor,target,type,status,created,notes,instructions,reason,updated,viewed,deadline,source_id";
type Preview = {
  name: string;
  email: string;
  accountStatus: string;
  sent: number;
  received: number;
  duplicates: number;
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
        body: JSON.stringify({ email, name, csv: await file.text(), action }),
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
          One CSV per partner. Use Sent for requests you sent and Received for
          requests the partner sent.
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
            download="collabio-import-template.csv"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(header + "\r\n")}`}
            className="text-sm text-[var(--brand-dark)] underline"
          >
            Download CSV template
          </a>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Use YYYY-MM-DD or an ISO timestamp with timezone. Rejected rows need
          the original reason. Use the original row ID in source_id when
          available.
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
