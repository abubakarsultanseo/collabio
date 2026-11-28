import RequestListWorkspace from "@/components/request-list-workspace";
import { initialRequestList } from "@/server/request-page";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string; partner?: string }>;
}) {
  const { request, partner } = await searchParams;
  const initial = await initialRequestList("inbox", partner);
  return (
    <RequestListWorkspace
      scope="inbox"
      title="Requests Inbox"
      initialRequestId={request}
      initial={initial}
    />
  );
}
