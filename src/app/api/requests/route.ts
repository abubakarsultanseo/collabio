import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createRequestBatch, exchangeInput } from "@/lib/exchange-input";
import { requestStatuses } from "@/lib/request-statuses";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { accessiblePartnershipIds, requestList } from "@/server/request-list";
import {
  contentColumns,
  contentInput,
  expandRequestContent,
  guestPostLinksInput,
  httpUrl,
  validateContent,
} from "@/lib/request-input";
import {
  attachmentError,
  readRequestForm,
  requestAttachmentBucket,
  uploadRequestAttachment,
} from "@/lib/request-attachment";
import { sendCollabEmail } from "@/lib/email-notifications";

const requestSchema = contentInput.extend({
  partnershipId: z.string().uuid(),
  guestPostLinks: guestPostLinksInput,
  ...exchangeInput,
});
const patchSchema = z
  .object({
    ...contentInput.partial().shape,
    id: z.string().uuid(),
    status: z.enum(requestStatuses).optional(),
    liveUrl: httpUrl.optional(),
    dealId: exchangeInput.dealId,
    markSeen: z.boolean().optional(),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== "id"),
    "Choose a request update.",
  )
  .refine(
    (value) =>
      !value.markSeen ||
      Object.keys(value).every((key) => key === "id" || key === "markSeen"),
    "Mark seen separately from other changes.",
  )
  .refine(
    (value) => value.status !== "rejected" || !!value.reason,
    "A rejection reason is required.",
  )
  .refine(
    (value) => !value.reason || value.status === "rejected",
    "A reason applies only when rejecting a request.",
  )
  .refine(
    (value) => !value.liveUrl || value.status === "live",
    "A published URL can only be saved with Live status.",
  );

async function session() {
  const auth = await createClient();
  const {
    data: { user },
  } = await getAuthUser(auth);
  if (!user)
    return {
      error: NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      ),
    };
  const { data: profile, error } = await auth
    .from("profiles")
    .select("role,account_status")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (profile?.account_status !== "active")
    return {
      error: NextResponse.json(
        { error: "Active account required." },
        { status: 403 },
      ),
    };
  return { user, role: profile.role, auth };
}

