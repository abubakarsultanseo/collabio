import { requireUser } from "@/server/auth";
import { getProfile } from "@/server/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import PartnershipsWorkspace from "@/components/partnerships-workspace";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
export default async function PartnershipsPage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const isAdmin = profile?.role === "admin";
  const db = createAdminClient();
  const partnershipQuery = db
    .from("partnerships")
    .select("id,name,user_a_id,user_b_id,created_at")
    .order("created_at", { ascending: false });
  const [{ data: partnerships }, { data: people }] = await Promise.all([
    isAdmin
      ? partnershipQuery
      : partnershipQuery.or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`),
    isAdmin
      ? db
          .from("profiles")
          .select("id,full_name,email")
          .eq("role", "partner")
          .eq("account_status", "active")
          .order("full_name")
          .limit(250)
      : Promise.resolve({ data: [] }),
  ]);
  return (
    <div className="page-enter mx-auto max-w-6xl space-y-6">
      <Link href="/dashboard" className="text-sm text-[var(--brand-dark)]">
        ← Dashboard
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Collaborations</h1>
          <p className="text-[var(--muted)] mt-2 text-sm">
            Each partner and admin share one workspace for requests in both
            directions.
          </p>
        </div>
        {isAdmin && (
          <Link href="#create-workspace" className={buttonVariants()}>
            Create workspace
          </Link>
        )}
      </header>
      <PartnershipsWorkspace
        people={people ?? []}
        partnerships={partnerships ?? []}
        currentUserId={user.id}
        isAdmin={isAdmin}
      />
    </div>
  );
}
