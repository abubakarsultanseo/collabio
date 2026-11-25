export function returnPath(value: string | null | undefined) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return "/dashboard";
  const url = new URL(value, "https://collabio.invalid");
  if (
    ![
      "/dashboard",
      "/requests/inbox",
      "/requests/sent",
      "/pending-overdue",
      "/messages",
      "/notifications",
    ].includes(url.pathname)
  )
    return "/dashboard";
  return url.pathname + url.search;
}
