import { requireAdmin } from "@/server/auth";
import { InvitePartnerDialog } from "@/components/app/invite-partner-dialog";
import TeamAdminPanel from "@/components/team-admin-panel";

export default async function TeamPage() {
  await requireAdmin();

  return (
    <div className="page-enter mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Team &amp; Invitations</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Invite partners, review invitations, and manage access.
          </p>
        </div>
        <InvitePartnerDialog />
      </header>
      <TeamAdminPanel />
    </div>
  );
}
