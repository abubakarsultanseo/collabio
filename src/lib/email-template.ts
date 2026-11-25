type Field = readonly [label: string, value: string];

type Email = {
  title: string;
  message: string;
  recipient?: string;
  fields?: Field[];
  href?: string;
  action?: string;
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char] ?? char,
  );
}

export function collabioUrl(path: string) {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!base) return undefined;
  try {
    const url = new URL(path, base);
    return ["https:", "http:"].includes(url.protocol)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function renderCollabioEmail({
  title,
  message,
  recipient,
  fields = [],
  href,
  action = "Open in Collabio",
}: Email) {
  const greeting = recipient ? `Hi ${recipient},` : "";
  const rows = fields
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px 8px 0;color:#475569;vertical-align:top;width:30%;">${escapeHtml(label)}</td><td style="padding:8px 0;font-weight:600;overflow-wrap:anywhere;">${escapeHtml(value).replace(/\r?\n/g, "<br>")}</td></tr>`,
    )
    .join("");
  const link = href ? escapeHtml(href) : undefined;
  const home = collabioUrl("/");
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#eef2fa;color:#172033;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2fa;"><tr><td align="center" style="padding:28px 14px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;text-align:left;"><tr><td style="padding:0 4px 16px;color:#174ea6;font-size:22px;font-weight:700;">Collabio</td></tr>
  <tr><td style="background:#ffffff;border:1px solid #d8e0ee;border-top:4px solid #1a73e8;border-radius:16px;padding:24px;">
  <h1 style="margin:0 0 16px;font-size:25px;line-height:1.25;">${escapeHtml(title)}</h1>
  ${greeting ? `<p style="margin:0 0 10px;">${escapeHtml(greeting)}</p>` : ""}
  <p style="margin:0 0 18px;line-height:1.55;">${escapeHtml(message)}</p>
  ${rows ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fd;border:1px solid #e0e8f6;border-radius:10px;font-size:14px;line-height:1.45;padding:8px 12px;">${rows}</table>` : ""}
  ${link ? `<p style="margin:22px 0 12px;"><a href="${link}" style="display:inline-block;background:#174ea6;color:#ffffff;border-radius:8px;padding:13px 18px;font-weight:700;text-decoration:none;">${escapeHtml(action)}</a></p><p style="font-size:12px;color:#475569;overflow-wrap:anywhere;"><a href="${link}" style="color:#174ea6;">${link}</a></p>` : ""}
  <p style="margin:20px 0 0;font-size:13px;line-height:1.5;">The Collabio Team<br><span style="color:#475569;">Partner outreach workspace</span></p></td></tr>
  ${home ? `<tr><td style="padding:14px 4px;font-size:12px;"><a href="${escapeHtml(home)}" style="color:#174ea6;">Collabio workspace</a></td></tr>` : ""}
  </table></td></tr></table></body></html>`;
  const text = [
    title,
    greeting,
    message,
    ...fields.map(([label, value]) => `${label}: ${value}`),
    href ? `${action}: ${href}` : "",
    "The Collabio Team",
    home ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return { html, text };
}
