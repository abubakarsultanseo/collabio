"use client";
import { EmptyState } from "@/components/app/empty-state";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/app/toast";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Partner = {
  id: string;
  owner_id: string;
  name: string;
  website_url: string;
  domain_rating: number | null;
  organic_traffic: number | null;
  email: string | null;
  contact_person: string | null;
  niche: string | null;
  country: string | null;
  notes: string | null;
  status: "prospect" | "contacted" | "active" | "inactive";
  created_at: string;
  updated_at: string;
  owner: { full_name: string; email: string } | null;
};
type TeamMember = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  account_status: string;
};
type FormValues = {
  name: string;
  websiteUrl: string;
  domainRating: string;
  organicTraffic: string;
  email: string;
  contactPerson: string;
  niche: string;
  country: string;
  notes: string;
  status: Partner["status"];
  ownerId: string;
};
const blank: FormValues = {
  name: "",
  websiteUrl: "",
  domainRating: "",
  organicTraffic: "",
  email: "",
  contactPerson: "",
  niche: "",
  country: "",
  notes: "",
  status: "prospect",
  ownerId: "",
};
const statuses: Partner["status"][] = [
  "prospect",
  "contacted",
  "active",
  "inactive",
];

function numberLabel(value: number | null, format = false) {
  if (value === null) return "—";
  return format ? new Intl.NumberFormat().format(value) : String(value);
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeZone: "Asia/Karachi",
  }).format(new Date(value));
}

