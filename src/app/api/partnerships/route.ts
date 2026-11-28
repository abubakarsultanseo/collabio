import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  name: z.string().trim().min(2).max(140),
  partnerId: z.string().uuid(),
});
async function current() {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user)
    return {
      error: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
    };
  const { data: profile } = await auth
    .from("profiles")
    .select("role,account_status")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.account_status !== "active")
    return {
      error: NextResponse.json(
        { error: "Active account required" },
        { status: 403 },
      ),
    };
  return { user, auth, role: profile.role };
}
export async function GET() {
  try {
    const state = await current();
    if ("error" in state) return state.error;
    const admin = createAdminClient();
    let query = admin
      .from("listed_partnerships")
      .select("id,name,user_a_id,user_b_id,created_at")
      .order("created_at", { ascending: false });
    if (state.role !== "admin")
      query = query.or(
        `user_a_id.eq.${state.user.id},user_b_id.eq.${state.user.id}`,
      );
    const { data, error } = await query;
    if (error) throw error;
    const pairs = data ?? [];
    const partnerIds = [
      ...new Set(
        pairs.flatMap((pair) =>
          pair.user_a_id === state.user.id
            ? [pair.user_b_id]
            : pair.user_b_id === state.user.id
              ? [pair.user_a_id]
              : [],
        ),
      ),
    ];
    const people = partnerIds.length
      ? await admin.from("profiles").select("id,full_name").in("id", partnerIds)
      : null;
    if (people?.error) throw people.error;
    const names = new Map(
      (people?.data ?? []).map((person) => [person.id, person.full_name]),
    );
    return NextResponse.json({
      partnerships: pairs.map((pair) => ({
        ...pair,
        counterpart_name:
          names.get(
            pair.user_a_id === state.user.id ? pair.user_b_id : pair.user_a_id,
          ) ?? pair.name,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load partnerships" },
      { status: 500 },
    );
  }
}
export async function POST(request: Request) {
  try {
    const state = await current();
    if ("error" in state) return state.error;
    if (state.role !== "admin")
      return NextResponse.json(
        { error: "Only an admin can create a partner workspace." },
        { status: 403 },
      );
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    const { data, error } = await state.auth.rpc("create_partnership", {
      peer_id: parsed.data.partnerId,
      partnership_name: parsed.data.name,
    });
    if (error) throw error;
    return NextResponse.json({ id: data, success: true }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Could not create partnership",
      },
      { status: 500 },
    );
  }
}
