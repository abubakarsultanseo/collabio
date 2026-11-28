import { z } from "zod";
import { exchangeRatios } from "@/lib/exchanges";
import type { createAdminClient } from "@/lib/supabase/admin";

export const exchangeInput = {
  dealId: z
    .union([z.string().uuid(), z.literal("").transform(() => null)])
    .nullish(),
  exchangeRatio: z
    .union([z.enum(exchangeRatios), z.literal("").transform(() => undefined)])
    .optional(),
};

const savedRequests = z.array(
  z.object({
    id: z.string().uuid(),
    request_code: z.number(),
    deadline_at: z.string(),
    anchor_text: z.string().nullable(),
    deal_id: z.string().uuid().nullable(),
  }),
);

export async function createRequestBatch(
  db: ReturnType<typeof createAdminClient>,
  requests: object[],
) {
  const { data, error } = await db.rpc("create_collabio_exchange_requests", {
    p_requests: requests,
  });
  return { rows: error ? [] : savedRequests.parse(data), error };
}
