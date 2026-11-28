import { after } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createRequestBatch, exchangeInput } from "@/lib/exchange-input";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  contentInput,
  expandRequestContent,
  guestPostLinksInput,
} from "@/lib/request-input";
import { maxRequestsPerSubmission } from "@/lib/request-content";
import { sendCollabEmail } from "@/lib/email-notifications";

const itemSchema = contentInput.extend({
  ...exchangeInput,
  guestPostLinks: guestPostLinksInput,
});
const schema = z.object({
  partnershipId: z.string().uuid(),
  requests: z.array(itemSchema).min(1).max(maxRequestsPerSubmission),
});
export async function POST(request: Request) {
  try {
    const auth = await createClient();
    const {
      data: { user },
    } = await getAuthUser(auth);
    if (!user)
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    const { data: profile, error: profileError } = await auth
      .from("profiles")
      .select("role,account_status,full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.account_status !== "active")
      return NextResponse.json(
        { error: "Active account required." },
        { status: 403 },
      );
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Enter valid request details.",
        },
        { status: 400 },
      );
    const entries = parsed.data.requests.map((item) => ({
      item,
      ...expandRequestContent(item),
    }));
    const invalid = entries.find((entry) => !entry.rows);
    if (invalid)
      return NextResponse.json({ error: invalid.issue }, { status: 400 });
    const total = entries.reduce(
      (count, entry) => count + (entry.rows?.length ?? 0),
      0,
    );
    if (total > maxRequestsPerSubmission)
      return NextResponse.json(
        {
          error: `Send up to ${maxRequestsPerSubmission} requests per submission, including guest post links.`,
        },
        { status: 400 },
      );
    const db = createAdminClient();
    let pairs = db.from("partnerships").select("id,name,user_a_id,user_b_id");
    if (profile.role !== "admin")
      pairs = pairs.or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`);
    const { data: accessible, error: pairError } = await pairs;
    if (pairError) throw pairError;
    const pair = (accessible ?? []).find(
      (item) => item.id === parsed.data.partnershipId,
    );
    if (!pair)
      return NextResponse.json(
        { error: "Workspace access denied." },
        { status: 403 },
      );
    const receiverId =
      pair.user_a_id === user.id ? pair.user_b_id : pair.user_a_id;
    const { data: people, error: peopleError } = await db
      .from("profiles")
      .select("id,role,account_status,email,full_name")
      .in("id", [pair.user_a_id, pair.user_b_id]);
    if (peopleError) throw peopleError;
    const receiver = people?.find((item) => item.id === receiverId);
    const partner = people?.find((item) => item.role === "partner");
    if (
      !receiver ||
      receiver.account_status !== "active" ||
      !partner ||
      partner.account_status !== "active"
    )
      return NextResponse.json(
        { error: "Both workspace members must have active accounts." },
        { status: 409 },
      );
    if (profile.role !== "admin") {
      const { data: permission, error } = await db
        .from("partner_permissions")
        .select("add_new_requests")
        .eq("partner_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (permission?.add_new_requests === false)
        return NextResponse.json(
          { error: "Your admin has disabled new requests for your account." },
          { status: 403 },
        );
    }
    if (![pair.user_a_id, pair.user_b_id].includes(user.id))
      return NextResponse.json(
        { error: "Workspace access denied." },
        { status: 403 },
      );
    const direction =
      profile.role === "admin" ? "admin_to_partner" : "partner_to_admin";
    const payload = entries.flatMap(({ item, rows }) =>
      (rows ?? []).map((columns) => ({
        partnership_id: pair.id,
        deal_id: item.dealId ?? null,
        exchange_ratio: item.exchangeRatio,
        partner_id: partner.id,
        sender_id: user.id,
        receiver_id: receiverId,
        direction,
        ...columns,
      })),
    );
    const { rows: created, error: createError } = await createRequestBatch(
      db,
      payload,
    );
    if (createError?.message.startsWith("Choose an open exchange"))
      return NextResponse.json({ error: createError.message }, { status: 409 });
    if (createError) throw createError;
    after(async () => {
      await Promise.all(
        (created ?? []).map((row) =>
          sendCollabEmail(db, {
            to: receiver.email,
            requestId: row.id,
            template: "new_request",
            subject: "New Collabio request",
            message: `${profile.full_name ?? "A workspace member"} sent you a collaboration request.`,
            anchor: row.anchor_text,
            actor: profile.full_name,
          }),
        ),
      );
    });
    return NextResponse.json(
      { success: true, created: created ?? [], count: created?.length ?? 0 },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create bulk requests.",
      },
      { status: 500 },
    );
  }
}
