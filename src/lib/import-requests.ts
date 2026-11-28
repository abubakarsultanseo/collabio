import { createHash } from "node:crypto";
import { z } from "zod";
import { requestStatuses } from "@/lib/request-statuses";
import {
  isDocumentRequest,
  originalAndEdited,
  requestTypes,
} from "@/lib/request-content";
import type { ImportFormat } from "@/lib/request-import-templates";

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
    rows.push(row);
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
    anchor: z
      .string()
      .max(500)
      .optional()
      .transform((value) => value || null),
    target: z
      .union([url, z.literal("")])
      .optional()
      .transform((value) => value || null),
    type: z.preprocess(normalized, z.enum(requestTypes)),
    status: z.preprocess(normalized, z.enum(requestStatuses)),
    created: optionalDate.transform((value) => value ?? null),
    original_content: z
      .string()
      .max(5000)
      .optional()
      .transform((value) => value || null),
    edited_content: z
      .string()
      .max(5000)
      .optional()
      .transform((value) => value || null),
    document_url: z
      .union([url, z.literal("")])
      .optional()
      .transform((value) => value || null),
    position: z
      .string()
      .max(120)
      .optional()
      .transform((value) => value || null),
    notes: z.string().max(5000).optional(),
    instructions: z.string().max(5000).optional(),
    reason: z.string().max(2000).optional(),
    updated: optionalDate,
    viewed: optionalDate,
    deadline: optionalDate,
    source_id: z.string().max(150).optional(),
  })
  .superRefine((row, context) => {
    const issues: Array<[string, string]> = [];
    if (row.status === "rejected" && !row.reason)
      issues.push([
        "reason",
        "Rejected rows need their original rejection reason.",
      ]);
    if (isDocumentRequest(row.type)) {
      if (!row.document_url)
        issues.push([
          "document_url",
          "Paste the actual document URL. A document chip may export as its title only.",
        ]);
      if (row.type === "listicle" && !row.position)
        issues.push(["position", "Enter the listicle position."]);
    } else if (!row.anchor || !row.target) {
      issues.push([
        "anchor",
        "Link insertions need an anchor and target URL. For a guest post, specify Guest post and its document link.",
      ]);
    }
    for (const [field, message] of issues)
      context.addIssue({ code: "custom", path: [field], message });
  });

type ImportOptions = {
  format?: ImportFormat;
  direction?: "sent" | "received";
  blockName?: string;
};
type RawRow = { line: number; data: Record<string, string> };
const simple = (value: string) =>
  value.toLowerCase().trim().replace(/\s+/g, " ");

const sheetStatuses: Record<string, { value: string; note?: true }> = {
  "new req": { value: "new_request" },
  requested: { value: "new_request" },
  found: { value: "new_request", note: true },
  "in process": { value: "in_progress" },
  "not live": { value: "hold", note: true },
  "want to remove": { value: "hold", note: true },
  canceled: { value: "cancelled" },
  "on hold": { value: "hold" },
};
function structuredRows(lines: string[][]): RawRow[] {
  const columns = lines[0]?.map(simple);
  if (
    !columns ||
    importColumns.slice(0, 6).some((column) => !columns.includes(column))
  )
    throw new Error(
      "Use the Collabio standard CSV template or choose the matching sheet layout.",
    );
  if (new Set(columns).size !== columns.length)
    throw new Error("Remove duplicate column headers.");
  return lines.slice(1).flatMap((values, row) =>
    values.some(Boolean)
      ? [
          {
            line: row + 2,
            data:
              values.length === columns.length
                ? Object.fromEntries(
                    columns.map((column, index) => [column, values[index]]),
                  )
                : { malformed: "true" },
          },
        ]
      : [],
  );
}

