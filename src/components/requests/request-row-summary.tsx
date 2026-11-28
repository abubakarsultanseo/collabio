"use client";

import { ArrowUpRight, Copy } from "lucide-react";
import { useToast } from "@/components/app/toast";
import { requestLabel, type RequestContent } from "@/lib/request-content";
import { placementDomain } from "@/components/requests/request-tools";
import { cn } from "@/lib/utils";

type SummaryRow = Pick<
  RequestContent,
  | "anchor_text"
  | "target_link"
  | "placement_page_url"
  | "request_type"
  | "live_url"
> & { request_code: number; status: string };

function webUrl(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function RequestRowSummary({
  row,
  className,
}: {
  row: SummaryRow;
  className?: string;
}) {
  const notify = useToast();
  const publishedUrl =
    row.request_type === "guest_post" && row.status === "live"
      ? webUrl(row.live_url)
      : undefined;
  const placementUrl = publishedUrl ?? webUrl(row.placement_page_url);
  const domain = placementDomain(row.placement_page_url);
  const anchor = row.anchor_text;
  const target = row.target_link;

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${label} copied.`);
    } catch {
      notify("Could not copy to the clipboard.", "error");
    }
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex min-w-0 items-center gap-1 font-semibold">
        <span className="shrink-0">#{row.request_code} ·</span>
        {placementUrl ? (
          <a
            href={placementUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={placementUrl}
            className="inline-flex min-w-0 items-center gap-1 rounded hover:underline"
          >
            <span className="truncate">{domain}</span>
            <ArrowUpRight size={13} aria-hidden="true" className="shrink-0" />
            <span className="sr-only">
              {publishedUrl
                ? " (open published article in a new tab)"
                : " (open placement in a new tab)"}
            </span>
          </a>
        ) : (
          <span className="truncate">{domain}</span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-1 text-xs text-[var(--muted)]">
        <span
          className={cn(
            "flex min-w-0 items-center gap-0.5",
            target && "max-w-[55%]",
          )}
        >
          <span className="truncate" title={requestLabel(row)}>
            {requestLabel(row)}
          </span>
          {anchor && (
            <button
              type="button"
              aria-label="Copy anchor text"
              title="Copy anchor text"
              onClick={() => void copy(anchor, "Anchor text")}
              className="inline-grid size-6 shrink-0 place-items-center rounded hover:bg-[var(--canvas)] hover:text-[var(--text)]"
            >
              <Copy size={12} aria-hidden="true" />
            </button>
          )}
        </span>
        {target && (
          <>
            <span aria-hidden="true" className="shrink-0">
              •
            </span>
            <span className="inline-flex min-w-0 items-center gap-0.5">
              <span className="truncate" title={target}>
                {target.replace(/^https?:\/\//i, "")}
              </span>
              <button
                type="button"
                aria-label="Copy target URL"
                title="Copy target URL"
                onClick={() => void copy(target, "Target URL")}
                className="inline-grid size-6 shrink-0 place-items-center rounded hover:bg-[var(--canvas)] hover:text-[var(--text)]"
              >
                <Copy size={12} aria-hidden="true" />
              </button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
