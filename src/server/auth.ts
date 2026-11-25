import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/server/profile";

export const requireUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const profile = await getProfile(user.id);
  if (!profile || profile.account_status !== "active")
    redirect("/login?error=account_inactive");
  return user;
});

export const requireAdmin = cache(async () => {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (profile?.role !== "admin") redirect("/dashboard");
  return user;
});
