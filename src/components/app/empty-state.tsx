import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  children?: ReactNode;
}) {
  return (
    <div className="os-card px-5 py-9 text-center">
      <Icon size={22} className="mx-auto text-[var(--muted)]" aria-hidden />
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{hint}</p>
      {children}
    </div>
  );
}
