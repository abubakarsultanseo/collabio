"use client";
import { EmptyState } from "@/components/app/empty-state";
import { Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

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
        <section id="create-workspace" className="os-card p-5 md:p-6">
          <h2 className="text-lg font-semibold">Create a partner workspace</h2>
          <p className="text-[var(--muted)] mt-1 text-sm">
            Both members share requests, comments, and activity here.
          </p>
          <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Workspace name"
              placeholder="Workspace name"
              required
              minLength={2}
              maxLength={140}
            />
            <Select
              aria-label="Partner"
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
            </Select>
            <Button disabled={busy || !peer}>
              {busy ? "Creating…" : "Create workspace"}
            </Button>
          </form>
        </section>
      )}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-semibold">
            {isAdmin ? "Partner workspaces" : "Your workspace"}
          </h2>
          <span className="text-[var(--muted)] text-sm">
            {rows.length} total
          </span>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No partner workspaces yet"
            hint="Accepting a partner invitation will create a workspace."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((p) => (
              <Link
                key={p.id}
                href={`/partnerships/${p.id}`}
                className="os-card os-card-interactive p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-dark)]">
                  Shared collaboration workspace
                </p>
                <h3 className="mt-2 text-lg font-semibold">{p.name}</h3>
                <p className="text-[var(--muted)] mt-2 text-sm">
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
