import { redirect } from "next/navigation";
export default async function SentRequestsPage({ searchParams }: { searchParams: Promise<{ request?: string; partner?: string }> }) {
  const params = await searchParams;
  const query = new URLSearchParams({ view: "sent" });
  if (params.partner) query.set("partner", params.partner);
  if (params.request) query.set("request", params.request);
  redirect(`/requests?${query.toString()}`);
}
