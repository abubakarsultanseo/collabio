"use client";
import { useToast } from "@/components/app/toast";
import Link from "next/link";
import { useState } from "react";
type Person = { id: string; full_name: string; email: string };
type Partnership = {
  id: string;
  name: string;
  user_a_id: string;
  user_b_id: string;
  created_at: string;
};
export default function PartnershipsWorkspace({
  people,
  partnerships,
  currentUserId,
  isAdmin,
}: {
  people: Person[];
  partnerships: Partnership[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const notify = useToast();
  const [name, setName] = useState("");
  const [peer, setPeer] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState(partnerships);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/partnerships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, partnerId: peer }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not create partnership");
      const person = people.find((x) => x.id === peer);
      setRows([
        {
          id: d.id,
          name,
          user_a_id: currentUserId,
          user_b_id: peer,
          created_at: new Date().toISOString(),
        },
        ...rows,
      ]);
      setName("");
      setPeer("");
      notify(
        `Partnership created${person ? ` with ${person.full_name}` : ""}.`,
        "success",
      );
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Could not create partnership",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      {isAdmin && (
        <section className="panel p-5 md:p-6">
          <h2 className="text-lg font-semibold">Create a partner workspace</h2>
          <p className="muted mt-1 text-sm">
            Both members share requests, comments, and activity here.
          </p>
          <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-3">
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Workspace name"
              required
              minLength={2}
              maxLength={140}
            />
            <select
              className="field"
              value={peer}
              onChange={(e) => setPeer(e.target.value)}
              required
            >
              <option value="">Choose a partner</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} — {p.email}
                </option>
              ))}
            </select>
            <button className="primary" disabled={busy || !peer}>
              {busy ? "Creating…" : "Create workspace"}
            </button>
          </form>
        </section>
      )}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-semibold">
            {isAdmin ? "Partner workspaces" : "Your workspace"}
          </h2>
          <span className="muted text-sm">{rows.length} total</span>
        </div>
        {rows.length === 0 ? (
          <div className="panel p-6 muted text-sm">
            No partner workspaces yet. Accepting an invitation will create one.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((p) => (
              <Link
                key={p.id}
                href={`/partnerships/${p.id}`}
                className="panel p-5 transition hover:-translate-y-0.5 hover:shadow-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Shared collaboration workspace
                </p>
                <h3 className="mt-2 text-lg font-semibold">{p.name}</h3>
                <p className="muted mt-2 text-sm">
                  Send or review requests, update statuses, and view activity →
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
