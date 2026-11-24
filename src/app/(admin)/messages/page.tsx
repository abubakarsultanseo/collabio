import MessagesWorkspace from "@/components/messages-workspace";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const { request } = await searchParams;
  return <MessagesWorkspace key={request ?? "direct"} requestId={request} />;
}
