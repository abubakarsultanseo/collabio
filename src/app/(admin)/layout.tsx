import { ChatHost } from "@/components/chat/chat-drawer";
import { Suspense, type ReactNode } from "react";
import NavigationProgress from "@/components/app/navigation-progress";
import AppNavigation from "@/components/app-navigation";
import { Topbar } from "@/components/app/topbar";
import { requireUser } from "@/server/auth";
import { getProfile } from "@/server/profile";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const role = profile?.role ?? "partner";

  return (
    <>
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <AppNavigation isAdmin={role === "admin"} />
      <ChatHost isAdmin={role === "admin"}>
        <main className="min-h-screen min-w-0 pb-24 lg:ml-60 lg:pb-0">
          <div className="w-full px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
            <Topbar
              profile={{
                name: profile?.full_name || user.email || "Account",
                email: profile?.email ?? user.email ?? "",
                role,
                status: profile?.account_status ?? "active",
              }}
            />
            {children}
          </div>
        </main>
      </ChatHost>
    </>
  );
}
