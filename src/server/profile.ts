import { cache } from "react";
import { missingColumn } from "@/lib/supabase/schema-error";
import { createClient } from "@/lib/supabase/server";

export const getProfile = cache(async (userId: string) => {
  const supabase = await createClient();
  const fields = "id,full_name,email,role,account_status";
  const result = await supabase
    .from("profiles")
    .select(`${fields},avatar_url`)
    .eq("id", userId)
    .maybeSingle();
  if (missingColumn(result.error, "avatar_url")) {
    const legacy = await supabase
      .from("profiles")
      .select(fields)
      .eq("id", userId)
      .maybeSingle();
    if (legacy.error) throw new Error(legacy.error.message);
    return legacy.data ? { ...legacy.data, avatar_url: null } : null;
  }
  if (result.error) throw new Error(result.error.message);
  return result.data;
});
