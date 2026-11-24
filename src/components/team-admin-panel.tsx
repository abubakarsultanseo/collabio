"use client";
import { useToast } from "@/components/app/toast";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useCallback, useEffect, useState } from "react";

type Member = {
  id: string;
  full_name: string;
  email: string;
  company: string | null;
  role: "admin" | "partner";
  account_status: "active" | "deactivated" | "pending";
  created_at: string;
};
type Invitation = {
  id: string;
  email: string;
  full_name: string;
  company: string | null;
  status: string;
  expires_at: string;
  created_at: string;
};

export default function TeamAdminPanel() {
  const notify = useToast();
  const [deactivateTarget, setDeactivateTarget] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/team", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load team.");
      setMembers(data.members ?? []);
      setInvitations(data.invitations ?? []);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not load team.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [notify]);
  useEffect(() => {
    void load();
  }, [load]);
  async function updateMember(
    member: Member,
    change: {
      role?: "admin" | "partner";
      accountStatus?: "active" | "deactivated";
    },
  ) {
    setBusy(member.id);
    try {
      const response = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.id, ...change }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not update member.");
      setMembers((current) =>
        current.map((item) => (item.id === member.id ? data.member : item)),
      );
      setDeactivateTarget(null);
      notify(`${member.full_name}'s access was updated.`, "success");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not update member.",
        "error",
      );
    } finally {
      setBusy(null);
    }
  }
  const pending = invitations.filter(
    (item) =>
      item.status === "pending" &&
      new Date(item.expires_at).getTime() > Date.now(),
  );
  return (
    <>
      <section className="panel p-5 md:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">Team members</h2>
            <p className="muted mt-1 text-sm">
              Manage admin roles and account access.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <p className="muted text-sm">Loading team…</p>
        ) : members.length === 0 ? (
          <p className="muted text-sm">No team accounts found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-3 pr-4">Member</th>
                  <th className="py-3 pr-4">Company</th>
                  <th className="py-3 pr-4">Role</th>
                  <th className="py-3 pr-4">Account</th>
                  <th className="py-3">Access actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-b last:border-0">
                    <td className="py-3 pr-4">
                      <span className="block font-medium">
                        {member.full_name}
                      </span>
                      <span className="muted text-xs">{member.email}</span>
                    </td>
                    <td className="py-3 pr-4">{member.company || "—"}</td>
                    <td className="py-3 pr-4">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs capitalize">
                        {member.role}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs capitalize ${member.account_status === "active" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
                      >
                        {member.account_status}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        {member.role === "partner" ? (
                          <button
                            disabled={busy === member.id}
                            onClick={() =>
                              void updateMember(member, { role: "admin" })
                            }
                            className="rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-50"
                          >
                            Make admin
                          </button>
                        ) : (
                          <button
                            disabled={busy === member.id}
                            onClick={() =>
                              void updateMember(member, { role: "partner" })
                            }
                            className="rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-50"
                          >
                            Make partner
                          </button>
                        )}
                        {member.account_status === "active" ? (
                          <button
                            disabled={busy === member.id}
                            onClick={() => setDeactivateTarget(member)}
                            className="rounded-lg border border-[var(--red)] px-2.5 py-1.5 text-xs text-[var(--red)] disabled:opacity-50"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            disabled={busy === member.id}
                            onClick={() =>
                              void updateMember(member, {
                                accountStatus: "active",
                              })
                            }
                            className="rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs text-emerald-800 disabled:opacity-50"
                          >
                            Activate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel mt-5 p-5 md:p-6">
        <div className="mb-4">
          <h2 className="font-semibold">Pending invitations</h2>
          <p className="muted mt-1 text-sm">
            Invitations expire after 48 hours by default.
          </p>
        </div>
        {pending.length === 0 ? (
          <p className="muted text-sm">No unexpired invitations are pending.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-3 pr-4">Invitee</th>
                  <th className="py-3 pr-4">Company</th>
                  <th className="py-3 pr-4">Sent</th>
                  <th className="py-3">Expires</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((invite) => (
                  <tr key={invite.id} className="border-b last:border-0">
                    <td className="py-3 pr-4">
                      <span className="block font-medium">
                        {invite.full_name}
                      </span>
                      <span className="muted text-xs">{invite.email}</span>
                    </td>
                    <td className="py-3 pr-4">{invite.company || "—"}</td>
                    <td className="py-3 pr-4">
                      {new Date(invite.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3">
                      {new Date(invite.expires_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {deactivateTarget && (
        <ConfirmDialog
          open
          title={`Deactivate ${deactivateTarget.full_name}?`}
          description="This removes the member’s access until their account is activated again."
          confirmLabel="Deactivate account"
          busy={busy === deactivateTarget.id}
          onCancel={() => setDeactivateTarget(null)}
          onConfirm={() =>
            void updateMember(deactivateTarget, {
              accountStatus: "deactivated",
            })
          }
        />
      )}
    </>
  );
}
