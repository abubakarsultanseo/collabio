"use client";
import { EmptyState } from "@/components/app/empty-state";
import { BarChart3 } from "lucide-react";
import { Input } from "@/components/ui/input";

import { useToast } from "@/components/app/toast";
import { StatusBadge } from "@/components/status-badge";
import { useEffect, useState } from "react";
type Report = {
  month: string;
  summary: {
    total: number;
    sent: number;
    received: number;
    live: number;
    overdue: number;
    accepted: number;
    rejected: number;
  };
  partners: Array<{
    id: string;
    name: string;
    total: number;
    sent: number;
    received: number;
    live: number;
    overdue: number;
  }>;
  statuses: Array<{ status: string; count: number }>;
};
const currentMonth = new Date().toISOString().slice(0, 7);
export default function MonthlyReportsWorkspace() {
  const notify = useToast();
  const [month, setMonth] = useState(currentMonth);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/reports/monthly?month=${month}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Could not load report.");
        if (alive) {
          setReport(data);
        }
      })
      .catch((caught) => {
        if (alive)
          notify(
            caught instanceof Error ? caught.message : "Could not load report.",
            "error",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [month, notify]);
  const cards = report
    ? [
        { label: "Requests created", value: report.summary.total },
        { label: "Sent by me", value: report.summary.sent },
        { label: "Received by me", value: report.summary.received },
        { label: "Live placements", value: report.summary.live },
        { label: "Overdue", value: report.summary.overdue },
        { label: "Accepted", value: report.summary.accepted },
      ]
    : [];
  return (
    <div className="page-enter mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Monthly Reports</h1>
          <p className="text-[var(--muted)] mt-2 text-sm">
            Review request activity for a month and compare your partner
            workspaces.
          </p>
        </div>
        <label className="text-sm font-medium">
          Report month
          <Input
            className="mt-1"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
      </header>
      {loading ? (
        <section className="os-card p-8 text-center text-sm text-[var(--muted)]">
          Loading monthly report…
        </section>
      ) : (
        report && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((card) => (
                <article key={card.label} className="os-card p-5">
                  <p className="text-[var(--muted)] text-sm">{card.label}</p>
                  <p className="mt-3 text-3xl font-bold">{card.value}</p>
                </article>
              ))}
            </section>
            <section className="grid gap-5 lg:grid-cols-2">
              <article className="os-card overflow-hidden">
                <div className="border-b p-5">
                  <h2 className="font-semibold">
                    Partner workspace performance
                  </h2>
                  <p className="text-[var(--muted)] mt-1 text-sm">
                    Request volume and outcomes for {month}.
                  </p>
                </div>
                {report.partners.length === 0 ? (
                  <div className="p-3">
                    <EmptyState
                      icon={BarChart3}
                      title="No requests this month"
                      hint="Choose another month to review earlier activity."
                    />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="os-table w-full min-w-[620px] text-left text-sm">
                      <thead className="bg-[var(--canvas)] text-xs text-[var(--muted)]">
                        <tr>
                          {[
                            "Workspace",
                            "Total",
                            "Sent",
                            "Received",
                            "Live",
                            "Overdue",
                          ].map((item) => (
                            <th className="px-4 py-3 font-medium" key={item}>
                              {item}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {report.partners.map((partner) => (
                          <tr key={partner.id}>
                            <td className="px-4 py-3 font-medium">
                              {partner.name}
                            </td>
                            <td className="px-4 py-3">{partner.total}</td>
                            <td className="px-4 py-3">{partner.sent}</td>
                            <td className="px-4 py-3">{partner.received}</td>
                            <td className="px-4 py-3">{partner.live}</td>
                            <td className="px-4 py-3">{partner.overdue}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
              <article className="os-card p-5">
                <h2 className="font-semibold">Request status breakdown</h2>
                <p className="text-[var(--muted)] mt-1 text-sm">
                  Current status of requests created during this month.
                </p>
                {report.statuses.length === 0 ? (
                  <div className="p-3">
                    <EmptyState
                      icon={BarChart3}
                      title="No status activity"
                      hint="Status totals appear when the month has requests."
                    />
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    {report.statuses.map((item) => (
                      <div key={item.status}>
                        <div className="mb-1 flex justify-between gap-3 text-sm">
                          <StatusBadge status={item.status} />
                          <span className="font-semibold">{item.count}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[var(--canvas)]">
                          <div
                            className="h-full rounded-full bg-[var(--brand)]"
                            style={{
                              width: `${Math.max(5, report.summary.total ? (item.count / report.summary.total) * 100 : 0)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </section>
          </>
        )
      )}
    </div>
  );
}
