"use client";

import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  isDocumentRequest,
  maxRequestsPerSubmission,
  originalAndEdited,
  requestTypes,
  requestTypeLabels,
  type RequestContent,
} from "@/lib/request-content";

type Initial = RequestContent & { notes?: string | null };

export function RequestContentFields({
  row,
  allowUpload = true,
}: {
  row?: Initial;
  allowUpload?: boolean;
}) {
  const [type, setType] = useState(row?.request_type ?? "link_insertion");
  const content = originalAndEdited(row?.instructions);
  const isDocument = isDocumentRequest(type);
  const newGuestPost = type === "guest_post" && !row;
  const [guestLinks, setGuestLinks] = useState([0]);
  const nextLink = useRef(1);

  return (
    <>
      <label className="text-sm font-medium md:col-span-2">
        Request type
        <Select
          name="requestType"
          className="mt-1"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          {requestTypes.map((type) => (
            <option key={type} value={type}>
              {requestTypeLabels[type]}
            </option>
          ))}
        </Select>
      </label>
      <label
        className="text-sm font-medium md:col-span-2"
        key={isDocument ? "site" : "placement"}
      >
        {isDocument ? "Site URL" : "Placement page URL"} *
        <Input
          name="placementPageUrl"
          type="url"
          required
          className="mt-1"
          placeholder={
            isDocument
              ? "https://publisher.com"
              : "https://publisher.com/article"
          }
          defaultValue={row?.placement_page_url}
        />
      </label>
      {isDocument ? (
        <>
          {type === "listicle" && (
            <label className="text-sm font-medium md:col-span-2">
              Listicle position *
              <Input
                name="listiclePosition"
                required
                maxLength={120}
                placeholder="e.g. #3 or after Company A"
                className="mt-1"
                defaultValue={row?.listicle_position ?? ""}
              />
            </label>
          )}
          <label className="text-sm font-medium md:col-span-2">
            {type === "listicle"
              ? "Listicle document link *"
              : newGuestPost
                ? "Guest post document link *"
                : "Guest post document link"}
            <Input
              name="documentUrl"
              type="url"
              required={type === "listicle" || newGuestPost || !allowUpload}
              className="mt-1"
              placeholder="https://docs.google.com/document/…"
              defaultValue={row?.document_url ?? ""}
            />
          </label>
          {type === "guest_post" && !newGuestPost && allowUpload && (
            <label className="text-sm font-medium md:col-span-2">
              Or upload a guest post
              <Input
                name="attachment"
                type="file"
                accept=".pdf,.doc,.docx"
                className="mt-1 h-auto py-2"
              />
              <span className="text-xs text-[var(--muted)]">
                PDF, DOC, or DOCX · Up to 3 MB
                {row?.attachment_name &&
                  ` · Current file: ${row.attachment_name}`}
              </span>
            </label>
          )}
          {type === "guest_post" && (
            <div className="space-y-3 rounded-xl border border-[var(--border)] p-3 md:col-span-2">
              {newGuestPost && (
                <p className="text-sm text-[var(--muted)]">
                  Each anchor and target URL creates a separate request using
                  this document.
                </p>
              )}
              {guestLinks.map((link, index) => (
                <div
                  key={link}
                  className="space-y-2"
                  role="group"
                  aria-label={`Guest post link ${index + 1}`}
                >
                  {newGuestPost && guestLinks.length > 1 && (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Link {index + 1}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove link ${index + 1}`}
                        onClick={() =>
                          setGuestLinks((current) =>
                            current.filter((id) => id !== link),
                          )
                        }
                      >
                        <Trash2 size={14} aria-hidden /> Remove
                      </Button>
                    </div>
                  )}
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm font-medium">
                      Anchor text
                      <Input
                        name={newGuestPost ? "guestAnchorText" : "anchorText"}
                        required={newGuestPost || !!row?.anchor_text}
                        maxLength={500}
                        className="mt-1"
                        defaultValue={row?.anchor_text ?? ""}
                      />
                    </label>
                    <label className="text-sm font-medium">
                      Target URL
                      <Input
                        name={newGuestPost ? "guestTargetLink" : "targetLink"}
                        type="url"
                        required={newGuestPost || !!row?.target_link}
                        className="mt-1"
                        defaultValue={row?.target_link ?? ""}
                      />
                    </label>
                  </div>
                </div>
              ))}
              {newGuestPost && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={guestLinks.length >= maxRequestsPerSubmission}
                  onClick={() => {
                    const link = nextLink.current++;
                    setGuestLinks((current) => [...current, link]);
                  }}
                >
                  <Plus size={15} aria-hidden /> Add more
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <label className="text-sm font-medium">
            Anchor text *
            <Input
              name="anchorText"
              required
              maxLength={500}
              className="mt-1"
              defaultValue={row?.anchor_text ?? ""}
            />
          </label>
          <label className="text-sm font-medium">
            Target link *
            <Input
              name="targetLink"
              type="url"
              required
              className="mt-1"
              defaultValue={row?.target_link ?? ""}
            />
          </label>
          <label className="text-sm font-medium">
            Original Content
            <Textarea
              name="originalContent"
              className="mt-1"
              rows={4}
              maxLength={5000}
              defaultValue={row?.original_content ?? content.original}
            />
          </label>
          <label className="text-sm font-medium">
            Edited Content
            <Textarea
              name="editedContent"
              className="mt-1"
              rows={4}
              maxLength={5000}
              defaultValue={row?.edited_content ?? content.edited}
            />
          </label>
        </>
      )}
      <label className="text-sm font-medium md:col-span-2">
        Instructions (optional)
        <Textarea
          name="instructions"
          className="mt-1"
          rows={3}
          maxLength={5000}
          defaultValue={row?.instructions ?? ""}
        />
      </label>
      <label className="text-sm font-medium md:col-span-2">
        Notes (optional)
        <Textarea
          name="notes"
          className="mt-1"
          rows={2}
          maxLength={5000}
          defaultValue={row?.notes ?? ""}
        />
      </label>
    </>
  );
}

export function requestFormValues(data: FormData) {
  const anchors = data.getAll("guestAnchorText");
  const targets = data.getAll("guestTargetLink");
  data.delete("guestAnchorText");
  data.delete("guestTargetLink");
  data.delete("attachment");
  return {
    ...Object.fromEntries(data),
    ...(anchors.length || targets.length
      ? {
          guestPostLinks: anchors.map((anchorText, index) => ({
            anchorText,
            targetLink: targets[index],
          })),
        }
      : {}),
  };
}

export function requestFormBody(
  form: HTMLFormElement,
  extra: Record<string, unknown>,
) {
  const data = new FormData(form);
  const file = data.get("attachment");
  const payload = { ...requestFormValues(data), ...extra };
  if (!(file instanceof File) || !file.size)
    return {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    };
  const multipart = new FormData();
  multipart.set("payload", JSON.stringify(payload));
  multipart.set("attachment", file);
  return { body: multipart };
}
