import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const input = z.object({ partnershipId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const auth = await createClient();
    const { data: { user } } = await getAuthUser(auth);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose a valid partner." }, { status: 400 });
    const db = createAdminClient();
    const { data: profile, error: profileError } = await db.from("profiles").select("role,account_status").eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;
    if (profile?.account_status !== "active") return NextResponse.json({ error: "Active account required." }, { status: 403 });
    let membership = db.from("partnerships").select("id").eq("id", parsed.data.partnershipId);
    if (profile.role !== "admin") membership = membership.or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`);
    const { data: pair, error } = await membership.maybeSingle();
    if (error) throw error;
    if (!pair) return NextResponse.json({ error: "Partner workspace unavailable." }, { status: 404 });
    const { error: updateError } = await db.from("profiles").update({ last_partnership_id: pair.id }).eq("id", user.id);
    if (updateError) throw updateError;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Could not save last partnership preference", error);
    return NextResponse.json({ error: "Could not save your selected partner." }, { status: 500 });
  }
}
