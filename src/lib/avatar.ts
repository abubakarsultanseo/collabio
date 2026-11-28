export function googleAvatar(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      /(^|\.)googleusercontent\.com$/i.test(url.hostname)
    )
      return url.href;
  } catch {
    /* use initials for invalid photos */
  }
  return null;
}
