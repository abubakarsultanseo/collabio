"use client";
import { useToast } from "@/components/app/toast";
import { useCallback, useEffect, useState } from "react";

type PermissionKey =
  | "view_requests"
  | "add_new_requests"
  | "edit_own_requests"
  | "edit_admin_requests"
  | "edit_partner_requests"
  | "update_request_status"
  | "add_comments"
  | "delete_requests"
  | "view_activity_history"
  | "download_reports";
type PermissionSet = Record<PermissionKey, boolean>;
type Partner = {
  id: string;
  full_name: string;
  email: string;
  account_status: string;
  permissions: PermissionSet;
};
type HistoryRow = {
  id: string;
  partner_id: string;
  partner_name: string;
  changed_by: string;
  previous_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  changed_at: string;
};
const permissionLabels: Record<PermissionKey, string> = {
  view_requests: "View requests",
  add_new_requests: "Add new requests",
  edit_own_requests: "Edit own requests",
  edit_admin_requests: "Edit admin requests",
  edit_partner_requests: "Edit partner requests",
  update_request_status: "Update request status",
  add_comments: "Add comments",
  delete_requests: "Delete requests",
  view_activity_history: "View activity history",
  download_reports: "Download reports",
};
const permissionDefaults: PermissionSet = {
  view_requests: true,
  add_new_requests: true,
  edit_own_requests: true,
  edit_admin_requests: false,
  edit_partner_requests: false,
  update_request_status: true,
  add_comments: true,
  delete_requests: false,
  view_activity_history: true,
  download_reports: false,
};

export default function PermissionsManager() {
  const notify = useToast();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/permissions", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not load permissions.");
      setPartners(data.partners ?? []);
      setHistory(data.history ?? []);
      setLoadFailed(false);
    } catch (caught) {
      setLoadFailed(true);
      notify(
        caught instanceof Error
          ? caught.message
          : "Could not load permissions.",
        "error",
      );
    }
  }, [notify]);
  useEffect(() => {
    void load();
  }, [load]);
  async function change(partner: Partner, key: PermissionKey, value: boolean) {
    setBusy(partner.id);
    try {
      const response = await fetch("/api/permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: partner.id,
          permissions: { [key]: value },
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not update permission.");
      setPartners((current) =>
        current.map((item) =>
          item.id === partner.id
            ? { ...item, permissions: data.permissions }
            : item,
        ),
      );
      notify(`Permissions updated for ${partner.full_name}.`, "success");
    } catch (caught) {
      notify(
        caught instanceof Error
          ? caught.message
          : "Could not update permission.",
        "error",
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-4">
      {partners.length === 0 && !loadFailed ? (
        <div className="panel muted p-6 text-sm">
          No partner accounts found.
        </div>
      ) : (
        partners.map((partner) => (
          <section key={partner.id} className="panel p-5">
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div>
                <h2 className="font-semibold">{partner.full_name}</h2>
                <p className="muted mt-1 text-sm">
                  {partner.email} · {partner.account_status}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">
                Permissions apply immediately
              </span>
            </header>
            <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(permissionLabels) as PermissionKey[]).map((key) => (
                <label
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-slate-50"
                >
                  <span>
                    {permissionLabels[key]}
                    {key === "delete_requests" && (
                      <span className="muted ml-1">(default off)</span>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={
                      partner.permissions[key] ?? permissionDefaults[key]
                    }
                    disabled={busy === partner.id}
                    onChange={(event) =>
                      void change(partner, key, event.target.checked)
                    }
                    className="h-4 w-4 accent-blue-700"
                  />
                </label>
              ))}
            </div>
          </section>
        ))
      )}
      <section className="panel overflow-hidden">
        <div className="border-b p-4">
          <h2 className="font-semibold">Permission change history</h2>
          <p className="muted mt-1 text-xs">
            Recent changes include the previous and new settings.
          </p>
        </div>
        {history.length === 0 ? (
          <p className="muted p-4 text-sm">
            No permission changes recorded yet.
          </p>
        ) : (
          <div className="divide-y">
            {history.map((item) => (
              <article
                key={item.id}
                className="flex flex-wrap justify-between gap-2 p-4 text-sm"
              >
                <span>
                  <b>{item.partner_name}</b>
                  <span className="muted"> · Permissions updated</span>
                </span>
                <time className="muted text-xs">
                  {new Date(item.changed_at).toLocaleString()}
                </time>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
