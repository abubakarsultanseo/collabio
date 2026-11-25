"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  isDocumentRequest,
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
              : "Guest post document link"}
            <Input
              name="documentUrl"
              type="url"
              required={type === "listicle" || !allowUpload}
              className="mt-1"
              placeholder="https://docs.google.com/document/…"
              defaultValue={row?.document_url ?? ""}
            />
          </label>
          {type === "guest_post" && allowUpload && (
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

export function requestFormBody(
  form: HTMLFormElement,
  extra: Record<string, unknown>,
) {
  const data = new FormData(form);
  const file = data.get("attachment");
  data.delete("attachment");
  const payload = { ...Object.fromEntries(data), ...extra };
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
