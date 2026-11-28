import type { Metadata } from "next";
import { RequestFormatter } from "@/components/requests/request-formatter";

export const metadata: Metadata = { title: "Format Request | Collabio" };

export default function FormatRequestPage() {
  return (
    <div className="page-enter mx-auto max-w-7xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Format Request</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Turn pasted spreadsheet rows or rough notes into copy-ready link
          requests.
        </p>
      </header>
      <RequestFormatter />
    </div>
  );
}
