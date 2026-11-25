export const requestTypes = [
  "link_insertion",
  "guest_post",
  "listicle",
  "other",
] as const;
export type RequestType = (typeof requestTypes)[number];

export const requestTypeLabels: Record<RequestType, string> = {
  link_insertion: "Link insertion",
  guest_post: "Guest post",
  listicle: "Listicle",
  other: "Other",
};

export function isDocumentRequest(type: string) {
  return type === "guest_post" || type === "listicle";
}

export type RequestContent = {
  placement_page_url: string;
  anchor_text: string | null;
  target_link: string | null;
  request_type: string;
  original_content?: string | null;
  edited_content?: string | null;
  document_url?: string | null;
  live_url?: string | null;
  attachment_name?: string | null;
  listicle_position?: string | null;
  import_date_unknown?: boolean;
  instructions: string | null;
};

export function requestLabel(row: {
  anchor_text: string | null;
  request_type?: string;
}) {
  return (
    row.anchor_text ||
    requestTypeLabels[row.request_type as RequestType] ||
    "Request"
  );
}

export function originalAndEdited(instructions?: string | null) {
  if (!instructions) return { original: "", edited: "" };
  const sections = Array.from(
    instructions.matchAll(
      /(?:^|\n)\s*\*{0,2}(original content|original text|existing sentence|before(?: text)?|after this line|after this|insert after|edited content|edited text|new sentence(?:\s*\/\s*addition)?|after(?: text)?|add this line|add this|text to be inserted)\s*:\*{0,2}[ \t]*/gi,
    ),
  );
  const originals = /^(original|existing|before|after this|insert after)/i;
  let original = "",
    edited = "";
  for (const [index, section] of sections.entries()) {
    const value = instructions
      .slice(section.index! + section[0].length, sections[index + 1]?.index)
      .trim();
    if (originals.test(section[1])) original ||= value;
    else edited ||= value;
  }
  return { original, edited };
}

export function copyRequest(row: RequestContent) {
  if (isDocumentRequest(row.request_type)) {
    return [
      `Site: ${row.placement_page_url}`,
      row.listicle_position && `Position: ${row.listicle_position}`,
      row.document_url && `Document: ${row.document_url}`,
      row.anchor_text && `Anchor Text: ${row.anchor_text}`,
      row.target_link && `Target Link: ${row.target_link}`,
      row.live_url && `Live URL: ${row.live_url}`,
      row.attachment_name && `Attachment: ${row.attachment_name}`,
      row.instructions && `Instructions:\n${row.instructions}`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  const legacy = originalAndEdited(row.instructions);
  return [
    `URL: ${row.placement_page_url}`,
    `Anchor Text: ${row.anchor_text ?? ""}`,
    `Link: ${row.target_link ?? ""}`,
    "",
    "Original Content:",
    row.original_content ?? legacy.original,
    "Edited Content:",
    row.edited_content ?? legacy.edited,
  ].join("\n");
}

export const maxRequestsPerSubmission = 50;

export const maxAttachmentBytes = 3 * 1024 * 1024;
