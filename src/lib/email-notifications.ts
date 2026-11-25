import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { collabioUrl, renderCollabioEmail } from "@/lib/email-template";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminDb = ReturnType<typeof createAdminClient>;
type RequestEmail = {
  requestId: string;
  template: string;
  subject: string;
  message: string;
  anchor?: string | null;
  actorId?: string;
  actor?: string;
  recipient?: string;
  fromStatus?: string;
  toStatus?: string;
  reason?: string;
};

export const emailFrom = () =>
  process.env.EMAIL_FROM ?? "Collabio <partners@collabio.online>";

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export async function requestEmail(db: AdminDb, input: RequestEmail) {
  const [requestResult, actorResult] = await Promise.all([
    db
      .from("requests")
      .select(
        "request_code:partner_request_number,placement_page_url,anchor_text,request_type,listicle_position",
      )
      .eq("id", input.requestId)
      .maybeSingle(),
    input.actorId && !input.actor
      ? db
          .from("profiles")
          .select("full_name")
          .eq("id", input.actorId)
          .maybeSingle()
      : Promise.resolve(null),
  ]);
  const request = requestResult.data;
  let domain: string | undefined;
  if (request?.placement_page_url) {
    try {
      domain = new URL(request.placement_page_url).hostname;
    } catch {
      /* Older rows may lack a valid URL. */
    }
  }
  const actor = input.actor ?? actorResult?.data?.full_name;
  const title = input.subject;
  const isChat = input.template === "comment_received";
  const path = isChat ? "/messages" : "/requests/inbox";
  const next = `${path}?request=${encodeURIComponent(input.requestId)}`;
  const href = collabioUrl(`/login?next=${encodeURIComponent(next)}`);
  const fields: Array<[string, string]> = [];
  if (request) fields.push(["Request", `#${request.request_code}`]);
  if (domain) fields.push(["Placement site", domain]);
  const anchor = request?.anchor_text ?? input.anchor;
  if (anchor) fields.push(["Anchor text", anchor]);
  else if (request?.request_type)
    fields.push(["Request type", formatStatus(request.request_type)]);
  if (request?.listicle_position)
    fields.push(["Listicle position", request.listicle_position]);
  if (actor) fields.push(["Updated by", actor]);
  if (input.fromStatus)
    fields.push(["Previous status", formatStatus(input.fromStatus)]);
  if (input.toStatus) fields.push(["New status", formatStatus(input.toStatus)]);
  if (input.reason) fields.push(["Rejection reason", input.reason]);
  const actorMessage = actor
    ? {
        new_request: `${actor} sent you a collaboration request.`,
        request_viewed: `${actor} opened your request.`,
        status_changed: `${actor} changed the status of your collaboration request.`,
        comment_received: `${actor} posted a message on this request.`,
      }[input.template]
    : undefined;
  const subject = [
    request ? `#${request.request_code}` : "",
    domain ?? "",
    input.template === "status_changed" && actor && input.toStatus
      ? `${actor} changed status to ${formatStatus(input.toStatus)}`
      : title,
  ]
    .filter(Boolean)
    .join(" · ")
    .replace(/[\r\n]/g, " ");
  return {
    subject,
    ...renderCollabioEmail({
      title,
      message: actorMessage ?? input.message,
      recipient: input.recipient,
      fields,
      href,
      action: isChat ? "Open conversation" : "View request in Collabio",
    }),
  };
}

export async function sendCollabEmail(
  db: AdminDb,
  input: RequestEmail & { to: string | undefined },
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !input.to) return;
  const { data: log, error: logError } = await db
    .from("email_logs")
    .insert({
      recipient_email: input.to,
      template_key: input.template,
      request_id: input.requestId,
      idempotency_key: `${input.requestId}:${input.template}:${randomUUID()}`,
      status: "queued",
    })
    .select("id")
    .single();
  if (logError) return;

  let status = "failed";
  let errorMessage = "Email delivery failed.";
  let messageId: string | null = null;
  try {
    const sent = await new Resend(apiKey).emails.send({
      from: emailFrom(),
      ...(process.env.EMAIL_REPLY_TO
        ? { replyTo: process.env.EMAIL_REPLY_TO }
        : {}),
      to: input.to,
      ...(await requestEmail(db, input)),
    });
    if (sent.error) errorMessage = sent.error.message;
    else {
      status = "sent";
      errorMessage = "";
      messageId = sent.data?.id ?? null;
    }
  } catch (error) {
    if (error instanceof Error) errorMessage = error.message;
  }
  await db
    .from("email_logs")
    .update({
      status,
      error_message: errorMessage || null,
      provider_message_id: messageId,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    })
    .eq("id", log.id);
}
