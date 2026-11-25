import RequestListWorkspace from "@/components/request-list-workspace";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const { request } = await searchParams;
  return (
    <RequestListWorkspace
      scope="inbox"
      title="Requests Inbox"
      initialRequestId={request}
    />
  );
}
