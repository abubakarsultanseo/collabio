import { requestTypes } from "@/lib/request-content";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createXlsx } from "@/lib/xlsx";

function csv(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}
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
    const scope = params.get("scope");
    const status = params.get("status");
    const requestType = params.get("type");
    const direction = params.get("direction");
    const partnershipId = params.get("partnershipId");
    const createdFrom = params.get("createdFrom");
    const createdTo = params.get("createdTo");
    const search = (params.get("q") ?? "")
      .replace(/[,%()\\]/g, " ")
      .trim()
      .slice(0, 80);
    const format = params.get("format") === "xlsx" ? "xlsx" : "csv";
    const db = createAdminClient();
    if (profile.role !== "admin") {
      const { data: permission, error } = await db
        .from("partner_permissions")
        .select("download_reports")
        .eq("partner_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (permission?.download_reports !== true)
        return NextResponse.json(
          { error: "Your admin has disabled report downloads." },
          { status: 403 },
        );
    }
    let pairs = db.from("partnerships").select("id,name");
    if (profile.role !== "admin")
      pairs = pairs.or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`);
    const { data: partnerships, error } = await pairs;
    if (error) throw error;
    let ids = (partnerships ?? []).map((item) => item.id);
    if (partnershipId) {
      if (!ids.includes(partnershipId))
        return NextResponse.json(
          { error: "Workspace access denied." },
          { status: 403 },
        );
      ids = [partnershipId];
    }
    const emptyHeaders = [
      "Request #",
      "Workspace",
      "Status",
      "Direction",
      "Sender",
      "Receiver",
      "Placement Page",
      "Anchor Text",
      "Target URL",
      "Type",
      "Instructions",
      "Notes",
      "Created At",
      "First Viewed At",
      "Deadline",
      "Overdue",
      "Original Content",
      "Edited Content",
      "Document URL",
      "Listicle Position",
      "Attachment",
    ];
    if (!ids.length) {
      if (format === "xlsx") {
        const file = createXlsx(emptyHeaders, [], "Requests");
        return new Response(file, {
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition":
              "attachment; filename=collabio-requests.xlsx",
          },
        });
      }
      return new Response(`\uFEFF${emptyHeaders.map(csv).join(",")}\r\n`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=collabio-requests.csv",
        },
      });
    }
    let query = db
      .from("requests")
      .select(
        "request_code,status,direction,sender_id,receiver_id,placement_page_url,anchor_text,target_link,request_type,instructions,notes,created_at,first_viewed_at,deadline_at,partnership_id,was_overdue,import_date_unknown,original_content,edited_content,document_url,listicle_position,attachment_name",
      )
      .in("partnership_id", ids)
      .order("created_at", { ascending: false });
    if (scope === "inbox") query = query.eq("receiver_id", user.id);
    if (scope === "sent") query = query.eq("sender_id", user.id);
    if (scope === "pending")
      query = query.not("status", "in", "(live,rejected,cancelled)");
    if (scope === "overdue") query = query.eq("was_overdue", true);
    if (status) query = query.eq("status", status);
    if (requestType && requestTypes.some((type) => type === requestType))
      query = query.eq("request_type", requestType);
    if (direction === "sent") query = query.eq("sender_id", user.id);
    if (direction === "received") query = query.eq("receiver_id", user.id);
    if (createdFrom && /^\d{4}-\d{2}-\d{2}$/.test(createdFrom))
      query = query
        .eq("import_date_unknown", false)
        .gte("created_at", `${createdFrom}T00:00:00.000Z`);
    if (createdTo && /^\d{4}-\d{2}-\d{2}$/.test(createdTo)) {
      const end = new Date(`${createdTo}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      query = query
        .eq("import_date_unknown", false)
        .lt("created_at", end.toISOString());
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
    const { data: rows, error: rowsError } = await query;
    if (rowsError) throw rowsError;
    const userIds = [
      ...new Set(
        (rows ?? []).flatMap((row) => [row.sender_id, row.receiver_id]),
      ),
    ];
    const [{ data: people }, { data: workspaceRows }] = await Promise.all([
      userIds.length
        ? db.from("profiles").select("id,full_name").in("id", userIds)
        : Promise.resolve({ data: [] }),
      ids.length
        ? db.from("partnerships").select("id,name").in("id", ids)
        : Promise.resolve({ data: [] }),
    ]);
    const names = Object.fromEntries(
      (people ?? []).map((person) => [person.id, person.full_name]),
    );
    const workspaces = Object.fromEntries(
      (workspaceRows ?? []).map((pair) => [pair.id, pair.name]),
    );
    const values = (rows ?? []).map((row) => [
      row.request_code,
      workspaces[row.partnership_id] ?? "",
      row.status,
      row.direction,
      names[row.sender_id] ?? "",
      names[row.receiver_id] ?? "",
      row.placement_page_url,
      row.anchor_text,
      row.target_link,
      row.request_type,
      row.instructions ?? "",
      row.notes ?? "",
      row.import_date_unknown ? "" : row.created_at,
      row.first_viewed_at ?? "",
      row.deadline_at,
      row.was_overdue ? "Yes" : "No",
      row.original_content ?? "",
      row.edited_content ?? "",
      row.document_url ?? "",
      row.listicle_position ?? "",
      row.attachment_name ?? "",
    ]);
    if (format === "xlsx") {
      const file = createXlsx(emptyHeaders, values, "Requests");
      return new Response(file, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": "attachment; filename=collabio-requests.xlsx",
        },
      });
    }
    const lines = [
      emptyHeaders.map(csv).join(","),
      ...values.map((row) => row.map(csv).join(",")),
    ];
    return new Response(`\uFEFF${lines.join("\r\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=collabio-requests.csv",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not export requests.",
      },
      { status: 500 },
    );
  }
}
