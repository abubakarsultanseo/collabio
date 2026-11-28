import { requireAdmin } from "@/server/auth";
import { ImportRequests } from "@/components/requests/import-requests";

export default async function ImportPage() {
  await requireAdmin();
  return <ImportRequests />;
}
