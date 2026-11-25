import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    const { data: profile, error: profileError } = await auth
      .from("profiles")
      .select("role,account_status")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.account_status !== "active")
      return NextResponse.json(
        { error: "Active account required." },
        { status: 403 },
      );
    const params = new URL(request.url).searchParams;
    const month = params.get("month") ?? new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      return NextResponse.json(
        { error: "Choose a valid month." },
        { status: 400 },
      );
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const db = createAdminClient();
    let pairQuery = db
      .from("partnerships")
      .select("id,name,user_a_id,user_b_id");
    if (profile.role !== "admin")
      pairQuery = pairQuery.or(
        `user_a_id.eq.${user.id},user_b_id.eq.${user.id}`,
      );
    const { data: pairs, error: pairError } = await pairQuery;
    if (pairError) throw pairError;
    const ids = (pairs ?? []).map((pair) => pair.id);
    if (profile.role !== "admin") {
      const { data: permission, error } = await db
        .from("partner_permissions")
        .select("view_requests")
        .eq("partner_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (permission?.view_requests === false)
        return NextResponse.json(
          { error: "Request access is disabled." },
          { status: 403 },
        );
    }
    if (!ids.length)
      return NextResponse.json({
        month,
        summary: {
          total: 0,
          sent: 0,
          received: 0,
          live: 0,
          overdue: 0,
          accepted: 0,
          rejected: 0,
        },
        partners: [],
        statuses: [],
      });
    const { data: requests, error } = await db
      .from("requests")
      .select(
        "id,partnership_id,sender_id,receiver_id,status,was_overdue,created_at",
      )
      .in("partnership_id", ids)
      .eq("import_date_unknown", false)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at");
    if (error) throw error;
    const rows = requests ?? [];
    const summary = {
      total: rows.length,
      sent: rows.filter((row) => row.sender_id === user.id).length,
      received: rows.filter((row) => row.receiver_id === user.id).length,
      live: rows.filter((row) => row.status === "live").length,
      overdue: rows.filter((row) => row.was_overdue || row.status === "overdue")
        .length,
      accepted: rows.filter((row) => row.status === "accepted").length,
      rejected: rows.filter((row) => row.status === "rejected").length,
    };
    const partners = (pairs ?? [])
      .map((pair) => {
        const own = rows.filter((row) => row.partnership_id === pair.id);
        return {
          id: pair.id,
          name: pair.name,
          total: own.length,
          sent: own.filter((row) => row.sender_id === user.id).length,
          received: own.filter((row) => row.receiver_id === user.id).length,
          live: own.filter((row) => row.status === "live").length,
          overdue: own.filter(
            (row) => row.was_overdue || row.status === "overdue",
          ).length,
        };
      })
      .filter((item) => item.total > 0);
    const statuses = Object.entries(
      rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = (acc[row.status] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
    return NextResponse.json({ month, summary, partners, statuses });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load monthly report.",
      },
      { status: 500 },
    );
  }
}
