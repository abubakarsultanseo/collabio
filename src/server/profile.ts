import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getProfile = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id,full_name,email,role,account_status,avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
});
