import type { ReactNode } from "react";
import { RequestListProvider } from "@/components/requests/request-list-cache";
import { requireUser } from "@/server/auth";

export default async function RequestsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  return <RequestListProvider key={user.id}>{children}</RequestListProvider>;
}
