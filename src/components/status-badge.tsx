import { cn } from "@/lib/utils";

const statusTones: Record<string, string> = {
  live: "success",
  accepted: "success",
  new_request: "info",
  seen: "info",
  reviewing: "info",
  in_progress: "info",
  shared: "info",
  waiting_for_partner: "info",
  hold: "warning",
  rejected: "danger",
  cancelled: "danger",
  removed: "warning",
  overdue: "danger",
};

const toneClasses: Record<string, string> = {
  success: "bg-[var(--success-bg)] text-[var(--green)]",
  info: "bg-[var(--info-bg)] text-[var(--brand-dark)]",
  warning: "bg-[var(--warning-bg)] text-[var(--amber)]",
  danger: "bg-[var(--danger-bg)] text-[var(--red)]",
};

export function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone =
    toneClasses[statusTones[status]] ??
    "bg-[var(--canvas)] text-[var(--muted)]";

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize",
        tone,
        className,
      )}
    >
      {formatStatus(status)}
    </span>
  );
}
