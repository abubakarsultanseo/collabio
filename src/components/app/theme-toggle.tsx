"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setDark(next === "dark");
    try {
      localStorage.setItem("collabio-theme", next);
    } catch {
      // The selected theme still applies until the next reload.
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark theme"
      onClick={toggle}
      className="relative flex h-7 w-12 shrink-0 items-center rounded-full border border-[var(--border)] bg-[var(--canvas)] p-0.5"
    >
      <span
        className={cn(
          "grid size-5 place-items-center rounded-full bg-[var(--card)] text-[var(--muted)] shadow-sm motion-safe:transition-transform",
          dark && "translate-x-5",
        )}
      >
        {dark ? <Moon size={12} aria-hidden /> : <Sun size={12} aria-hidden />}
      </span>
    </button>
  );
}
