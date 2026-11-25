import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z
  .object({
    partnershipId: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    sideAQuota: z.number().int().min(0).max(10000),
    sideBQuota: z.number().int().min(0).max(10000),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (x) => x.sideAQuota + x.sideBQuota > 0,
    "At least one quota must be greater than zero.",
  );
const editSchema = z
  .object({
    dealId: z.string().uuid(),
    sideAQuota: z.number().int().min(0).max(10000),
    sideBQuota: z.number().int().min(0).max(10000),
  })
  .refine(
    (x) => x.sideAQuota + x.sideBQuota > 0,
    "At least one quota must be greater than zero.",
  );
async function session() {
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
  const { data: p } = await auth
    .from("profiles")
    .select("role,account_status")
    .eq("id", user.id)
    .maybeSingle();
  if (p?.account_status !== "active")
    return {
      error: NextResponse.json(
        { error: "Active account required" },
        { status: 403 },
      ),
    };
  return { auth, user, role: p.role };
}
async function access(partnershipId: string, userId: string) {
  const db = createAdminClient();
  const { data, error } = await db
    .from("partnerships")
    .select("id,user_a_id,user_b_id")
    .eq("id", partnershipId)
    .maybeSingle();
  if (error) throw error;
  if (!data || ![data.user_a_id, data.user_b_id].includes(userId)) return false;
  return data;
}
export async function GET(request: Request) {
  try {
    const state = await session();
    if ("error" in state) return state.error;
    const id = z
      .string()
      .uuid()
      .safeParse(new URL(request.url).searchParams.get("partnershipId"));
    if (!id.success)
      return NextResponse.json(
        { error: "Choose a partner workspace." },
        { status: 400 },
      );
    const pair = await access(id.data, state.user.id);
    if (!pair && state.role !== "admin")
      return NextResponse.json(
        { error: "Partnership access denied." },
        { status: 403 },
      );
    const db = createAdminClient();
    if (state.role !== "admin") {
      const { data, error } = await db
        .from("partner_permissions")
        .select("view_requests")
        .eq("partner_id", state.user.id)
        .maybeSingle();
      if (error) throw error;
      if (data?.view_requests === false)
        return NextResponse.json(
          { error: "Request access is disabled." },
          { status: 403 },
        );
    }
    const side = !pair ? null : pair.user_a_id === state.user.id ? "a" : "b";
    const counterpart =
      pair && (side === "a" ? pair.user_b_id : pair.user_a_id);
    const [legacy, progress, summary, partner] = await Promise.all([
      db
        .from("deal_balance")
        .select("*")
        .eq("partnership_id", id.data)
        .order("deal_id"),
      db
        .from("tracked_exchange_balances")
        .select(
          "id,status,side_a_quota,side_b_quota,side_a_live,side_b_live,side_a_due,side_b_due,first_link_side,first_link_live_at,opening_request_number",
        )
        .eq("partnership_id", id.data)
        .neq("status", "cancelled")
        .order("status", { ascending: false })
        .order("created_at", { ascending: false }),
      db
        .from("partnership_exchange_summary")
        .select("*")
        .eq("partnership_id", id.data)
        .maybeSingle(),
      counterpart
        ? db
            .from("profiles")
            .select("full_name")
            .eq("id", counterpart)
            .maybeSingle()
        : Promise.resolve(null),
    ]);
    if (legacy.error || progress.error || summary.error || partner?.error)
      throw legacy.error ?? progress.error ?? summary.error ?? partner?.error;
    const counts = summary.data;
    const balance = {
      given: (side === "a" ? counts?.side_a_given : counts?.side_b_given) ?? 0,
      received:
        (side === "a" ? counts?.side_b_given : counts?.side_a_given) ?? 0,
      giveDue: (side === "a" ? counts?.side_a_due : counts?.side_b_due) ?? 0,
      receiveDue: (side === "a" ? counts?.side_b_due : counts?.side_a_due) ?? 0,
    };
    return NextResponse.json({
      deals: legacy.data ?? [],
      sideAId: pair ? pair.user_a_id : undefined,
      sideBId: pair ? pair.user_b_id : undefined,
      overview: {
        side,
        partnerName: partner?.data?.full_name || "Partner",
        balance,
        exchanges: (progress.data ?? []).map(
          ({ opening_request_number, ...exchange }) => ({
            ...exchange,
            openingRequestNumber: opening_request_number,
          }),
        ),
      },
    });
  } catch (error) {
    console.error("Exchange overview failed", error);
    return NextResponse.json(
      { error: "Could not load the exchange balance." },
      { status: 500 },
    );
  }
}
export async function POST(request: Request) {
  try {
    const s = await session();
    if ("error" in s) return s.error;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    const pair = await access(parsed.data.partnershipId, s.user.id);
    if (!pair && s.role !== "admin")
      return NextResponse.json(
        { error: "Partnership access denied" },
        { status: 403 },
      );
    const db = createAdminClient();
    const { data, error } = await db
      .from("deals")
      .insert({
        partnership_id: parsed.data.partnershipId,
        name: parsed.data.name,
        side_a_quota: parsed.data.sideAQuota,
        side_b_quota: parsed.data.sideBQuota,
        notes: parsed.data.notes || null,
        created_by: s.user.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ id: data.id, success: true }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not create deal" },
      { status: 500 },
    );
  }
}
export async function PATCH(request: Request) {
  try {
    const s = await session();
    if ("error" in s) return s.error;
    const parsed = editSchema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    const db = createAdminClient();
    const { data: deal, error: findError } = await db
      .from("deals")
      .select("id,partnership_id")
      .eq("id", parsed.data.dealId)
      .maybeSingle();
    if (findError) throw findError;
    if (!deal)
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    const pair = await access(deal.partnership_id, s.user.id);
    if (!pair && s.role !== "admin")
      return NextResponse.json(
        { error: "Partnership access denied" },
        { status: 403 },
      );
    const { error } = await db
      .from("deals")
      .update({
        side_a_quota: parsed.data.sideAQuota,
        side_b_quota: parsed.data.sideBQuota,
        last_updated_by: s.user.id,
      })
      .eq("id", deal.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not update quotas" },
      { status: 500 },
    );
  }
}
