import type { ReactNode } from "react";
import { Brand } from "@/components/app/brand";

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center p-5">
      <section className="page-enter w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
        <Brand />
        <h1 className="mt-6 text-2xl font-bold">{title}</h1>
        <p className="mb-6 mt-2 text-sm text-[var(--muted)]">{description}</p>
        {children}
      </section>
    </main>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-xl bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--red)]"
    >
      {children}
    </p>
  );
}
