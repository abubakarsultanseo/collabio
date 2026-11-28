export function notificationLink(item: {
  type: string;
  request_id: string | null;
  id: string;
}) {
  if (!item.request_id) return `/notifications#notification-${item.id}`;
  const path =
    item.type === "comment_received" ? "/messages" : "/requests/inbox";
  return `${path}?request=${encodeURIComponent(item.request_id)}`;
}
