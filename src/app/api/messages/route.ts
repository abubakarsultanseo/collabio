import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCollabEmail } from "@/lib/email-notifications";
const schema = z.object({
  requestId: z.string().uuid(),
  body: z.string().trim().min(1).max(5000),
});
async function current() {
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
  return { user, role: profile.role };
}
export async function GET() {
  try {
    const state = await current();
    if ("error" in state) return state.error;
    const db = createAdminClient();
    if (state.role !== "admin") {
      const { data: permission, error: permissionError } = await db
        .from("partner_permissions")
        .select("view_requests")
        .eq("partner_id", state.user.id)
        .maybeSingle();
      if (permissionError) throw permissionError;
      if (permission?.view_requests === false)
        return NextResponse.json(
          { error: "Request access is disabled." },
          { status: 403 },
        );
    }
    let pairs = db.from("partnerships").select("id");
    if (state.role !== "admin")
      pairs = pairs.or(
        `user_a_id.eq.${state.user.id},user_b_id.eq.${state.user.id}`,
      );
    const { data: partnerships, error: pairError } = await pairs;
    if (pairError) throw pairError;
    const ids = (partnerships ?? []).map((item) => item.id);
    if (!ids.length)
      return NextResponse.json({ messages: [], currentUserId: state.user.id });
    const { data: requests, error: requestError } = await db
      .from("requests")
      .select(
        "id,request_code:partner_request_number,partnership_id,anchor_text,sender_id,receiver_id,status,deadline_at",
      )
      .in("partnership_id", ids);
    if (requestError) throw requestError;
    const requestIds = (requests ?? []).map((item) => item.id);
    if (!requestIds.length)
      return NextResponse.json({ messages: [], currentUserId: state.user.id });
    const { data: comments, error } = await db
      .from("request_comments")
      .select("id,request_id,author_id,body,created_at")
      .in("request_id", requestIds)
      .order("created_at", { ascending: true })
      .limit(1000);
    if (error) throw error;
    const actors = [...new Set((comments ?? []).map((item) => item.author_id))];
    const { data: profiles } = actors.length
      ? await db.from("profiles").select("id,full_name,email").in("id", actors)
      : { data: [] };
    const pMap = Object.fromEntries(
      (profiles ?? []).map((item) => [item.id, item]),
    );
    const rMap = Object.fromEntries(
      (requests ?? []).map((item) => [item.id, item]),
    );
    return NextResponse.json({
      currentUserId: state.user.id,
      messages: (comments ?? []).map((item) => ({
        ...item,
        author: pMap[item.author_id] ?? null,
        request: rMap[item.request_id] ?? null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load messages.",
      },
      { status: 500 },
    );
  }
}
export async function POST(request: Request) {
  try {
    const state = await current();
    if ("error" in state) return state.error;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "Enter a message before sending." },
        { status: 400 },
      );
    const db = createAdminClient();
    const { data: row, error: rowError } = await db
      .from("requests")
      .select("id,partnership_id,partner_id,sender_id,receiver_id,anchor_text")
      .eq("id", parsed.data.requestId)
      .maybeSingle();
    if (rowError) throw rowError;
    if (!row)
      return NextResponse.json(
        { error: "Request not found." },
        { status: 404 },
      );
    const { data: pair, error: pairError } = await db
      .from("partnerships")
      .select("user_a_id,user_b_id")
      .eq("id", row.partnership_id)
      .single();
    if (pairError) throw pairError;
    if (
      state.role !== "admin" &&
      ![pair.user_a_id, pair.user_b_id].includes(state.user.id)
    )
      return NextResponse.json(
        { error: "Workspace access denied." },
        { status: 403 },
      );
    if (state.role !== "admin") {
      const { data: permission, error: permissionError } = await db
        .from("partner_permissions")
        .select("view_requests,add_comments")
        .eq("partner_id", state.user.id)
        .maybeSingle();
      if (permissionError) throw permissionError;
      if (permission?.view_requests === false)
        return NextResponse.json(
          { error: "Request access is disabled." },
          { status: 403 },
        );
      if (permission?.add_comments === false)
        return NextResponse.json(
          { error: "Your admin has disabled comments." },
          { status: 403 },
        );
    }
    const { error } = await db.from("request_comments").insert({
      request_id: row.id,
      author_id: state.user.id,
      body: parsed.data.body,
    });
    if (error) throw error;
    const recipient =
      state.user.id === row.sender_id
        ? row.receiver_id
        : state.user.id === row.receiver_id
          ? row.sender_id
          : row.partner_id;
    await db.from("notifications").insert({
      recipient_id: recipient,
      actor_id: state.user.id,
      request_id: row.id,
      type: "comment_received",
      title: "New request message",
      description: `A message was added to request: ${row.anchor_text ?? "document request"}`,
    });
    await db.from("request_activity").insert({
      request_id: row.id,
      partner_id: row.partner_id,
      actor_id: state.user.id,
      action_type: "comment_added",
      new_value: { body: parsed.data.body },
    });
    const { data: recipientProfile } = await db
      .from("profiles")
      .select("email")
      .eq("id", recipient)
      .maybeSingle();
    await sendCollabEmail(db, {
      to: recipientProfile?.email,
      requestId: row.id,
      template: "comment_received",
      subject: "New Collabio request message",
      message: "There is a new message on this request.",
      anchor: row.anchor_text,
      actorId: state.user.id,
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not send message.",
      },
      { status: 500 },
    );
  }
}
