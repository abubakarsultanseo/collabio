"use client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/app/toast";
import { useRef, useState } from "react";
import { RequestContentFields } from "@/components/requests/request-content-fields";

export default function BulkRequestForm({
  partnershipId,
  onComplete,
}: {
  partnershipId: string;
  onComplete: (count: number) => void;
}) {
  const notify = useToast();
  const [items, setItems] = useState([0, 1]);
  const nextId = useRef(2);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requests = Array.from(
      event.currentTarget.querySelectorAll("fieldset"),
    ).map((group) =>
      Object.fromEntries(
        Array.from(
          group.querySelectorAll<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
          >("[name]"),
        ).map((field) => [field.name, field.value]),
      ),
    );
    setBusy(true);
    try {
      const response = await fetch("/api/requests/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnershipId, requests }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not create requests.");
      onComplete(data.count ?? items.length);
    } catch (caught) {
      notify(
        caught instanceof Error ? caught.message : "Could not create requests.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Bulk request entry</h3>
          <p className="text-[var(--muted)] mt-1 text-sm">
            Add up to 50 requests for this partner in one submission.
          </p>
        </div>
        <button
          type="button"
          disabled={items.length >= 50}
          onClick={() => setItems((current) => [...current, nextId.current++])}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text)] disabled:opacity-50"
        >
          + Add request
        </button>
      </div>
      {items.map((item, index) => (
        <fieldset
          key={item}
          className="grid gap-3 rounded-xl border border-[var(--border)] p-4 md:grid-cols-2"
        >
          <legend className="px-1 text-sm font-semibold">
            Request {index + 1}
          </legend>
          <RequestContentFields allowUpload={false} />
          {items.length > 1 && (
            <button
              type="button"
              onClick={() =>
                setItems((current) => current.filter((_, i) => i !== index))
              }
              className="justify-self-start text-sm font-medium text-[var(--red)] md:col-span-2"
            >
              Remove this request
            </button>
          )}
        </fieldset>
      ))}
      <Button disabled={busy}>
        {busy ? "Submitting requests…" : `Send ${items.length} requests`}
      </Button>
    </form>
  );
}
