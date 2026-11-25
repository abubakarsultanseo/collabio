"use client";

import Image from "next/image";
import { useState } from "react";
import { googleAvatar } from "@/lib/avatar";
import { cn } from "@/lib/utils";

export function Avatar({
  name,
  url,
  className,
}: {
  name: string;
  url?: string | null;
  className?: string;
}) {
  const source = googleAvatar(url);
  const [failed, setFailed] = useState<string | null>(null);
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--brand-soft)] text-xs font-semibold text-[var(--brand-dark)]",
        className,
      )}
    >
      {source && source !== failed ? (
        <Image
          alt=""
          src={source}
          fill
          unoptimized
          sizes="36px"
          referrerPolicy="no-referrer"
          className="object-cover"
          onError={() => setFailed(source)}
        />
      ) : (
        initials || "C"
      )}
    </span>
  );
}