export default function SeoPartnersWorkspace({
  isAdmin,
  currentUserId,
}: {
  isAdmin: boolean;
  currentUserId: string;
}) {
  const notify = useToast();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const lastRequest = useRef(0);

  const [editing, setEditing] = useState<Partner | null>(null);
  const [form, setForm] = useState<FormValues>(blank);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Partner | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const requestId = ++lastRequest.current;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("q", search.trim());
        if (statusFilter) params.set("status", statusFilter);
        if (isAdmin && ownerFilter) params.set("ownerId", ownerFilter);
        const response = await fetch(`/api/seo-partners?${params.toString()}`, {
          cache: "no-store",
          signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Could not load partners.");
        if (requestId === lastRequest.current && !signal?.aborted)
          setPartners(data.partners ?? []);
      } catch (caught) {
        if (requestId !== lastRequest.current || signal?.aborted) return;
        notify(
          caught instanceof Error ? caught.message : "Could not load partners.",
          "error",
        );
      } finally {
        if (requestId === lastRequest.current && !signal?.aborted)
          setLoading(false);
      }
    },
    [search, statusFilter, ownerFilter, isAdmin, notify],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => void load(controller.signal),
      search.trim() ? 180 : 0,
    );
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [load, search]);
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/team", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (response.ok) setMembers(data.members ?? []);
      })
      .catch(() => {});
  }, [isAdmin]);

  const activeMembers = useMemo(
    () => members.filter((member) => member.account_status === "active"),
    [members],
  );
  function openNew() {
    setEditing(null);
    setForm({ ...blank, ownerId: currentUserId });
    setModalOpen(true);
  }
  function openEdit(partner: Partner) {
    setEditing(partner);
    setForm({
      name: partner.name,
      websiteUrl: partner.website_url,
      domainRating:
        partner.domain_rating === null ? "" : String(partner.domain_rating),
      organicTraffic:
        partner.organic_traffic === null ? "" : String(partner.organic_traffic),
      email: partner.email ?? "",
      contactPerson: partner.contact_person ?? "",
      niche: partner.niche ?? "",
      country: partner.country ?? "",
      notes: partner.notes ?? "",
      status: partner.status,
      ownerId: partner.owner_id,
    });
    setModalOpen(true);
  }
  function setValue<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name,
      websiteUrl: form.websiteUrl,
      domainRating: form.domainRating === "" ? null : Number(form.domainRating),
      organicTraffic:
        form.organicTraffic === "" ? null : Number(form.organicTraffic),
      email: form.email,
      contactPerson: form.contactPerson,
      niche: form.niche,
      country: form.country,
      notes: form.notes,
      status: form.status,
      ...(isAdmin && !editing
        ? { ownerId: form.ownerId || currentUserId }
        : {}),
    };
    try {
      const response = await fetch(
        editing ? `/api/seo-partners/${editing.id}` : "/api/seo-partners",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not save partner.");
      setModalOpen(false);
      notify(
        editing ? "Partner details updated." : "Partner added.",
        "success",
      );
      await load();
    } catch (caught) {
      notify(
        caught instanceof Error ? caught.message : "Could not save partner.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(partner: Partner) {
    setSaving(true);
    try {
      const response = await fetch(`/api/seo-partners/${partner.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not delete partner.");
      setConfirmDelete(null);
      notify(`${partner.name} was removed.`, "success");
      await load();
    } catch (caught) {
      notify(
        caught instanceof Error ? caught.message : "Could not delete partner.",
        "error",
      );
      setConfirmDelete(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-enter mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">SEO Partners</h1>
          <p className="text-[var(--muted)] mt-2 text-sm">
            Keep your outreach contacts, website metrics, and relationship
            status in one place.
          </p>
        </div>
        <Button onClick={openNew}>+ Add partner</Button>
      </div>

      <section className="os-card mt-6 p-4 md:p-5">
        <div
          className={`grid gap-3 ${isAdmin ? "md:grid-cols-3" : "md:grid-cols-2"}`}
        >
          <label className="text-sm font-medium">
            Search partners
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="mt-1"
              placeholder="Name, website, email, niche…"
            />
          </label>
          <label className="text-sm font-medium">
            Status
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-1"
            >
              <option value="">All statuses</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {value[0].toUpperCase() + value.slice(1)}
                </option>
              ))}
            </Select>
          </label>
          {isAdmin && (
            <label className="text-sm font-medium">
              Workspace
              <Select
                value={ownerFilter}
                onChange={(event) => setOwnerFilter(event.target.value)}
                className="mt-1"
              >
                <option value="">All team members</option>
                {activeMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name} · {member.email}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>
        <div className="text-[var(--muted)] mt-3 text-xs">
          {loading
            ? "Updating results…"
            : `${partners.length} ${partners.length === 1 ? "partner" : "partners"}`}
        </div>
      </section>
      {loading && partners.length === 0 ? (
        <div className="os-card text-[var(--muted)] mt-5 p-8 text-center text-sm">
          Loading partners…
        </div>
      ) : partners.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon={Users}
            title="No partners found"
            hint="Add a partner or adjust your search and filters."
          >
            <Button onClick={openNew} className="mt-4">
              Add your first partner
            </Button>
          </EmptyState>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {partners.map((partner) => (
            <article key={partner.id} className="os-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">
                    {partner.name}
                  </h2>
                  <a
                    href={partner.website_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate text-sm text-[var(--brand-dark)]"
                  >
                    {partner.website_url}
                  </a>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs capitalize ${partner.status === "active" ? "bg-[var(--success-bg)] text-[var(--green)]" : partner.status === "inactive" ? "bg-[var(--canvas)] text-[var(--muted)]" : partner.status === "contacted" ? "bg-[var(--info-bg)] text-[var(--brand-dark)]" : "bg-[var(--warning-bg)] text-[var(--amber)]"}`}
                >
                  {partner.status}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <span className="text-[var(--muted)] block text-xs">
                    Domain Rating
                  </span>
                  <span className="font-medium">
                    {numberLabel(partner.domain_rating)}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--muted)] block text-xs">
                    Organic traffic
                  </span>
                  <span className="font-medium">
                    {numberLabel(partner.organic_traffic, true)}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--muted)] block text-xs">
                    Niche
                  </span>
                  <span className="font-medium">{partner.niche || "—"}</span>
                </div>
                <div>
                  <span className="text-[var(--muted)] block text-xs">
                    Country
                  </span>
                  <span className="font-medium">{partner.country || "—"}</span>
                </div>
                <div>
                  <span className="text-[var(--muted)] block text-xs">
                    Contact
                  </span>
                  <span className="font-medium">
                    {partner.contact_person || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--muted)] block text-xs">
                    Email
                  </span>
                  <span className="break-all font-medium">
                    {partner.email || "—"}
                  </span>
                </div>
              </div>
              {partner.notes && (
                <p className="mt-4 whitespace-pre-wrap rounded-lg bg-[var(--canvas)] p-3 text-sm text-[var(--muted)]">
                  {partner.notes}
                </p>
              )}
              <div className="text-[var(--muted)] mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
                <span>
                  Added {dateLabel(partner.created_at)}
                  {isAdmin && partner.owner
                    ? ` · ${partner.owner.full_name}`
                    : ""}
                </span>
                <span className="flex gap-2">
                  <button
                    onClick={() => openEdit(partner)}
                    className="rounded-lg border px-3 py-1.5 text-sm text-[var(--text)]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setConfirmDelete(partner)}
                    className="rounded-lg border border-[var(--red)] px-3 py-1.5 text-sm text-[var(--red)]"
                  >
                    Delete
                  </button>
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!saving) setModalOpen(open);
        }}
      >
        <DialogContent
          title={editing ? "Edit partner" : "Add SEO partner"}
          description="Partner details stay inside the assigned workspace."
          className="max-w-2xl"
          closeDisabled={saving}
        >
          <form onSubmit={save} className="mt-5 grid gap-3 md:grid-cols-2">
            <label className="text-sm font-medium">
              Partner name *
              <Input
                required
                minLength={2}
                maxLength={160}
                value={form.name}
                onChange={(event) => setValue("name", event.target.value)}
                className="mt-1"
                placeholder="Example Publishing"
              />
            </label>
            <label className="text-sm font-medium">
              Website URL *
              <Input
                required
                type="url"
                value={form.websiteUrl}
                onChange={(event) => setValue("websiteUrl", event.target.value)}
                className="mt-1"
                placeholder="https://example.com"
              />
            </label>
            <label className="text-sm font-medium">
              Domain Rating (0–100)
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.domainRating}
                onChange={(event) =>
                  setValue("domainRating", event.target.value)
                }
                className="mt-1"
                placeholder="e.g. 45"
              />
            </label>
            <label className="text-sm font-medium">
              Organic traffic
              <Input
                type="number"
                min="0"
                step="1"
                value={form.organicTraffic}
                onChange={(event) =>
                  setValue("organicTraffic", event.target.value)
                }
                className="mt-1"
                placeholder="Monthly estimate"
              />
            </label>
            <label className="text-sm font-medium">
              Email
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setValue("email", event.target.value)}
                className="mt-1"
                placeholder="editor@example.com"
              />
            </label>
            <label className="text-sm font-medium">
              Contact person
              <Input
                maxLength={160}
                value={form.contactPerson}
                onChange={(event) =>
                  setValue("contactPerson", event.target.value)
                }
                className="mt-1"
                placeholder="Name"
              />
            </label>
            <label className="text-sm font-medium">
              Niche
              <Input
                maxLength={160}
                value={form.niche}
                onChange={(event) => setValue("niche", event.target.value)}
                className="mt-1"
                placeholder="Marketing, SaaS, HR…"
              />
            </label>
            <label className="text-sm font-medium">
              Country
              <Input
                maxLength={120}
                value={form.country}
                onChange={(event) => setValue("country", event.target.value)}
                className="mt-1"
                placeholder="Country"
              />
            </label>
            <label className="text-sm font-medium">
              Status
              <Select
                value={form.status}
                onChange={(event) =>
                  setValue("status", event.target.value as Partner["status"])
                }
                className="mt-1"
              >
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {value[0].toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </Select>
            </label>
            {isAdmin && !editing && (
              <label className="text-sm font-medium">
                Workspace owner
                <Select
                  value={form.ownerId}
                  onChange={(event) => setValue("ownerId", event.target.value)}
                  className="mt-1"
                >
                  <option value={currentUserId}>My workspace</option>
                  {activeMembers
                    .filter((member) => member.id !== currentUserId)
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name}
                      </option>
                    ))}
                </Select>
              </label>
            )}
            <label className="text-sm font-medium md:col-span-2">
              Notes
              <Textarea
                maxLength={5000}
                rows={4}
                value={form.notes}
                onChange={(event) => setValue("notes", event.target.value)}
                className="mt-1"
                placeholder="Outreach history, placement preferences, or other useful context"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2 md:col-span-2">
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </Button>
              <Button disabled={saving} className="disabled:opacity-60">
                {saving ? "Saving…" : editing ? "Save changes" : "Add partner"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {confirmDelete && (
        <ConfirmDialog
          open
          title={`Delete ${confirmDelete.name}?`}
          description="This permanently removes this partner from its workspace."
          confirmLabel="Delete partner"
          busy={saving}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void remove(confirmDelete)}
        />
      )}
    </div>
  );
}
