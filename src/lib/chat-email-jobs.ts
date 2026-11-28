import { requestEmail } from "@/lib/email-notifications";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

type Job = {
  id: string;
  recipient_id: string;
  request_id: string;
  anchor: string;
};

export async function deliverRequestChatEmails(jobId?: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const db = createAdminClient();
  const { data, error } = await db.rpc("claim_request_chat_email_jobs", {
    p_id: jobId ?? null,
    p_limit: jobId ? 1 : 10,
  });
  if (error) throw error;
  const resend = new Resend(apiKey);
  await Promise.all(
    ((data ?? []) as Job[]).map(async (job) => {
      try {
        const [{ data: recipient, error: lookupError }, { data: message }] =
          await Promise.all([
            db
              .from("profiles")
              .select("email,full_name")
              .eq("id", job.recipient_id)
              .eq("account_status", "active")
              .maybeSingle(),
            db
              .from("request_comments")
              .select("author_id")
              .eq("id", job.id)
              .maybeSingle(),
          ]);
        if (lookupError) throw lookupError;
        if (recipient?.email) {
          const { error: sendError } = await resend.emails.send(
            {
              from:
                process.env.EMAIL_FROM ?? "Collabio <partners@collabio.online>",
              to: recipient.email,
              ...(await requestEmail(db, {
                requestId: job.request_id,
                subject: "New request message",
                message: "There is a new message on this request.",
                template: "comment_received",
                anchor: job.anchor,
                actorId: message?.author_id,
                recipient: recipient.full_name,
              })),
            },
            { idempotencyKey: `collabio-request-chat/${job.id}` },
          );
          if (sendError) throw new Error(sendError.message);
        }
        const { error: completionError } = await db
          .from("request_chat_email_jobs")
          .update({ delivered_at: new Date().toISOString() })
          .eq("id", job.id);
        if (completionError) throw completionError;
      } catch (caught) {
        console.error("Request chat email delivery failed", job.id, caught);
      }
    }),
  );
}
