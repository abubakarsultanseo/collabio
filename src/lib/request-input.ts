import { z } from "zod";
import { isDocumentRequest, requestTypes } from "@/lib/request-content";

export const httpUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => /^https?:\/\//i.test(value), "Use an HTTP or HTTPS URL.");

const text = (limit: number) =>
  z
    .string()
    .trim()
    .max(limit)
    .nullish()
    .transform((value) => value || null);
const optionalUrl = text(2048).pipe(httpUrl.nullable());

export const contentInput = z.object({
  placementPageUrl: httpUrl,
  requestType: z.enum(requestTypes).default("link_insertion"),
  anchorText: text(500),
  targetLink: optionalUrl,
  originalContent: text(5000),
  editedContent: text(5000),
  documentUrl: optionalUrl,
  listiclePosition: text(120),
  instructions: text(5000),
  notes: text(5000),
});

export type ContentInput = z.output<typeof contentInput>;

export function validateContent(input: ContentInput, hasFile: boolean) {
  if (isDocumentRequest(input.requestType)) {
    if (input.requestType === "listicle") {
      if (!input.listiclePosition)
        return "Enter the requested listicle position.";
      if (!input.documentUrl) return "Enter the listicle document link.";
    } else if (!input.documentUrl && !hasFile)
      return "Add a document link or upload a guest-post file.";
  } else if (!input.anchorText || !input.targetLink) {
    return "Enter the anchor text and target link.";
  }
  if (hasFile && input.requestType !== "guest_post")
    return "File uploads are available for guest posts.";
  return null;
}

export function contentColumns(input: ContentInput) {
  const isDocument = isDocumentRequest(input.requestType);
  return {
    placement_page_url: input.placementPageUrl,
    anchor_text: isDocument ? null : input.anchorText,
    target_link: isDocument ? null : input.targetLink,
    request_type: input.requestType,
    original_content: isDocument ? null : input.originalContent,
    edited_content: isDocument ? null : input.editedContent,
    document_url: isDocument ? input.documentUrl : null,
    listicle_position:
      input.requestType === "listicle" ? input.listiclePosition : null,
    instructions: input.instructions,
    notes: input.notes,
  };
}