export async function GET(request: Request) {
  try {
    const current = await session();
    if ("error" in current) return current.error;
    return await requestList(new URL(request.url).searchParams, current);
  } catch {
    return NextResponse.json(
      { error: "Could not load requests." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const current = await session();
    if ("error" in current) return current.error;
    const { body, file } = await readRequestForm(request);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid request details.",
        },
        { status: 400 },
      );
    const input = parsed.data;
    const expanded = expandRequestContent(input, !!file);
    const issue = attachmentError(file) ?? expanded.issue;
    if (issue || !expanded.rows)
      return NextResponse.json(
        { error: issue ?? "Invalid request details." },
        { status: 400 },
      );
    const db = createAdminClient();
    const ids = await accessiblePartnershipIds(
      current.user.id,
      current.role,
      db,
    );
    if (!ids.includes(input.partnershipId))
      return NextResponse.json(
        { error: "Workspace access denied." },
        { status: 403 },
      );
    const { data: pair, error: pairError } = await db
      .from("partnerships")
      .select("id,name,user_a_id,user_b_id")
      .eq("id", input.partnershipId)
      .single();
    if (pairError) throw pairError;
    const { data: profiles, error: profilesError } = await db
      .from("profiles")
      .select("id,role,account_status,email,full_name")
      .in("id", [pair.user_a_id, pair.user_b_id]);
    if (profilesError) throw profilesError;
    const sender = profiles?.find((profile) => profile.id === current.user.id);
    const receiverId =
      pair.user_a_id === current.user.id ? pair.user_b_id : pair.user_a_id;
    const receiver = profiles?.find((profile) => profile.id === receiverId);
    if (
      !sender ||
      !receiver ||
      sender.account_status !== "active" ||
      receiver.account_status !== "active"
    )
      return NextResponse.json(
        { error: "Both workspace members must have active accounts." },
        { status: 409 },
      );
    const partner = profiles?.find((profile) => profile.role === "partner");
    if (!partner)
      return NextResponse.json(
        { error: "This workspace is not linked to a partner account." },
        { status: 409 },
      );
    if (current.role !== "admin") {
      const { data: permission, error: permissionError } = await db
        .from("partner_permissions")
        .select("add_new_requests")
        .eq("partner_id", current.user.id)
        .maybeSingle();
      if (permissionError) throw permissionError;
      if (permission?.add_new_requests === false)
        return NextResponse.json(
          { error: "Your admin has disabled new requests for your account." },
          { status: 403 },
        );
    }
    const direction =
      current.role === "admin" ? "admin_to_partner" : "partner_to_admin";
    const attachment = file
      ? await uploadRequestAttachment(db, input.partnershipId, file)
      : null;
    const { rows: created, error } = await createRequestBatch(
      db,
      expanded.rows.map((columns) => ({
        partnership_id: input.partnershipId,
        deal_id: input.dealId ?? null,
        exchange_ratio: input.exchangeRatio,
        partner_id: partner.id,
        sender_id: current.user.id,
        receiver_id: receiverId,
        direction,
        ...columns,
        ...attachment,
      })),
    );
    const first = created[0];
    if (error || !first) {
      if (attachment)
        await db.storage
          .from(requestAttachmentBucket)
          .remove([attachment.attachment_path]);
      if (error?.message.startsWith("Choose an open exchange"))
        return NextResponse.json({ error: error.message }, { status: 409 });
      throw error ?? new Error("Could not create request.");
    }
    after(async () => {
      await Promise.all(
        created.map((row) =>
          sendCollabEmail(db, {
            to: receiver.email,
            requestId: row.id,
            template: "new_request",
            subject: "New Collabio request",
            message: `${sender.full_name} sent you a collaboration request.`,
            anchor: row.anchor_text,
            actor: sender.full_name,
            recipient: receiver.full_name,
          }),
        ),
      );
    });
    return NextResponse.json(
      { success: true, ...first, receiverId, created, count: created.length },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not create request.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const current = await session();
    if ("error" in current) return current.error;
    const { body, file } = await readRequestForm(request);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request update." },
        { status: 400 },
      );
    const { id, markSeen, reason, liveUrl, ...changes } = parsed.data;
    const db = createAdminClient();
    const { data: row, error: findError } = await db
      .from("requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (findError) throw findError;
    if (!row)
      return NextResponse.json(
        { error: "Request not found." },
        { status: 404 },
      );
    const ids = await accessiblePartnershipIds(
      current.user.id,
      current.role,
      db,
    );
    if (!ids.includes(row.partnership_id))
      return NextResponse.json(
        { error: "Workspace access denied." },
        { status: 403 },
      );
    if (markSeen) {
      if (row.import_key || row.status === "cancelled")
        return NextResponse.json({ success: true });
      if (current.role !== "admin") {
        const { data: allowed, error } = await current.auth
          .from("requests")
          .select("id")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        if (!allowed || row.receiver_id !== current.user.id)
          return NextResponse.json(
            { error: "You cannot mark this request as seen." },
            { status: 403 },
          );
      }
      const { error: seenError } = await current.auth.rpc("mark_request_seen", {
        target_request: id,
      });
      if (seenError) throw seenError;
      const { data: viewed, error: readError } = await db
        .from("requests")
        .select("id,status,first_viewed_at,updated_at")
        .eq("id", id)
        .single();
      if (readError) throw readError;
      if (!row.first_viewed_at) {
        after(async () => {
          const { data: sender } = await db
            .from("profiles")
            .select("email,full_name")
            .eq("id", row.sender_id)
            .is("deleted_at", null)
            .maybeSingle();
          if (!sender) return;
          await sendCollabEmail(db, {
            to: sender?.email,
            requestId: id,
            template: "request_viewed",
            subject: "Your Collabio request was viewed",
            message: "The receiver opened your collaboration request.",
            anchor: row.anchor_text,
            actorId: current.user.id,
            recipient: sender?.full_name,
          });
        });
      }
      return NextResponse.json({ success: true, request: viewed });
    }

    const isStatus = changes.status !== undefined;
    const edits =
      !!file || Object.keys(changes).some((key) => key !== "status");
    const editsContent =
      !!file ||
      Object.keys(changes).some((key) => key !== "status" && key !== "dealId");
    if (current.role !== "admin") {
      if (edits)
        return NextResponse.json(
          { error: "Only admins can edit requests." },
          { status: 403 },
        );
      const { data: permission, error: permissionError } = await db
        .from("partner_permissions")
        .select("view_requests,update_request_status")
        .eq("partner_id", current.user.id)
        .maybeSingle();
      if (permissionError) throw permissionError;
      if (
        isStatus &&
        (permission?.view_requests === false ||
          !permission?.update_request_status)
      )
        return NextResponse.json(
          { error: "You do not have permission to change request status." },
          { status: 403 },
        );
      if (![row.sender_id, row.receiver_id].includes(current.user.id))
        return NextResponse.json(
          { error: "You are not a request participant." },
          { status: 403 },
        );
    }
    const type = changes.requestType ?? row.request_type;
    if (liveUrl && type !== "guest_post")
      return NextResponse.json(
        { error: "Published URLs are available for guest posts." },
        { status: 400 },
      );
    if (
      type === "guest_post" &&
      (changes.status === "live" ||
        (changes.requestType === "guest_post" &&
          row.request_type !== "guest_post" &&
          row.status === "live")) &&
      !liveUrl &&
      !row.live_url
    ) {
      return NextResponse.json(
        {
          error:
            "Add the published article URL before marking this guest post Live.",
        },
        { status: 400 },
      );
    }
    const update: Record<string, unknown> = {
      last_updated_by: current.user.id,
      updated_at: new Date().toISOString(),
    };
    if (liveUrl) update.live_url = liveUrl;
    else if (changes.requestType && type !== "guest_post" && row.live_url)
      update.live_url = null;
    if (changes.status !== undefined) {
      update.status = changes.status;
      update.rejection_reason = changes.status === "rejected" ? reason : null;
    }
    let attachment: Awaited<ReturnType<typeof uploadRequestAttachment>> | null =
      null;
    if (changes.dealId !== undefined && changes.dealId !== row.deal_id) {
      if (changes.dealId) {
        const { data: deal, error: dealError } = await db
          .from("deals")
          .select("id,status,first_link_side")
          .eq("id", changes.dealId)
          .eq("partnership_id", row.partnership_id)
          .maybeSingle();
        if (dealError) throw dealError;
        if (!deal || deal.status !== "open" || !deal.first_link_side)
          return NextResponse.json(
            { error: "Choose an open exchange in this workspace." },
            { status: 409 },
          );
      }
      update.deal_id = changes.dealId;
    }
    if (editsContent) {
      const saved = contentInput.safeParse({
        placementPageUrl: row.placement_page_url,
        anchorText: row.anchor_text,
        targetLink: row.target_link,
        requestType: row.request_type,
        originalContent: row.original_content,
        editedContent: row.edited_content,
        documentUrl: row.document_url,
        listiclePosition: row.listicle_position,
        instructions: row.instructions,
        notes: row.notes,
        ...changes,
      });
      if (!saved.success)
        return NextResponse.json(
          { error: saved.error.issues[0]?.message },
          { status: 400 },
        );
      const keepFile =
        saved.data.requestType === "guest_post" &&
        !saved.data.documentUrl &&
        !!row.attachment_path;
      const issue =
        attachmentError(file) ??
        validateContent(saved.data, !!file || keepFile);
      if (issue) return NextResponse.json({ error: issue }, { status: 400 });
      attachment = file
        ? await uploadRequestAttachment(db, row.partnership_id, file)
        : null;
      Object.assign(
        update,
        contentColumns(saved.data),
        attachment ?? {
          attachment_path: keepFile ? row.attachment_path : null,
          attachment_name: keepFile ? row.attachment_name : null,
        },
      );
    }
    const write = db.from("requests").update(update).eq("id", id);
    const { data: updated, error: updateError } = await (
      edits || liveUrl ? write.eq("updated_at", row.updated_at) : write
    )
      .select(
        "id,status,first_viewed_at,updated_at,placement_page_url,anchor_text,target_link,request_type,instructions,notes,live_at,live_url,shared_at,was_overdue,rejection_reason,original_content,edited_content,document_url,listicle_position,attachment_name,deal_id",
      )
      .maybeSingle();
    if (updateError || !updated) {
      if (attachment)
        await db.storage
          .from(requestAttachmentBucket)
          .remove([attachment.attachment_path]);
      if (updateError) throw updateError;
      return NextResponse.json(
        {
          error:
            "This request changed while you were editing it. Refresh and try again.",
        },
        { status: 409 },
      );
    }
    if (
      editsContent &&
      row.attachment_path &&
      update.attachment_path !== row.attachment_path
    )
      await db.storage
        .from(requestAttachmentBucket)
        .remove([row.attachment_path]);
    const status = changes.status;
    if (status !== undefined && status !== row.status) {
      const recipientId =
        current.user.id === row.sender_id ? row.receiver_id : row.sender_id;
      after(async () => {
        const { data: recipient } = await db
          .from("profiles")
          .select("email,full_name")
          .eq("id", recipientId)
          .is("deleted_at", null)
          .maybeSingle();
        if (!recipient) return;
        await sendCollabEmail(db, {
          to: recipient?.email,
          requestId: id,
          template: "status_changed",
          subject: "Collabio request status changed",
          message: `A collaboration request status changed to ${status.replaceAll("_", " ")}.`,
          anchor: row.anchor_text,
          actorId: current.user.id,
          recipient: recipient?.full_name,
          fromStatus: row.status,
          toStatus: status,
          reason: status === "rejected" ? updated.rejection_reason : undefined,
        });
      });
    }
    if (edits) {
      const { error: activityError } = await db
        .from("request_activity")
        .insert({
          request_id: id,
          partner_id: row.partner_id,
          actor_id: current.user.id,
          action_type: "request_edited",
          previous_value: {
            placement_page_url: row.placement_page_url,
            anchor_text: row.anchor_text,
            target_link: row.target_link,
            request_type: row.request_type,
            instructions: row.instructions,
            notes: row.notes,
          },
          new_value: Object.fromEntries(
            Object.entries(update).filter(([key]) => key !== "attachment_path"),
          ),
        });
      if (activityError) throw activityError;
    }
    return NextResponse.json({ success: true, request: updated });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not update request.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const current = await session();
    if ("error" in current) return current.error;
    if (current.role !== "admin")
      return NextResponse.json(
        { error: "Only admins can delete requests." },
        { status: 403 },
      );
    const parsed = z
      .object({ id: z.string().uuid() })
      .safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const db = createAdminClient();
    const { data: row, error: findError } = await db
      .from("requests")
      .select("id,partnership_id,partner_id,attachment_path")
      .eq("id", parsed.data.id)
      .maybeSingle();
    if (findError) throw findError;
    if (!row)
      return NextResponse.json(
        { error: "Request not found." },
        { status: 404 },
      );
    const ids = await accessiblePartnershipIds(
      current.user.id,
      current.role,
      db,
    );
    if (!ids.includes(row.partnership_id))
      return NextResponse.json(
        { error: "Workspace access denied." },
        { status: 403 },
      );
    const { error } = await db.from("requests").delete().eq("id", row.id);
    if (error) throw error;
    if (row.attachment_path)
      await db.storage
        .from(requestAttachmentBucket)
        .remove([row.attachment_path]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not delete request.",
      },
      { status: 500 },
    );
  }
}
