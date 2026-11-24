import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/server/auth";
import { getProfile } from "@/server/profile";
export default async function SettingsPage() {
  const user = await requireAdmin();
  const profile = await getProfile(user.id);
  return (
    <div className="page-enter mx-auto max-w-4xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-[var(--muted)] mt-2 text-sm">
            Your Collabio account and workspace access.
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <Button type="submit">Sign out</Button>
        </form>
      </header>
      <section className="os-card p-5 md:p-6">
        <h2 className="font-semibold">Profile</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--muted)]">Name</dt>
            <dd className="mt-1">{profile?.full_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Email</dt>
            <dd className="mt-1">{user.email}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Role</dt>
            <dd className="mt-1 capitalize">{profile?.role ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Account status</dt>
            <dd className="mt-1 capitalize">
              {profile?.account_status ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Timezone</dt>
            <dd className="mt-1">Asia/Karachi</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
