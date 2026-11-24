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
        const { data: recipient, error: lookupError } = await db
          .from("profiles")
          .select("email")
          .eq("id", job.recipient_id)
          .eq("account_status", "active")
          .maybeSingle();
        if (lookupError) throw lookupError;
        if (recipient?.email) {
          const { error: sendError } = await resend.emails.send(
            {
              from:
                process.env.EMAIL_FROM ?? "Collabio <partners@collabio.online>",
              to: recipient.email,
              subject: "New Collabio request message",
              text: `There is a new message on your request: ${job.anchor}. Sign in to Collabio to read it.`,
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
