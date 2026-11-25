import { StatusBadge } from "@/components/status-badge";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Inbox,
  Send,
  Users,
} from "lucide-react";
import { requireUser } from "@/server/auth";
import { getProfile } from "@/server/profile";
import { requestLabel } from "@/lib/request-content";
import { missingColumn } from "@/lib/supabase/schema-error";
import { createAdminClient } from "@/lib/supabase/admin";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  }).format(new Date(value));
}

export default async function Dashboard() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const adminView = profile?.role === "admin";
  const db = createAdminClient();
  const partnershipQuery = db
    .from("partnerships")
    .select("id,name,user_a_id,user_b_id,created_at")
    .order("created_at", { ascending: false });
  const { data: partnerships, error: partnershipError } = adminView
    ? await partnershipQuery
    : await partnershipQuery.or(
        `user_a_id.eq.${user.id},user_b_id.eq.${user.id}`,
      );
  if (partnershipError) throw new Error(partnershipError.message);
  const rows = partnerships ?? [];
  const ids = rows.map((row) => row.id);
  const requestFields =
    "id,partnership_id,sender_id,receiver_id,partner_id,status,anchor_text,placement_page_url,deadline_at,first_viewed_at,was_overdue,created_at,request_type";
  async function loadRequests() {
    if (!ids.length) return { data: [], error: null };
    const result = await db
      .from("requests")
      .select(`${requestFields},import_key,import_date_unknown`)
      .in("partnership_id", ids)
      .order("created_at", { ascending: false })
      .limit(200);
    if (
      !missingColumn(result.error, "import_key") &&
      !missingColumn(result.error, "import_date_unknown")
    )
      return result;
    const legacyQuery = db.from("requests");
    const legacy = await (
      missingColumn(result.error, "import_key")
        ? legacyQuery.select(requestFields)
        : legacyQuery.select(`${requestFields},import_key`)
    )
      .in("partnership_id", ids)
      .order("created_at", { ascending: false })
      .limit(200);
    return {
      data:
        legacy.data?.map((row) => ({
          ...row,
          import_key: "import_key" in row ? row.import_key : null,
          import_date_unknown: false,
        })) ?? [],
      error: legacy.error,
    };
  }

  const [
    { data: requests, error: requestsError },
    { count: activePartnerCount, error: countError },
  ] = await Promise.all([
    loadRequests(),
    adminView
      ? db
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "partner")
          .eq("account_status", "active")
      : Promise.resolve({ count: 1, error: null }),
  ]);
  if (requestsError) throw new Error(requestsError.message);
  if (countError) throw new Error(countError.message);
  const all = requests ?? [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const receivedToday = all.filter(
    (row) =>
      !row.import_date_unknown &&
      row.receiver_id === user.id &&
      new Date(row.created_at) >= today,
  ).length;
  const sentToday = all.filter(
    (row) =>
      !row.import_date_unknown &&
      row.sender_id === user.id &&
      new Date(row.created_at) >= today,
  ).length;
  const awaitingReview = all.filter(
    (row) =>
      row.receiver_id === user.id &&
      !row.import_key &&
      !row.first_viewed_at &&
      row.status === "new_request",
  ).length;
  const overdue = all.filter(
    (row) =>
      row.was_overdue ||
      row.status === "overdue" ||
      (!row.import_key &&
        new Date(row.deadline_at) < new Date() &&
        !row.first_viewed_at),
  ).length;
  const live = all.filter((row) => row.status === "live").length;
  const recent = all.slice(0, 8);
  const partnerStats = rows.map((partnership) => {
    const counterpartId =
      partnership.user_a_id === user.id
        ? partnership.user_b_id
        : partnership.user_a_id;
    const count = all.filter(
      (row) => row.partnership_id === partnership.id,
    ).length;
    const inbound = all.filter(
      (row) =>
        row.partnership_id === partnership.id && row.receiver_id === user.id,
    ).length;
    const outbound = all.filter(
      (row) =>
        row.partnership_id === partnership.id && row.sender_id === user.id,
    ).length;
    return {
      id: partnership.id,
      name: partnership.name,
      counterpartId,
      count,
      inbound,
      outbound,
    };
  });
  const profileIds = [
    ...new Set(recent.flatMap((row) => [row.sender_id, row.receiver_id])),
  ];
  const { data: people } = profileIds.length
    ? await db
        .from("profiles")
        .select("id,full_name,email")
        .in("id", profileIds)
    : { data: [] };
  const personMap = Object.fromEntries(
    (people ?? []).map((person) => [person.id, person]),
  );
  const statCards = adminView
    ? [
        {
          label: "Active Partners",
          value: activePartnerCount ?? 0,
          icon: Users,
          color: "text-[var(--brand-dark)]",
        },
        {
          label: "Total Requests",
          value: all.length,
          icon: Inbox,
          color: "text-[var(--brand-dark)]",
        },
        {
          label: "Live Placements",
          value: live,
          icon: CheckCircle2,
          color: "text-[var(--green)]",
        },
        {
          label: "Overdue Requests",
          value: overdue,
          icon: Clock3,
          color: "text-[var(--red)]",
        },
      ]
    : [
        {
          label: "Requests Received",
          value: all.filter((row) => row.receiver_id === user.id).length,
          icon: Inbox,
          color: "text-[var(--brand-dark)]",
        },
        {
          label: "Requests Sent",
          value: all.filter((row) => row.sender_id === user.id).length,
          icon: Send,
          color: "text-[var(--brand-dark)]",
        },
        {
          label: "Live Placements",
          value: live,
          icon: CheckCircle2,
          color: "text-[var(--green)]",
        },
        {
          label: "Pending & Overdue",
          value: overdue,
          icon: Clock3,
          color: "text-[var(--red)]",
        },
      ];
  const quickActions = [
    {
      label: "Send a request",
      href: "/partnerships",
      icon: Send,
      detail: "Choose a workspace and submit placement details.",
    },
    {
      label: "Review received requests",
      href: "/requests/inbox",
      icon: Inbox,
      detail: "Review a request, change its status, or reply.",
    },
    {
      label: "Track sent requests",
      href: "/requests/sent",
      icon: Clock3,
      detail: "Check statuses, discussions, and deadlines.",
    },
  ];

  return (
    <div className="page-enter mx-auto max-w-[1440px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {adminView
              ? "Admin Dashboard"
              : "Welcome back, " + (profile?.full_name ?? user.email)}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {adminView
              ? "See what needs attention and manage partner requests."
              : "See incoming requests, track work, and contact your partners."}
          </p>
        </div>
        <Link href="/partnerships" className={buttonVariants()}>
          Send a request <ArrowUpRight size={16} aria-hidden />
        </Link>
      </header>

      <section
        aria-label="Workspace metrics"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {statCards.map(({ label, value, icon: Icon, color }) => {
          const problem = color === "text-[var(--red)]" && value > 0;
          const contents = (
            <>
              <Icon className={color} size={19} aria-hidden />
              <p className="mt-4 text-3xl font-bold">{value}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">{label}</p>
            </>
          );
          return problem ? (
            <Link
              key={label}
              href="/pending-overdue"
              className="rounded-2xl border border-[var(--red)] bg-[var(--danger-bg)] p-5 shadow-sm motion-safe:transition-transform motion-safe:hover:-translate-y-0.5"
            >
              {contents}
            </Link>
          ) : (
            <article key={label} className="os-card p-5">
              {contents}
            </article>
          );
        })}
      </section>

      <section aria-label="Quick actions" className="grid gap-3 md:grid-cols-3">
        {quickActions.map(({ label, href, detail, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            className="os-card os-card-interactive flex min-w-0 flex-col gap-2 p-5"
          >
            <span className="flex items-center justify-between text-[var(--brand-dark)]">
              <Icon size={19} aria-hidden />
              <ArrowUpRight size={16} aria-hidden />
            </span>
            <span className="mt-1 font-semibold">{label}</span>
            <span className="text-sm text-[var(--muted)]">{detail}</span>
          </Link>
        ))}
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <article className="os-card min-w-0 overflow-hidden">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-5">
            <h2 className="font-semibold">Recent requests</h2>
            <Link
              href="/requests/inbox"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              View inbox
            </Link>
          </header>
          {recent.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Inbox}
                title="No requests yet"
                hint="Open a partner workspace to send the first request."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="os-table w-full min-w-[460px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    {["Request", "Partner", "Status"].map((label) => (
                      <th key={label} scope="col" className="px-4 py-3">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {recent.map((row) => {
                    const sent = row.sender_id === user.id;
                    const peer =
                      personMap[sent ? row.receiver_id : row.sender_id];
                    const anchor = requestLabel(row);
                    return (
                      <tr key={row.id}>
                        <td className="px-4 py-3">
                          <Link
                            href={sent ? "/requests/sent" : "/requests/inbox"}
                            title={anchor}
                            className="block max-w-56 truncate font-semibold text-[var(--brand-dark)]"
                          >
                            {anchor}
                          </Link>
                          <time
                            dateTime={row.created_at}
                            className="whitespace-nowrap text-xs text-[var(--muted)]"
                          >
                            {row.import_date_unknown
                              ? "Original date unavailable"
                              : formatDate(row.created_at)}
                          </time>
                        </td>
                        <td className="px-4 py-3">
                          {sent ? "To" : "From"} {peer?.full_name ?? "Partner"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={row.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="os-card p-5">
          <h2 className="font-semibold">Today &amp; deadlines</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              {
                label: "Waiting to be seen",
                count: awaitingReview,
                href: "/requests/inbox",
                tone: "border-[var(--amber)] bg-[var(--warning-bg)] text-[var(--amber)]",
              },
              { label: "Received today", count: receivedToday },
              { label: "Sent today", count: sentToday },
              {
                label: "Overdue",
                count: overdue,
                href: "/pending-overdue",
                tone: "border-[var(--red)] bg-[var(--danger-bg)] text-[var(--red)]",
              },
            ].map(({ label, count, href, tone }) => {
              const content = (
                <>
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="mt-1 text-xs">{label}</p>
                </>
              );
              return href && count > 0 ? (
                <Link
                  key={label}
                  href={href}
                  className={cn(
                    "rounded-xl border p-4 motion-safe:transition-transform motion-safe:hover:-translate-y-0.5",
                    tone,
                  )}
                >
                  {content}
                </Link>
              ) : (
                <div key={label} className="rounded-xl bg-[var(--canvas)] p-4">
                  {content}
                </div>
              );
            })}
          </div>
          <Link
            href="/pending-overdue"
            className="mt-4 inline-block text-sm font-semibold text-[var(--brand-dark)]"
          >
            Review pending &amp; overdue →
          </Link>
        </article>
      </section>

      <section className="space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Partner workspaces</h2>
          <Link
            href="/partnerships"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            All workspaces
          </Link>
        </header>
        {partnerStats.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No active partner workspaces"
            hint="Accepting a partner invitation will create a workspace."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {partnerStats.map((partner) => (
              <Link
                key={partner.id}
                href={`/partnerships/${partner.id}`}
                className="os-card os-card-interactive min-w-0 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate font-semibold" title={partner.name}>
                    {partner.name}
                  </h3>
                  <ArrowUpRight
                    size={15}
                    className="shrink-0 text-[var(--muted)]"
                    aria-hidden
                  />
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {partner.inbound} received · {partner.outbound} sent
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
