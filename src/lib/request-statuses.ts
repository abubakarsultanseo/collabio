export const requestStatuses = [
  "new_request",
  "seen",
  "reviewing",
  "accepted",
  "rejected",
  "in_progress",
  "live",
  "shared",
  "hold",
  "waiting_for_partner",
  "removed",
  "cancelled",
  "overdue",
] as const;

export const requestViews = [
  { value: "all", label: "All Requests" },
  { value: "pending", label: "Pending" },
  { value: "live", label: "Live" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export type RequestView = (typeof requestViews)[number]["value"];

export function matchesRequestView(status: string, view: RequestView) {
  if (view === "cancelled") return status === "cancelled";
  if (view === "live") return status === "live";
  return status !== "cancelled" && (view !== "pending" || status !== "live");
}
