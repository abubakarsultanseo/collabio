import { createHash } from "node:crypto";
import { z } from "zod";

export const importColumns = [
  "direction",
  "placement",
  "anchor",
  "target",
  "type",
  "status",
  "created",
  "notes",
  "instructions",
  "reason",
  "updated",
  "viewed",
  "deadline",
  "source_id",
];

function csvRows(input: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const endCell = () => {
    row.push(cell.trim());
    cell = "";
    closed = false;
  };
  const endRow = () => {
    endCell();
    if (row.some(Boolean)) rows.push(row);
    row = [];
  };
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
        closed = true;
      } else cell += ch;
    } else if (ch === ",") endCell();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      endRow();
    } else if (ch === '"' && !cell.trim() && !closed) {
      quoted = true;
      cell = "";
    } else if (ch === '"' || (closed && ch.trim()))
      throw new Error("Invalid CSV quoting.");
    else cell += ch;
  }
  if (quoted) throw new Error("A quoted CSV field was not closed.");
  if (cell || row.length || closed) endRow();
  return rows;
}

const url = z
  .string()
  .url()
  .max(2048)
  .refine((value) => /^https?:\/\//i.test(value), "Use an HTTP or HTTPS URL.");
const date = z
  .string()
  .refine(
    (value) =>
      /^(\d{4}-\d\d-\d\d|\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d))$/.test(
        value,
      ) && Number.isFinite(Date.parse(value)),
    "Use YYYY-MM-DD or an ISO timestamp with a timezone.",
  )
  .transform((value) => new Date(value).toISOString());
const optionalDate = z
  .union([z.literal("").transform(() => null), date])
  .optional();
const normalized = (value: unknown) =>
  typeof value === "string"
    ? value.toLowerCase().replace(/[-\s]+/g, "_")
    : value;
const rowSchema = z
  .object({
    direction: z.preprocess(normalized, z.enum(["sent", "received"])),
    placement: url,
    anchor: z.string().min(1).max(500),
    target: url,
    type: z.preprocess(
      normalized,
      z.enum(["link_insertion", "guest_post", "other"]),
    ),
    status: z.preprocess(
      normalized,
      z.enum([
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
        "cancelled",
        "overdue",
      ]),
    ),
    created: date,
    notes: z.string().max(5000).optional(),
    instructions: z.string().max(5000).optional(),
    reason: z.string().max(2000).optional(),
    updated: optionalDate,
    viewed: optionalDate,
    deadline: optionalDate,
    source_id: z.string().max(150).optional(),
  })
  .refine((row) => row.status !== "rejected" || !!row.reason, {
    path: ["reason"],
    message: "Rejected rows need their original rejection reason.",
  });

export function parseImport(csv: string) {
  const [headers, ...data] = csvRows(csv.replace(/^\uFEFF/, ""));
  const columns = headers?.map((value) => value.toLowerCase());
  if (
    !columns ||
    importColumns.slice(0, 7).some((column) => !columns.includes(column))
  )
    throw new Error(
      "Use the CSV template. Direction, placement, anchor, target, type, status and created are required.",
    );
  if (new Set(columns).size !== columns.length)
    throw new Error("Remove duplicate column headers.");
  if (!data.length || data.length > 1000)
    throw new Error("Include 1 to 1,000 rows per file.");
  const issues: { row: number; message: string }[] = [];
  const keys = new Set<string>();
  const rows = [];
  for (const [index, values] of data.entries()) {
    const line = index + 2;
    if (values.length !== columns.length) {
      issues.push({
        row: line,
        message: "The number of cells does not match the header.",
      });
      continue;
    }
    const parsed = rowSchema.safeParse(
      Object.fromEntries(columns.map((header, i) => [header, values[i]])),
    );
    if (!parsed.success) {
      issues.push({
        row: line,
        message: parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(" · "),
      });
      continue;
    }
    const row = parsed.data;
    const identity = row.source_id
      ? ["id", row.direction, row.source_id]
      : [
          "fields",
          row.direction,
          row.placement,
          row.target,
          row.anchor,
          row.created,
        ];
    const key = createHash("sha256")
      .update(JSON.stringify(identity))
      .digest("hex");
    if (keys.has(key)) {
      issues.push({
        row: line,
        message:
          "Duplicate source row. Check whether it is a separate request.",
      });
      continue;
    }
    keys.add(key);
    rows.push({ ...row, line, key });
  }
  return { rows, issues };
}
