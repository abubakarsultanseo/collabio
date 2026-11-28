import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ id: z.string().uuid() });
async function access() {
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
    .select("account_status")
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
  return { user };
}
export async function GET(request: Request) {
  try {
    const state = await access();
    if ("error" in state) return state.error;
    const db = createAdminClient();
    const mode = new URL(request.url).searchParams.get("mode");
    const count = () =>
      db
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", state.user.id)
        .is("read_at", null);
    if (mode === "count") {
      const { count: unread, error } = await count();
      if (error) throw error;
      return NextResponse.json({ unread: unread ?? 0 });
    }
    const listing = db
      .from("notifications")
      .select("id,request_id,type,title,description,read_at,created_at")
      .eq("recipient_id", state.user.id)
      .order("created_at", { ascending: false })
      .limit(mode === "preview" ? 8 : 100);
    const [{ data, error }, unread] = await Promise.all([
      listing,
      mode === "preview" ? count() : Promise.resolve(null),
    ]);
    if (error) throw error;
    if (unread?.error) throw unread.error;
    return NextResponse.json({
      notifications: data ?? [],
      ...(unread ? { unread: unread.count ?? 0 } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load notifications.",
      },
      { status: 500 },
    );
  }
}
export async function PATCH(request: Request) {
  try {
    const state = await access();
    if ("error" in state) return state.error;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid notification." },
        { status: 400 },
      );
    const db = createAdminClient();
    const { error } = await db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", parsed.data.id)
      .eq("recipient_id", state.user.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not update notification.",
      },
      { status: 500 },
    );
  }
}
