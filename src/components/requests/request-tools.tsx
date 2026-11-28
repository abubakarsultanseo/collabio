"use client";

import { useRef, useState } from "react";
import { requestStatuses } from "@/lib/request-statuses";
import { ChevronDown } from "lucide-react";
import { StatusBadge, formatStatus } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function placementDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "Placement";
  }
}

export function InlineStatus({
  status,
  enabled,
  busy,
  guestPost,
  liveUrl,
  onSave,
}: {
  status: string;
  enabled?: boolean;
  busy?: boolean;
  guestPost?: boolean;
  liveUrl?: string | null;
  onSave: (
    status: string,
    reason?: string,
    liveUrl?: string,
  ) => Promise<boolean>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState("");
  const publishedInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState<string | null>(null);

  async function save(value: string, why?: string, url?: string) {
    setSaving(value);
    try {
      if (await onSave(value, why, url)) {
        setRejecting(false);
        setPublishOpen(false);
        setReason("");
      }
    } finally {
      setSaving(null);
    }
  }

  function selectStatus(value: string) {
    if (value === "rejected") setRejecting(true);
    else if (value === "live" && guestPost) {
      setPublishedUrl(liveUrl ?? "");
      setPublishOpen(true);
    } else void save(value);
  }

  if (!enabled) return <StatusBadge status={status} />;

  return (
    <>
      <Menu.Root>
        <Menu.Trigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 px-1"
            aria-label={`Change request status: ${formatStatus(saving ?? status)}`}
            disabled={busy || !!saving}
          >
            <StatusBadge status={saving ?? status} />
            <ChevronDown size={13} aria-hidden />
          </Button>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            align="start"
            sideOffset={4}
            className="z-50 max-h-72 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg"
          >
            {requestStatuses.map((value) => (
              <Menu.Item
                key={value}
                disabled={value === status && !(guestPost && value === "live")}
                className="cursor-pointer rounded p-1 outline-none data-[highlighted]:bg-[var(--canvas)] data-[disabled]:opacity-50"
                onSelect={() => selectStatus(value)}
              >
                {guestPost && value === "live" && status === "live" ? (
                  <span className="px-2 text-xs">
                    {liveUrl ? "Edit published link" : "Add published link"}
                  </span>
                ) : (
                  <StatusBadge status={value} />
                )}
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      {saving && (
        <span role="status" className="sr-only">
          Saving status
        </span>
      )}
      <Dialog
        open={publishOpen}
        onOpenChange={(open) => {
          if (!saving) setPublishOpen(open);
        }}
      >
        <DialogContent
          title={
            status === "live" ? "Published guest post" : "Mark guest post Live"
          }
          description="Enter the URL of the published article for this link."
          initialFocus={publishedInput}
          closeDisabled={!!saving}
        >
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (publishedUrl.trim())
                void save("live", undefined, publishedUrl.trim());
            }}
          >
            <label className="block text-sm font-medium">
              Published article URL
              <Input
                ref={publishedInput}
                type="url"
                required
                maxLength={2048}
                className="mt-1"
                placeholder="https://publisher.com/published-article"
                value={publishedUrl}
                onChange={(event) => setPublishedUrl(event.target.value)}
              />
            </label>
            <div className="flex justify-end">
              <Button type="submit" disabled={!!saving || !publishedUrl.trim()}>
                {saving
                  ? "Saving…"
                  : status === "live"
                    ? "Save link"
                    : "Save link and mark Live"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={rejecting}
        onOpenChange={(open) => {
          if (!saving) setRejecting(open);
        }}
      >
        <DialogContent
          title="Reject request"
          description="The other participant can see this reason in the request history."
          closeDisabled={!!saving}
        >
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (reason.trim()) void save("rejected", reason.trim());
            }}
          >
            <label className="block text-sm font-medium">
              Reason
              <Textarea
                className="mt-1"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                maxLength={2000}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={!!saving}
                onClick={() => {
                  setRejecting(false);
                  setReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={!!saving || !reason.trim()}
              >
                {saving ? "Saving…" : "Reject request"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
