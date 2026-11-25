import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverRequestChatEmails } from "@/lib/chat-email-jobs";

const uuid = z.string().uuid();
const kinds = z.enum(["request", "direct"]);
const cursorSchema = z.object({
  at: z.string().datetime({ offset: true }),
  id: uuid,
});
const threadSchema = z.object({ kind: kinds, threadId: uuid });
const messageInput = threadSchema.extend({
  action: z.literal("send"),
  id: uuid,
  body: z.string().trim().min(1).max(5000),
});
const readInput = threadSchema.extend({ action: z.literal("read"), id: uuid });
const unreadInput = z.object({
  action: z.literal("unread"),
  ids: z.array(uuid).max(500),
});
const writeInput = z.discriminatedUnion("action", [
  messageInput,
  readInput,
  unreadInput,
]);
const fields = "id,author_id,body,created_at";
const directFields = `${fields},author:profiles!direct_chat_messages_author_id_fkey(full_name,avatar_url)`;
const requestFields = `${fields},author:profiles!request_comments_author_id_fkey(full_name,avatar_url)`;
const pageSize = 40;

class ChatError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function context() {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) throw new ChatError("Sign in to continue.", 401);
  const { data: profile, error } = await auth
    .from("profiles")
    .select("role,account_status,full_name,avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (profile?.account_status !== "active")
    throw new ChatError("Active account required.", 403);
  return { auth, db: createAdminClient(), user, profile };
}

type Context = Awaited<ReturnType<typeof context>>;
type Thread = z.infer<typeof threadSchema>;

async function assignedAdmin(db: Context["db"]) {
  const configured = process.env.CHAT_ADMIN_USER_ID?.trim();
  if (configured && !uuid.safeParse(configured).success) return null;
  let query = db
    .from("profiles")
    .select("id,full_name,avatar_url")
    .eq("role", "admin")
    .eq("account_status", "active");
  if (configured) query = query.eq("id", configured);
  const { data, error } = await query.limit(2);
  if (error) throw error;
  return data?.length === 1 ? data[0] : null;
}

async function directAccess(ctx: Context, peerId: string) {
  const admin = await assignedAdmin(ctx.db);
  if (!admin) throw new ChatError("Direct chat needs an assigned admin.", 409);
  if (
    ctx.profile.role === "partner" &&
    (peerId === admin.id || peerId === "assigned")
  ) {
    return {
      adminId: admin.id as string,
      partnerId: ctx.user.id,
      peerName: admin.full_name as string,
      avatar_url: admin.avatar_url,
    };
  }
  if (ctx.user.id === admin.id) {
    const { data: partner, error } = await ctx.db
      .from("profiles")
      .select("id,full_name,avatar_url")
      .eq("id", peerId)
      .eq("role", "partner")
      .eq("account_status", "active")
      .maybeSingle();
    if (error) throw error;
    if (partner)
      return {
        adminId: admin.id as string,
        partnerId: partner.id as string,
        peerName: partner.full_name as string,
        avatar_url: partner.avatar_url,
      };
  }
  throw new ChatError("Conversation unavailable.", 404);
}

async function requestAccess(ctx: Context, requestId: string, write = false) {
  // This read uses the signed-in session. The existing request RLS limits it to
  // authorized workspaces before the service client touches any comment data.
  const request = ctx.auth
    .from("requests")
    .select(
      "id,request_code:partner_request_number,placement_page_url,anchor_text,target_link,request_type,status,document_url,attachment_name",
    )
    .eq("id", requestId)
    .maybeSingle();
  const permissions =
    ctx.profile.role === "admin"
      ? Promise.resolve(null)
      : ctx.auth
          .from("partner_permissions")
          .select("add_comments,update_request_status")
          .eq("partner_id", ctx.user.id)
          .maybeSingle();
  const [{ data: row, error }, permissionResult] = await Promise.all([
    request,
    permissions,
  ]);
  if (error) throw error;
  if (!row) throw new ChatError("Conversation unavailable.", 404);
  if (ctx.profile.role === "admin")
    return { row, canWrite: true, canUpdateStatus: true };
  if (permissionResult?.error) throw permissionResult.error;
  const permission = permissionResult?.data;
  const canWrite = permission?.add_comments !== false;
  if (write && !canWrite)
    throw new ChatError("Your admin has disabled comments.", 403);
  return {
    row,
    canWrite,
    canUpdateStatus: permission?.update_request_status === true,
  };
}

