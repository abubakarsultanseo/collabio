import { z } from "zod";
import { requireUser } from "@/server/auth";
import { getProfile } from "@/server/profile";
import { requestList } from "@/server/request-list";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { InitialRequestList } from "@/components/requests/request-list-cache";

export async function initialRequestList(
  scope: "inbox" | "sent",
  selectedPartner?: string,
): Promise<InitialRequestList> {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  let partnershipId = z.string().uuid().safeParse(selectedPartner).data;
  if (!partnershipId) {
    const auth = await createClient();
    const { data: preference } = await auth.from("profiles").select("last_partnership_id").eq("id", user.id).maybeSingle();
    const preferred = z.string().uuid().safeParse(preference?.last_partnership_id).data;
    const admin = createAdminClient();
    let pairs = admin.from("partnerships").select("id").order("created_at", { ascending: false }).limit(1);
    if (profile?.role !== "admin") pairs = pairs.or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`);
    if (preferred) {
      let allowedQuery = admin.from("partnerships").select("id").eq("id", preferred);
      if (profile?.role !== "admin") allowedQuery = allowedQuery.or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`);
      const { data: allowed } = await allowedQuery.maybeSingle();
      if (allowed) partnershipId = preferred;
    }
    if (!partnershipId) {
      const { data: latest } = await pairs.maybeSingle();
      partnershipId = latest?.id;
    }
  }
  const params = new URLSearchParams({
    scope,
    view: "all",
    paged: "1",
    fields: "summary",
  });
  if (partnershipId) params.set("partnershipId", partnershipId);
  const response = await requestList(params, {
    user,
    role: profile?.role ?? "partner",
  });
  const data = await response.json();
  return response.ok
    ? {
        page: { requests: data.requests, nextPage: data.nextPage ?? null },
        at: Date.now(),
        partnershipId,
      }
    : {
        error: data.error ?? "Could not load requests.",
        at: Date.now(),
        partnershipId,
      };
}
