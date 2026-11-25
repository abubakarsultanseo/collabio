import { z } from "zod";
import { requireUser } from "@/server/auth";
import { getProfile } from "@/server/profile";
import { requestList } from "@/server/request-list";
import type { InitialRequestList } from "@/components/requests/request-list-cache";

export async function initialRequestList(
  scope: "inbox" | "sent",
  selectedPartner?: string,
): Promise<InitialRequestList> {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const partnershipId = z.string().uuid().safeParse(selectedPartner).data;
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
