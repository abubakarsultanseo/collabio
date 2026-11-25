import { z } from "zod";
import {
  isDocumentRequest,
  maxRequestsPerSubmission,
  requestTypes,
} from "@/lib/request-content";

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

export const guestPostLinksInput = z
  .array(
    z.object({
      anchorText: z
        .string()
        .trim()
        .min(1, "Enter anchor text for each guest post link.")
        .max(500),
      targetLink: httpUrl,
    }),
  )
  .min(1)
  .max(maxRequestsPerSubmission)
  .optional();

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
    } else {
      if (!input.documentUrl && !hasFile)
        return "Add a document link or upload a guest-post file.";
      if (!!input.anchorText !== !!input.targetLink)
        return "Enter both the anchor text and target URL.";
    }
  } else if (!input.anchorText || !input.targetLink) {
    return "Enter the anchor text and target link.";
  }
  if (hasFile && input.requestType !== "guest_post")
    return "File uploads are available for guest posts.";
  return null;
}

export function expandRequestContent(
  input: ContentInput & {
    guestPostLinks?: z.output<typeof guestPostLinksInput>;
  },
  hasFile = false,
) {
  if (input.requestType !== "guest_post") {
    if (input.guestPostLinks)
      return { issue: "Add link pairs only to guest posts." };
    const issue = validateContent(input, hasFile);
    return issue ? { issue } : { rows: [contentColumns(input)] };
  }

  if (!input.documentUrl)
    return { issue: "Enter the guest post document link." };
  const pairs = input.guestPostLinks ?? [
    {
      anchorText: input.anchorText,
      targetLink: input.targetLink,
    },
  ];
  if (pairs.some((pair) => !pair.anchorText || !pair.targetLink))
    return {
      issue: "Enter an anchor text and target URL for each guest post link.",
    };
  if (pairs.length > 1 && hasFile)
    return {
      issue:
        "Use a shared document link when sending multiple guest post requests.",
    };

  return { rows: pairs.map((pair) => contentColumns({ ...input, ...pair })) };
}

export function contentColumns(input: ContentInput) {
  const isDocument = isDocumentRequest(input.requestType);
  return {
    placement_page_url: input.placementPageUrl,
    anchor_text: input.requestType === "listicle" ? null : input.anchorText,
    target_link: input.requestType === "listicle" ? null : input.targetLink,
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
