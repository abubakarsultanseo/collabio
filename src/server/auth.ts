import { cache } from "react";
import { redirect, unstable_rethrow } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { getProfile } from "@/server/profile";

export const getWorkspaceAccess = cache(async () => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await getAuthUser(supabase);
    if (!user) {
      if (error && error.status !== undefined && error.status >= 500) {
        console.error(
          "Workspace session check failed",
          error.code ?? error.status,
        );
        return { state: "auth_unavailable" } as const;
      }
      return { state: "signed_out" } as const;
    }
    const profile = await getProfile(user.id);
    if (!profile || profile.account_status !== "active")
      return { state: "account_inactive" } as const;
    return { state: "active", user, profile } as const;
  } catch (error) {
    unstable_rethrow(error);
    console.error("Workspace account verification failed", error);
    return { state: "auth_unavailable" } as const;
  }
});

export const requireUser = cache(async () => {
  const access = await getWorkspaceAccess();
  if (access.state === "signed_out") redirect("/login");
  if (
    access.state === "account_inactive" ||
    access.state === "auth_unavailable"
  )
    redirect(`/login?error=${access.state}`);
  return access.user;
});

export const requireAdmin = cache(async () => {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (profile?.role !== "admin") redirect("/dashboard");
  return user;
});
