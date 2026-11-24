import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { requireAdmin } from "@/server/auth";
import PermissionsManager from "@/components/permissions-manager";

export default async function PermissionsPage() {
  await requireAdmin();
  return (
    <div className="page-enter mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Partner Permissions</h1>
          <p className="text-[var(--muted)] mt-2 text-sm">
            Manage what each partner can view and change. Updates take effect
            immediately.
          </p>
        </div>
        <Link href="/team" className={buttonVariants()}>
          Manage team
        </Link>
      </header>
      <PermissionsManager />
    </div>
  );
}
