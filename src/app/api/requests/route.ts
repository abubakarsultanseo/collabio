import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCollabEmail } from "@/lib/email-notifications";

const requestSchema = z.object({
  partnershipId: z.string().uuid(),
  dealId: z.string().uuid().optional(),
  placementPageUrl: z.string().url().max(2048),
  anchorText: z.string().trim().min(1).max(500),
  targetLink: z.string().url().max(2048),
  requestType: z
    .enum(["guest_post", "link_insertion", "other"])
    .default("other"),
  instructions: z.string().max(5000).optional(),
  notes: z.string().max(5000).optional(),
});
const patchSchema = z
  .object({
    id: z.string().uuid(),
    status: z
      .enum([
        "new_request",
        "seen",
        "reviewing",
        "accepted",
        "rejected",
        "in_progress",
        "live",
        "shared",
        "hold",
        "waiting_for_partner",
        "cancelled",
        "overdue",
      ])
      .optional(),
    placementPageUrl: z.string().url().max(2048).optional(),
    anchorText: z.string().trim().min(1).max(500).optional(),
    targetLink: z.string().url().max(2048).optional(),
    requestType: z.enum(["guest_post", "link_insertion", "other"]).optional(),
    instructions: z.string().max(5000).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
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
  );

async function session() {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
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

async function accessiblePartnershipIds(
  userId: string,
  role: string,
  db: ReturnType<typeof createAdminClient>,
) {
  let query = db.from("partnerships").select("id");
  if (role !== "admin")
    query = query.or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((item) => item.id);
}

export async function GET(request: Request) {
  try {
    const current = await session();
    if ("error" in current) return current.error;
    const url = new URL(request.url);
    const partnershipId = url.searchParams.get("partnershipId");
    const scope = url.searchParams.get("scope");
    const status = url.searchParams.get("status");
    const requestType = url.searchParams.get("type");
    const direction = url.searchParams.get("direction");
    const createdFrom = url.searchParams.get("createdFrom");
    const createdTo = url.searchParams.get("createdTo");
    const search = (url.searchParams.get("q") ?? "")
      .replace(/[,%()\\]/g, " ")
      .trim()
      .slice(0, 80);
    const db = createAdminClient();
    const accessibleIds = await accessiblePartnershipIds(
      current.user.id,
      current.role,
      db,
    );
    if (partnershipId && !accessibleIds.includes(partnershipId))
      return NextResponse.json(
        { error: "Workspace access denied." },
        { status: 403 },
      );
    const ids = partnershipId ? [partnershipId] : accessibleIds;
    if (!ids.length)
      return NextResponse.json({ requests: [], currentSide: null });
    let partnerCanUpdateStatus = false;
    if (current.role !== "admin") {
      const db = createAdminClient();
      const { data: permission, error: permissionError } = await db
        .from("partner_permissions")
        .select("view_requests,update_request_status")
        .eq("partner_id", current.user.id)
        .maybeSingle();
      if (permissionError) throw permissionError;
      partnerCanUpdateStatus = permission?.update_request_status === true;
      if (permission?.view_requests === false)
        return NextResponse.json(
          { error: "Your admin has disabled request access." },
          { status: 403 },
        );
    }
    let query = db
      .from("requests")
      .select(
        "id,request_code,partnership_id,deal_id,link_side,partner_id,sender_id,receiver_id,direction,placement_page_url,anchor_text,target_link,request_type,instructions,notes,status,first_viewed_at,deadline_at,was_overdue,overdue_at,completed_at,created_at,updated_at,shared_at,live_at,rejection_reason",
      )
      .in("partnership_id", ids)
      .order("created_at", { ascending: false });
    if (scope === "inbox") query = query.eq("receiver_id", current.user.id);
    if (scope === "sent") query = query.eq("sender_id", current.user.id);
    if (scope === "pending")
      query = query.not("status", "in", "(live,rejected,cancelled)");
    if (scope === "overdue") query = query.eq("was_overdue", true);
    if (status) query = query.eq("status", status);
    if (partnershipId) query = query.eq("partnership_id", partnershipId);
    if (
      requestType &&
      ["guest_post", "link_insertion", "other"].includes(requestType)
    )
      query = query.eq("request_type", requestType);
    if (direction === "sent") query = query.eq("sender_id", current.user.id);
    if (direction === "received")
      query = query.eq("receiver_id", current.user.id);
    if (createdFrom && /^\d{4}-\d{2}-\d{2}$/.test(createdFrom))
      query = query.gte("created_at", `${createdFrom}T00:00:00.000Z`);
    if (createdTo && /^\d{4}-\d{2}-\d{2}$/.test(createdTo)) {
      const end = new Date(`${createdTo}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      query = query.lt("created_at", end.toISOString());
    }
    if (search) {
      const terms = [
        `anchor_text.ilike.%${search}%`,
        `placement_page_url.ilike.%${search}%`,
        `target_link.ilike.%${search}%`,
        `instructions.ilike.%${search}%`,
        `notes.ilike.%${search}%`,
      ];
      if (/^\d+$/.test(search)) terms.push(`request_code.eq.${Number(search)}`);
      query = query.or(terms.join(","));
    }
    const { data, error } = await query.limit(500);
    if (error) throw error;
    const rows = data ?? [];
    const partyIds = [
      ...new Set(
        rows.flatMap((item) => [
          item.sender_id,
          item.receiver_id,
          item.partner_id,
        ]),
      ),
    ];
    const [{ data: profiles }, { data: partnerships }] = await Promise.all([
      partyIds.length
        ? db.from("profiles").select("id,full_name,email").in("id", partyIds)
        : Promise.resolve({ data: [] }),
      db
        .from("partnerships")
        .select("id,name,user_a_id,user_b_id")
        .in("id", ids),
    ]);
    const profileMap = Object.fromEntries(
      (profiles ?? []).map((item) => [item.id, item]),
    );
    const pairMap = Object.fromEntries(
      (partnerships ?? []).map((item) => [item.id, item]),
    );
    return NextResponse.json({
      requests: rows.map((item) => ({
        ...item,
        sender: profileMap[item.sender_id] ?? null,
        receiver: profileMap[item.receiver_id] ?? null,
        partner: profileMap[item.partner_id] ?? null,
        workspace: pairMap[item.partnership_id] ?? null,
        canManage: current.role === "admin",
        canChangeStatus:
          current.role === "admin" ||
          (partnerCanUpdateStatus &&
            [item.sender_id, item.receiver_id].includes(current.user.id)),
      })),
      currentSide: null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load requests.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const current = await session();
    if ("error" in current) return current.error;
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid request details.",
        },
        { status: 400 },
      );
    const input = parsed.data;
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
    if (input.dealId) {
      const { data: deal, error: dealError } = await db
        .from("deals")
        .select("id,status")
        .eq("id", input.dealId)
        .eq("partnership_id", input.partnershipId)
        .maybeSingle();
      if (dealError) throw dealError;
      if (!deal || deal.status !== "open")
        return NextResponse.json(
          { error: "Choose an open deal in this workspace." },
          { status: 400 },
        );
    }
    const senderSide = pair.user_a_id === current.user.id ? "a" : "b";
    const direction =
      current.role === "admin" ? "admin_to_partner" : "partner_to_admin";
    const { data: created, error } = await db
      .from("requests")
      .insert({
        partnership_id: input.partnershipId,
        deal_id: input.dealId ?? null,
        link_side: senderSide,
        partner_id: partner.id,
        sender_id: current.user.id,
        receiver_id: receiverId,
        direction,
        placement_page_url: input.placementPageUrl,
        anchor_text: input.anchorText,
        target_link: input.targetLink,
        request_type: input.requestType,
        instructions: input.instructions || null,
        notes: input.notes || null,
        status: "new_request",
      })
      .select("id,request_code,deadline_at")
      .single();
    if (error) throw error;
    await sendCollabEmail(db, {
      to: receiver.email,
      requestId: created.id,
      template: "new_request",
      subject: "New Collabio request",
      message: `${sender.full_name} sent you a collaboration request.`,
      anchor: input.anchorText,
    });
    return NextResponse.json(
      { success: true, ...created, receiverId },
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
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request update." },
        { status: 400 },
      );
    const { id, markSeen, reason, ...changes } = parsed.data;
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
            .select("email")
            .eq("id", row.sender_id)
            .maybeSingle();
          await sendCollabEmail(db, {
            to: sender?.email,
            requestId: id,
            template: "request_viewed",
            subject: "Your Collabio request was viewed",
            message: "The receiver opened your collaboration request.",
            anchor: row.anchor_text,
          });
        });
      }
      return NextResponse.json({ success: true, request: viewed });
    }

    const isStatus = changes.status !== undefined;
    const edits = Object.keys(changes).some((key) => key !== "status");
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
    const update: Record<string, unknown> = {
      last_updated_by: current.user.id,
      updated_at: new Date().toISOString(),
    };
    if (changes.status !== undefined) {
      update.status = changes.status;
      update.rejection_reason = changes.status === "rejected" ? reason : null;
    }
    if (changes.placementPageUrl !== undefined)
      update.placement_page_url = changes.placementPageUrl;
    if (changes.anchorText !== undefined)
      update.anchor_text = changes.anchorText;
    if (changes.targetLink !== undefined)
      update.target_link = changes.targetLink;
    if (changes.requestType !== undefined)
      update.request_type = changes.requestType;
    if (changes.instructions !== undefined)
      update.instructions = changes.instructions;
    if (changes.notes !== undefined) update.notes = changes.notes;
    const { data: updated, error: updateError } = await db
      .from("requests")
      .update(update)
      .eq("id", id)
      .select(
        "id,status,first_viewed_at,updated_at,placement_page_url,anchor_text,target_link,request_type,instructions,notes,live_at,shared_at,was_overdue,rejection_reason",
      )
      .single();
    if (updateError) throw updateError;
    const status = changes.status;
    if (status !== undefined && status !== row.status) {
      const recipientId =
        current.user.id === row.sender_id ? row.receiver_id : row.sender_id;
      after(async () => {
        const { data: recipient } = await db
          .from("profiles")
          .select("email")
          .eq("id", recipientId)
          .maybeSingle();
        await sendCollabEmail(db, {
          to: recipient?.email,
          requestId: id,
          template: "status_changed",
          subject: "Collabio request status changed",
          message: `A collaboration request status changed to ${status.replaceAll("_", " ")}.`,
          anchor: row.anchor_text,
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
          new_value: update,
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
      .select("id,partnership_id,partner_id")
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
