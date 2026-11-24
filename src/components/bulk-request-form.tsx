"use client";
import { useToast } from "@/components/app/toast";
import { useState } from "react";
type Item = {
  placementPageUrl: string;
  anchorText: string;
  targetLink: string;
  requestType: string;
  instructions: string;
  notes: string;
};
const blank = (): Item => ({
  placementPageUrl: "",
  anchorText: "",
  targetLink: "",
  requestType: "guest_post",
  instructions: "",
  notes: "",
});
export default function BulkRequestForm({
  partnershipId,
  onComplete,
}: {
  partnershipId: string;
  onComplete: (count: number) => void;
}) {
  const notify = useToast();
  const [items, setItems] = useState<Item[]>([blank(), blank()]);
  const [busy, setBusy] = useState(false);
  function change(index: number, key: keyof Item, value: string) {
    setItems((current) =>
      current.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    );
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/requests/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnershipId, requests: items }),
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
          <p className="muted mt-1 text-sm">
            Add up to 50 requests for this partner in one submission.
          </p>
        </div>
        <button
          type="button"
          disabled={items.length >= 50}
          onClick={() => setItems((current) => [...current, blank()])}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          + Add request
        </button>
      </div>
      {items.map((item, index) => (
        <fieldset
          key={index}
          className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-2"
        >
          <legend className="px-1 text-sm font-semibold">
            Request {index + 1}
          </legend>
          <label className="text-sm">
            Placement page URL *
            <input
              required
              type="url"
              className="field mt-1"
              value={item.placementPageUrl}
              onChange={(event) =>
                change(index, "placementPageUrl", event.target.value)
              }
              placeholder="https://publisher.com/article"
            />
          </label>
          <label className="text-sm">
            Anchor text *
            <input
              required
              className="field mt-1"
              value={item.anchorText}
              onChange={(event) =>
                change(index, "anchorText", event.target.value)
              }
              placeholder="Exact anchor text"
            />
          </label>
          <label className="text-sm">
            Target link *
            <input
              required
              type="url"
              className="field mt-1"
              value={item.targetLink}
              onChange={(event) =>
                change(index, "targetLink", event.target.value)
              }
              placeholder="https://yourwebsite.com/page"
            />
          </label>
          <label className="text-sm">
            Request type
            <select
              className="field mt-1"
              value={item.requestType}
              onChange={(event) =>
                change(index, "requestType", event.target.value)
              }
            >
              <option value="guest_post">Guest post</option>
              <option value="link_insertion">Link insertion</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            Instructions
            <textarea
              rows={2}
              className="field mt-1"
              value={item.instructions}
              onChange={(event) =>
                change(index, "instructions", event.target.value)
              }
            />
          </label>
          <label className="text-sm md:col-span-2">
            Notes
            <textarea
              rows={2}
              className="field mt-1"
              value={item.notes}
              onChange={(event) => change(index, "notes", event.target.value)}
            />
          </label>
          {items.length > 1 && (
            <button
              type="button"
              onClick={() =>
                setItems((current) => current.filter((_, i) => i !== index))
              }
              className="justify-self-start text-sm font-medium text-red-700 md:col-span-2"
            >
              Remove this request
            </button>
          )}
        </fieldset>
      ))}
      <button disabled={busy} className="primary">
        {busy ? "Submitting requests…" : `Send ${items.length} requests`}
      </button>
    </form>
  );
}
