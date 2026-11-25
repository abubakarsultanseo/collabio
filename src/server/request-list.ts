import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestTypes } from "@/lib/request-content";

type RequestRecord = {
  id: string;
  partnership_id: string;
  sender_id: string;
  receiver_id: string;
  partner_id: string;
  created_at: string;
};

type Viewer = { user: { id: string }; role: string };

export async function accessiblePartnershipIds(
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

export async function requestList(url: URLSearchParams, current: Viewer) {
  try {
    const partnershipId = url.get("partnershipId");
    const scope = url.get("scope");
    const view = url.get("view");
    const paged = url.get("paged") === "1";
    const beforeAt = url.get("beforeAt");
    const beforeId = url.get("beforeId");
    if (
      (beforeAt || beforeId) &&
      (!z.string().datetime({ offset: true }).safeParse(beforeAt).success ||
        !z.string().uuid().safeParse(beforeId).success)
    )
      return NextResponse.json(
        { error: "Invalid request page." },
        { status: 400 },
      );
    const requestId = url.get("requestId");
    const summary = !requestId && url.get("fields") === "summary";
    const pageSize = summary ? 25 : 60;
    if (requestId && !z.string().uuid().safeParse(requestId).success)
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const status = url.get("status");
    const requestType = url.get("type");
    const direction = url.get("direction");
    const createdFrom = url.get("createdFrom");
    const createdTo = url.get("createdTo");
    const search = (url.get("q") ?? "")
      .replace(/[,%()\\]/g, " ")
      .trim()
      .slice(0, 80)
      .replace(/^#(\d{1,12})$/, "$1");
    const db = createAdminClient();
    const [accessibleIds, permission] = await Promise.all([
      summary && current.role === "admin" && !partnershipId
        ? Promise.resolve(null)
        : accessiblePartnershipIds(current.user.id, current.role, db),
      current.role === "admin"
        ? Promise.resolve(null)
        : db
            .from("partner_permissions")
            .select("view_requests,update_request_status")
            .eq("partner_id", current.user.id)
            .maybeSingle(),
    ]);
    if (partnershipId && !accessibleIds?.includes(partnershipId))
      return NextResponse.json(
        { error: "Workspace access denied." },
        { status: 403 },
      );
    const ids = partnershipId ? [partnershipId] : accessibleIds;
    if (ids?.length === 0)
      return NextResponse.json({ requests: [], currentSide: null });
    if (permission?.error) throw permission.error;
    if (permission?.data?.view_requests === false)
      return NextResponse.json(
        { error: "Your admin has disabled request access." },
        { status: 403 },
      );
    const partnerCanUpdateStatus =
      permission?.data?.update_request_status === true;
    const columns: string = summary
      ? "id,request_code:partner_request_number,partnership_id,partner_id,sender_id,receiver_id,placement_page_url,anchor_text,request_type,status,live_url,first_viewed_at,deadline_at,was_overdue,created_at,import_key,import_date_unknown,sender:profiles!requests_sender_id_fkey(full_name),receiver:profiles!requests_receiver_id_fkey(full_name)"
      : "id,request_code:partner_request_number,partnership_id,deal_id,link_side,partner_id,sender_id,receiver_id,direction,placement_page_url,anchor_text,target_link,request_type,instructions,notes,status,first_viewed_at,deadline_at,was_overdue,overdue_at,completed_at,created_at,updated_at,shared_at,live_at,live_url,rejection_reason,import_key,original_content,edited_content,document_url,listicle_position,attachment_name,import_date_unknown";
    let query = db
      .from("requests")
      .select(columns)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (ids) query = query.in("partnership_id", ids);
    if (beforeAt && beforeId)
      query = query.or(
        `created_at.lt.${beforeAt},and(created_at.eq.${beforeAt},id.lt.${beforeId})`,
      );
    if (requestId) query = query.eq("id", requestId);
    if (scope === "inbox") query = query.eq("receiver_id", current.user.id);
    if (scope === "sent") query = query.eq("sender_id", current.user.id);
    if (!requestId) {
      if (
        (scope === "inbox" || scope === "sent" || !scope) &&
        view === "cancelled"
      )
        query = query.eq("status", "cancelled");
      else if (scope || !partnershipId || view !== "workspace")
        query = query.neq("status", "cancelled");
    }
    if (scope === "pending" || view === "pending")
      query = query.neq("status", "live");
    if (view === "live") query = query.eq("status", "live");
    if (scope === "overdue") query = query.eq("was_overdue", true);
    if (status) query = query.eq("status", status);
    if (partnershipId) query = query.eq("partnership_id", partnershipId);
    if (requestType && requestTypes.some((type) => type === requestType))
      query = query.eq("request_type", requestType);
    if (direction === "sent") query = query.eq("sender_id", current.user.id);
    if (direction === "received")
      query = query.eq("receiver_id", current.user.id);
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
        `original_content.ilike.%${search}%`,
        `edited_content.ilike.%${search}%`,
      ];
      if (/^\d{1,12}$/.test(search))
        terms.push(`partner_request_number.eq.${Number(search)}`);
      query = query.or(terms.join(","));
    }
    const { data, error } = await query
      .limit(requestId ? 1 : paged ? pageSize + 1 : 500)
      .overrideTypes<RequestRecord[], { merge: false }>();
    if (error) throw error;
    const rows = paged ? (data ?? []).slice(0, pageSize) : (data ?? []);
    const last =
      (data?.length ?? 0) > pageSize && paged ? rows.at(-1) : undefined;
    if (!rows.length)
      return NextResponse.json({ requests: [], currentSide: null });
    const nextPage = last ? { at: last.created_at, id: last.id } : undefined;
    function capabilities(item: { sender_id: string; receiver_id: string }) {
      return {
        isReceiver: item.receiver_id === current.user.id,
        canManage: current.role === "admin",
        canChangeStatus:
          current.role === "admin" ||
          (partnerCanUpdateStatus &&
            [item.sender_id, item.receiver_id].includes(current.user.id)),
      };
    }
    if (summary)
      return NextResponse.json({
        requests: rows.map((item) => ({ ...item, ...capabilities(item) })),
        currentSide: null,
        nextPage,
      });
    const resultPartnershipIds = [
      ...new Set(rows.map((row) => row.partnership_id)),
    ];
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
        .in("id", resultPartnershipIds),
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
        ...capabilities(item),
      })),
      currentSide: null,
      nextPage,
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
