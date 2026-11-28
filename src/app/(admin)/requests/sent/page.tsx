import RequestListWorkspace from "@/components/request-list-workspace";
import { initialRequestList } from "@/server/request-page";

export default async function SentRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string }>;
}) {
  const { partner } = await searchParams;
  return (
    <RequestListWorkspace
      scope="sent"
      title="Requests Sent"
      initial={await initialRequestList("sent", partner)}
    />
  );
}
