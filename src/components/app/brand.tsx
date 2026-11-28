import { ArrowLeftRight } from "lucide-react";

export function Brand() {
  return (
    <span className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand-dark)]">
        <ArrowLeftRight size={19} aria-hidden />
      </span>
      <span>
        <span className="block text-sm font-bold">Collabio</span>
        <span className="block text-xs text-[var(--muted)]">
          Partner outreach workspace
        </span>
      </span>
    </span>
  );
}