async function threadQuery(ctx: Context, thread: Thread) {
  if (thread.kind === "direct") {
    const pair = await directAccess(ctx, thread.threadId);
    return {
      query: ctx.db
        .from("direct_chat_messages")
        .select(directFields)
        .eq("admin_id", pair.adminId)
        .eq("partner_id", pair.partnerId),
      details: {
        threadId:
          ctx.profile.role === "partner" ? pair.adminId : pair.partnerId,
        title: pair.peerName,
        avatar_url: pair.avatar_url,
        canWrite: true,
      },
    };
  }
  const access = await requestAccess(ctx, thread.threadId);
  return {
    query: ctx.db
      .from("request_comments")
      .select(requestFields)
      .eq("request_id", thread.threadId),
    details: {
      request: access.row,
      canWrite: access.canWrite,
      canUpdateStatus: access.canUpdateStatus,
    },
  };
}

function failure(caught: unknown) {
  if (caught instanceof ChatError)
    return NextResponse.json(
      { error: caught.message },
      { status: caught.status },
    );
  console.error("Chat request failed", caught);
  return NextResponse.json(
    { error: "Chat is unavailable. Please try again." },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const ctx = await context();
    const params = new URL(request.url).searchParams;
    if (params.get("mode") === "contacts") {
      const admin = await assignedAdmin(ctx.db);
      if (!admin)
        throw new ChatError("Direct chat needs an assigned admin.", 409);
      if (ctx.profile.role === "partner") {
        const { data: position, error: positionError } = await ctx.db
          .from("chat_read_positions")
          .select("up_to_at,up_to_id")
          .eq("reader_id", ctx.user.id)
          .eq("kind", "direct")
          .eq("thread_id", admin.id)
          .maybeSingle();
        if (positionError) throw positionError;
        const incoming = ctx.db
          .from("direct_chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("admin_id", admin.id)
          .eq("partner_id", ctx.user.id)
          .eq("author_id", admin.id);
        if (position)
          incoming.or(
            `created_at.gt.${position.up_to_at},and(created_at.eq.${position.up_to_at},id.gt.${position.up_to_id})`,
          );
        const { count, error: countError } = await incoming;
        if (countError) throw countError;
        return NextResponse.json({
          contacts: [
            {
              id: admin.id,
              name: admin.full_name,
              avatar_url: admin.avatar_url,
              unread: count ?? 0,
            },
          ],
          isAdmin: false,
        });
      }
      if (ctx.user.id !== admin.id)
        throw new ChatError(
          "Direct chats are available to the assigned admin.",
          403,
        );
      const { data, error } = await ctx.db
        .rpc("collabio_chat_contacts", { p_admin: admin.id })
        .limit(1000);
      if (error) throw error;
      return NextResponse.json({ contacts: data ?? [], isAdmin: true });
    }

    const directAssigned =
      params.get("kind") === "direct" && params.get("threadId") === "assigned";
    const parsedThread = threadSchema.safeParse({
      kind: params.get("kind"),
      threadId: params.get("threadId"),
    });
    if (directAssigned && ctx.profile.role !== "partner")
      throw new ChatError("Choose a partner to open a direct chat.", 403);
    const thread = directAssigned
      ? { kind: "direct" as const, threadId: "assigned" }
      : parsedThread.data;
    if (!thread) throw new ChatError("Choose a conversation.", 400);
    const wantsOlder = params.has("beforeAt") || params.has("beforeId");
    const before = cursorSchema.safeParse({
      at: params.get("beforeAt"),
      id: params.get("beforeId"),
    });
    const wantsNewer = params.has("afterAt") || params.has("afterId");
    const newer = cursorSchema.safeParse({
      at: params.get("afterAt"),
      id: params.get("afterId"),
    });
    if (
      (wantsOlder && !before.success) ||
      (wantsNewer && !newer.success) ||
      (wantsOlder && wantsNewer)
    )
      throw new ChatError("Invalid message cursor.", 400);
    const { query, details } = await threadQuery(ctx, thread);
    if (before.success) {
      const { at, id } = before.data;
      query.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${id})`);
    }
    if (newer.success) {
      const { at, id } = newer.data;
      query.or(`created_at.gt.${at},and(created_at.eq.${at},id.gt.${id})`);
    }
    const { data, error } = await query
      .order("created_at", { ascending: wantsNewer })
      .order("id", { ascending: wantsNewer })
      .limit(pageSize + 1);
    if (error) throw error;
    const rows = data ?? [];
    return NextResponse.json({
      ...details,
      messages: wantsNewer
        ? rows.slice(0, pageSize)
        : rows.slice(0, pageSize).reverse(),
      hasOlder: !wantsNewer && rows.length > pageSize,
      ...(wantsNewer ? { hasNewer: rows.length > pageSize } : {}),
      userId: ctx.user.id,
    });
  } catch (caught) {
    return failure(caught);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await context();
    const parsed = writeInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      throw new ChatError("Enter a valid chat action or message.", 400);
    const data = parsed.data;
    if (data.action === "unread") {
      const { data: counts, error } = await ctx.db.rpc("request_chat_unread", {
        p_reader: ctx.user.id,
        p_requests: data.ids,
      });
      if (error) throw error;
      return NextResponse.json({ counts: counts ?? [] });
    }
    if (data.action === "read") {
      const { query } = await threadQuery(ctx, data);
      const { data: latest, error } = await query
        .eq("id", data.id)
        .maybeSingle();
      if (error) throw error;
      if (!latest) throw new ChatError("Message unavailable.", 404);
      const { error: readError } = await ctx.db.rpc(
        "advance_chat_read_position",
        {
          p_reader: ctx.user.id,
          p_kind: data.kind,
          p_thread: data.threadId,
          p_at: latest.created_at,
          p_id: latest.id,
        },
      );
      if (readError) throw readError;
      return NextResponse.json({ success: true });
    }

    if (data.kind === "request") {
      await requestAccess(ctx, data.threadId, true);
      const { data: saved, error } = await ctx.db
        .rpc("add_request_chat_message", {
          p_request: data.threadId,
          p_id: data.id,
          p_author: ctx.user.id,
          p_body: data.body,
        })
        .single();
      if (error) throw error;
      if (!saved || typeof saved !== "object")
        throw new ChatError("Message could not be saved.", 409);
      after(async () => {
        try {
          await deliverRequestChatEmails(data.id);
        } catch (caught) {
          console.error("Could not start request email delivery", caught);
        }
      });
      return NextResponse.json(
        {
          message: {
            ...saved,
            author: {
              full_name: ctx.profile.full_name,
              avatar_url: ctx.profile.avatar_url,
            },
          },
          userId: ctx.user.id,
        },
        { status: 201 },
      );
    }

    const pair = await directAccess(ctx, data.threadId);
    const { error: insertError } = await ctx.db
      .from("direct_chat_messages")
      .upsert(
        {
          id: data.id,
          admin_id: pair.adminId,
          partner_id: pair.partnerId,
          author_id: ctx.user.id,
          body: data.body,
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
    if (insertError) throw insertError;
    const { data: saved, error: lookupError } = await ctx.db
      .from("direct_chat_messages")
      .select(fields)
      .eq("id", data.id)
      .eq("admin_id", pair.adminId)
      .eq("partner_id", pair.partnerId)
      .eq("author_id", ctx.user.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!saved || saved.body !== data.body)
      throw new ChatError("Message could not be saved.", 409);
    return NextResponse.json(
      {
        message: {
          ...saved,
          author: {
            full_name: ctx.profile.full_name,
            avatar_url: ctx.profile.avatar_url,
          },
        },
        userId: ctx.user.id,
      },
      { status: 201 },
    );
  } catch (caught) {
    return failure(caught);
  }
}
