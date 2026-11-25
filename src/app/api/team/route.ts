import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const deleteSchema = z.object({ userId: z.string().uuid() });

const updateSchema = z
  .object({
    userId: z.string().uuid(),
    role: z.enum(["admin", "partner"]).optional(),
    accountStatus: z.enum(["active", "deactivated"]).optional(),
  })
  .refine(
    (value) => value.role !== undefined || value.accountStatus !== undefined,
    "Choose a role or account status to update.",
  );

async function requireAdmin() {
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
  if (error)
    return {
      error: NextResponse.json(
        { error: "Could not verify admin access." },
        { status: 500 },
      ),
    };
  if (profile?.role !== "admin" || profile.account_status !== "active")
    return {
      error: NextResponse.json(
        { error: "Admin access required." },
        { status: 403 },
      ),
    };
  return { user };
}

export async function GET() {
  try {
    const access = await requireAdmin();
    if ("error" in access) return access.error;
    const admin = createAdminClient();
    const [
      { data: members, error: membersError },
      { data: invitations, error: invitationsError },
    ] = await Promise.all([
      admin
        .from("profiles")
        .select("id,full_name,email,company,role,account_status,created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      admin
        .from("invitations")
        .select("id,email,full_name,company,status,expires_at,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (membersError) throw membersError;
    if (invitationsError) throw invitationsError;
    return NextResponse.json({
      members: members ?? [],
      invitations: invitations ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not load team.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAdmin();
    if ("error" in access) return access.error;
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid update." },
        { status: 400 },
      );
    const { userId, role, accountStatus } = parsed.data;
    if (
      userId === access.user.id &&
      (accountStatus === "deactivated" || role === "partner")
    )
      return NextResponse.json(
        {
          error:
            "You cannot deactivate your own account or remove your own admin role.",
        },
        { status: 400 },
      );
    const admin = createAdminClient();
    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("id,role,account_status")
      .eq("id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target)
      return NextResponse.json(
        { error: "Team member not found." },
        { status: 404 },
      );
    if (
      target.role === "admin" &&
      (role === "partner" || accountStatus === "deactivated") &&
      target.account_status === "active"
    ) {
      const { count, error: countError } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("account_status", "active");
      if (countError) throw countError;
      if ((count ?? 0) <= 1)
        return NextResponse.json(
          { error: "At least one active admin must remain." },
          { status: 409 },
        );
    }
    const update = {
      ...(role ? { role } : {}),
      ...(accountStatus ? { account_status: accountStatus } : {}),
    };
    const { data: member, error } = await admin
      .from("profiles")
      .update(update)
      .eq("id", userId)
      .is("deleted_at", null)
      .select("id,full_name,email,company,role,account_status,created_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not update team member.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await requireAdmin();
    if ("error" in access) return access.error;
    const parsed = deleteSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return NextResponse.json(
        { error: "Choose a partner to delete." },
        { status: 400 },
      );

    const admin = createAdminClient();
    const { data: deleted, error } = await admin.rpc(
      "delete_collabio_partner",
      {
        p_admin: access.user.id,
        p_partner: parsed.data.userId,
      },
    );
    if (error?.code === "42501")
      return NextResponse.json(
        { error: "Admin access required." },
        { status: 403 },
      );
    if (error) throw error;
    if (!deleted)
      return NextResponse.json(
        { error: "Partner account not found." },
        { status: 404 },
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Could not delete partner account", error);
    return NextResponse.json(
      { error: "Could not delete partner." },
      { status: 500 },
    );
  }
}
