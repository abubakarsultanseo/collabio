import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { importFormats } from "@/lib/request-import-templates";
import { parseImport } from "@/lib/import-requests";

const input = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  name: z.string().trim().min(1).max(100),
  csv: z.string().min(1).max(2_000_000),
  action: z.enum(["preview", "import"]),
  format: z.enum(importFormats).default("standard"),
  direction: z.enum(["sent", "received"]).optional(),
  blockName: z.string().trim().max(100).optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await createClient();
    const {
      data: { user },
    } = await getAuthUser(auth);
    if (!user)
      return NextResponse.json(
        { error: "Sign in to continue." },
        { status: 401 },
      );
    const { data: account, error: authError } = await auth
      .from("profiles")
      .select("role,account_status")
      .eq("id", user.id)
      .maybeSingle();
    if (authError) throw authError;
    if (account?.role !== "admin" || account.account_status !== "active")
      return NextResponse.json(
        { error: "Only admins can import requests." },
        { status: 403 },
      );
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        {
          error:
            "Enter the partner name and Google email, and provide a CSV under 2 MB.",
        },
        { status: 400 },
      );
    const { email, name, csv, action } = parsed.data;
    let source;
    try {
      source = parseImport(csv, parsed.data);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid CSV." },
        { status: 400 },
      );
    }

    const db = createAdminClient();
    const { data: partner, error: profileError } = await db
      .from("profiles")
      .select("id,role,account_status")
      .eq("email", email)
      .maybeSingle();
    if (profileError) throw profileError;
    if (
      partner &&
      (partner.role !== "partner" || partner.account_status === "deactivated")
    )
      return NextResponse.json(
        {
          error:
            "This email belongs to a deactivated account or an administrator.",
        },
        { status: 422 },
      );

    const imported = new Set<string>();
    const native = new Set<string>();
    function signature(
      sender: string,
      placement: string,
      target: string | null,
      anchor: string | null,
      created: string,
    ) {
      return JSON.stringify([
        sender,
        placement,
        target,
        anchor,
        new Date(created).toISOString(),
      ]);
    }
    if (partner) {
      const { data: pair, error } = await db
        .from("partnerships")
        .select("id")
        .or(
          `and(user_a_id.eq.${user.id},user_b_id.eq.${partner.id}),and(user_a_id.eq.${partner.id},user_b_id.eq.${user.id})`,
        )
        .maybeSingle();
      if (error) throw error;
      if (pair) {
        const page = 200;
        for (let offset = 0; ; offset += page) {
          const { data, error } = await db
            .from("requests")
            .select(
              "id,import_key,sender_id,placement_page_url,target_link,anchor_text,created_at",
            )
            .eq("partnership_id", pair.id)
            .order("id")
            .range(offset, offset + page - 1);
          if (error) throw error;
          for (const row of data ?? []) {
            if (row.import_key) imported.add(row.import_key);
            else
              native.add(
                signature(
                  row.sender_id,
                  row.placement_page_url,
                  row.target_link,
                  row.anchor_text,
                  row.created_at,
                ),
              );
          }
          if ((data?.length ?? 0) < page) break;
        }
      }
    }

    const ready = source.rows.filter(
      (row) =>
        !imported.has(row.key) &&
        (!row.created ||
          !native.has(
            signature(
              row.direction === "sent" ? user.id : (partner?.id ?? ""),
              row.placement,
              row.target,
              row.anchor,
              row.created,
            ),
          )),
    );
    const summary = {
      email,
      name,
      sent: ready.filter((row) => row.direction === "sent").length,
      received: ready.filter((row) => row.direction === "received").length,
      duplicates: source.rows.length - ready.length,
      accountStatus: partner?.account_status ?? "pending",
      issues: source.issues,
      unknownDates: ready.filter((row) => !row.created).length,
      sample: ready
        .slice(0, 10)
        .map(({ line, direction, placement, anchor, status, type }) => ({
          line,
          direction,
          placement,
          anchor: anchor || type.replaceAll("_", " "),
          status,
        })),
    };
    if (action === "preview") return NextResponse.json(summary);
    if (source.issues.length)
      return NextResponse.json(
        { error: "Fix the flagged rows and preview the CSV again." },
        { status: 422 },
      );
    if (!ready.length) return NextResponse.json({ ...summary, inserted: 0 });

    let partnerId = partner?.id;
    if (!partnerId) {
      const { data, error } = await db.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: name },
      });
      if (error) {
        const { data: existing } = await db
          .from("profiles")
          .select("id")
          .eq("email", email)
          .eq("role", "partner")
          .eq("account_status", "pending")
          .maybeSingle();
        if (!existing) throw error;
        partnerId = existing.id;
      } else partnerId = data.user?.id;
      if (!partnerId) throw new Error("Could not stage partner.");
    }
    const { data: inserted, error } = await db.rpc("import_collabio_requests", {
      p_admin: user.id,
      p_partner: partnerId,
      p_rows: ready,
    });
    if (error) throw error;
    return NextResponse.json({ ...summary, inserted });
  } catch (error) {
    console.error("Request import failed", error);
    return NextResponse.json(
      {
        error:
          "Could not complete the import. Correct any flagged rows and try again.",
      },
      { status: 500 },
    );
  }
}
