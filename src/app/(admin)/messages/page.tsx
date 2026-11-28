import { requireUser } from "@/server/auth";
import { getProfile } from "@/server/profile";
import MessagesWorkspace from "@/components/messages-workspace";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const [{ request }, user] = await Promise.all([searchParams, requireUser()]);
  const profile = await getProfile(user.id);
  return (
    <MessagesWorkspace
      key={request ?? "direct"}
      requestId={request}
      assignedPartner={profile?.role === "partner"}
    />
  );
}
