import { randomUUID } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { maxAttachmentBytes } from "@/lib/request-content";

const mime = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
} as const;

export const requestAttachmentBucket = "request-documents";
type Db = ReturnType<typeof createAdminClient>;

export async function readRequestForm(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
    return { body: await request.json().catch(() => null), file: undefined };
  const form = await request.formData();
  const payload = form.get("payload");
  const attachment = form.get("attachment");
  return {
    body: typeof payload === "string" ? (JSON.parse(payload) as unknown) : null,
    file:
      attachment instanceof File && attachment.size ? attachment : undefined,
  };
}

export function attachmentError(file?: File) {
  if (!file) return null;
  if (file.size > maxAttachmentBytes) return "Files must be 3 MB or smaller.";
  const ext = file.name.split(".").at(-1)?.toLowerCase();
  return ext && Object.hasOwn(mime, ext)
    ? null
    : "Choose a PDF, DOC, or DOCX file.";
}

export async function uploadRequestAttachment(
  db: Db,
  workspace: string,
  file: File,
) {
  const ext = file.name.split(".").at(-1)!.toLowerCase() as keyof typeof mime;
  const path = `${workspace}/${randomUUID()}.${ext}`;
  const bytes = await file.arrayBuffer();
  const header = Buffer.from(bytes.slice(0, 8)).toString("hex");
  const expected =
    ext === "pdf"
      ? "255044462d"
      : ext === "docx"
        ? "504b0304"
        : "d0cf11e0a1b11ae1";
  if (!header.startsWith(expected))
    throw new Error("The file does not match its extension.");
  const { error } = await db.storage
    .from(requestAttachmentBucket)
    .upload(path, bytes, { contentType: mime[ext] });
  if (error) throw new Error("Could not upload the request document.");
  return {
    attachment_path: path,
    attachment_name:
      file.name.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 240) ||
      `document.${ext}`,
  };
}