function sheetRows(lines: string[][], options: ImportOptions): RawRow[] {
  const collab = options.format === "collab";
  const headerIndex = lines.findIndex((line) =>
    line.map(simple).includes(collab ? "placement page" : "page url"),
  );
  if (headerIndex < 0)
    throw new Error(
      "Could not find a placement URL header for this sheet layout.",
    );
  if (!options.direction)
    throw new Error("Choose the direction for this block or tab.");
  const header = lines[headerIndex].map(simple);
  const positions = header.flatMap((text, index) =>
    text === "placement page" ? [index] : [],
  );
  let start = 0;
  let end = header.length;
  if (collab) {
    const names = lines[headerIndex - 1] ?? [];
    const blocks = positions.map((position, index) => ({
      start: position,
      end:
        positions[index + 1] === undefined
          ? header.length
          : positions[index + 1] - 1,
      name:
        names
          .slice(
            position - 1,
            positions[index + 1] === undefined
              ? header.length
              : positions[index + 1] - 1,
          )
          .find(Boolean) || "",
    }));
    const matches = options.blockName?.trim()
      ? blocks.filter(
          (item) => simple(item.name) === simple(options.blockName!),
        )
      : blocks;
    const block = matches.length === 1 ? matches[0] : undefined;
    if (!block)
      throw new Error(
        `Enter the exact partner heading for this block. Found: ${blocks.map((item) => item.name || "(unnamed)").join(", ")}.`,
      );
    ({ start, end } = block);
  }

  const get = (line: string[], ...candidates: string[]) => {
    const index = header.findIndex(
      (value, index) =>
        index >= start &&
        index < end &&
        candidates.some(
          (candidate) =>
            value === candidate ||
            (candidate === "status" && value.startsWith("status (")),
        ),
    );
    return index < 0 ? "" : (line[index] ?? "");
  };
  return lines.slice(headerIndex + 1).flatMap((line, position) => {
    const status = get(line, "status");
    const placement = get(line, "placement page", "page url");
    const anchor = get(line, "anchor");
    const target = get(line, "target link", "target url");
    const instructions = get(
      line,
      "edit / guest post",
      "edit/guest post",
      "modification",
    );
    let notes = get(line, "notes / reason", "notes/reason", "comments");
    const type = get(line, "request type", "type");
    let document = get(
      line,
      "document url",
      "document link",
      "guest post document",
      "listicle document link",
    );
    if (
      ![
        status,
        placement,
        anchor,
        target,
        instructions,
        notes,
        type,
        document,
      ].some(Boolean)
    )
      return [];
    if (!document && !anchor && !target && url.safeParse(instructions).success)
      document = instructions;
    const rowType =
      type ||
      (document && !anchor && !target ? "guest_post" : "link_insertion");
    const mapping = sheetStatuses[simple(status)];
    const rejectionReason =
      (mapping?.value ?? normalized(status)) === "rejected" ? notes : "";
    if (mapping?.note)
      notes = [notes, `Sheet status: ${status}`].filter(Boolean).join("\n");
    const content = originalAndEdited(instructions);
    const original = get(line, "existing sentence", "original content");
    const edited = get(
      line,
      "new sentence",
      "new sentence / addition",
      "new sentence/addition",
      "edited content",
    );
    return [
      {
        line: headerIndex + position + 2,
        data: {
          direction: options.direction!,
          placement,
          anchor,
          target,
          type: rowType,
          status: mapping?.value ?? (status || "new_request"),
          created: get(line, "created", "created at"),
          notes,
          reason: rejectionReason,
          instructions,
          original_content:
            (simple(original) === "existing sentence" ? "" : original) ||
            content.original,
          edited_content:
            ([
              "new sentence",
              "new sentence / addition",
              "new sentence/addition",
            ].includes(simple(edited))
              ? ""
              : edited) || content.edited,
          document_url: document,
          position: get(line, "listicle position", "position"),
          source_id: get(line, "source id", "source_id"),
        },
      },
    ];
  });
}

export function parseImport(csv: string, options: ImportOptions = {}) {
  const lines = csvRows(csv.replace(/^\uFEFF/, ""));
  const source =
    !options.format || options.format === "standard"
      ? structuredRows(lines)
      : sheetRows(lines, options);
  if (!source.length || source.length > 1000)
    throw new Error("Include 1 to 1,000 rows per import.");
  const issues: { row: number; message: string }[] = [];
  const keys = new Set<string>();
  const rows = [];
  for (const { line, data } of source) {
    if (data.malformed) {
      issues.push({
        row: line,
        message: "The number of cells does not match the header.",
      });
      continue;
    }
    const parsed = rowSchema.safeParse(data);
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
    if (isDocumentRequest(row.type)) {
      row.anchor = null;
      row.target = null;
    }
    const linkIdentity = [
      "fields",
      row.direction,
      row.placement,
      row.target,
      row.anchor,
      row.created,
    ];
    const identity = row.source_id
      ? ["id", row.direction, row.source_id]
      : isDocumentRequest(row.type)
        ? [...linkIdentity, row.type, row.document_url, row.position]
        : linkIdentity;
    const key = createHash("sha256")
      .update(JSON.stringify(identity))
      .digest("hex");
    if (keys.has(key)) {
      issues.push({
        row: line,
        message:
          "Duplicate source row. Add different source IDs if these are separate requests.",
      });
      continue;
    }
    keys.add(key);
    rows.push({ ...row, line, key });
  }
  return { rows, issues };
}
