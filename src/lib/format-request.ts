const fieldLabels = {
  page: "Page",
  anchor: "Anchor",
  target: "Target Link",
  after: "After this line",
  add: "Add this line",
  original: "Original Content",
  edited: "Edited Content",
  instructions: "Instructions",
  notes: "Notes",
} as const;

type Field = keyof typeof fieldLabels;

const aliases: Record<Field, string[]> = {
  page: [
    "page url",
    "placement",
    "placement page",
    "placement url",
    "placement page url",
    "source url",
    "article url",
    "url",
    "website",
    "site",
  ],
  anchor: ["anchor text", "link text", "keyword"],
  target: ["target", "target url", "destination", "destination url", "link"],
  after: [
    "after this",
    "insert after",
    "insert after this line",
    "after this sentence",
    "add after",
  ],
  add: [
    "add this",
    "add this sentence",
    "add line",
    "text to be inserted",
    "insert this",
    "text to add",
    "addition",
  ],
  original: [
    "original",
    "original text",
    "existing content",
    "existing sentence",
    "existing text",
    "before",
    "before text",
  ],
  edited: [
    "edited",
    "edited text",
    "new sentence",
    "new sentence / addition",
    "new text",
    "updated content",
    "replacement text",
    "after",
    "after text",
    "replace with",
  ],
  instructions: [
    "instruction",
    "edit",
    "edit instructions",
    "edit / guest post",
    "modification",
    "request instructions",
  ],
  notes: ["note", "notes / reason", "comments", "context"],
};

const fields = Object.keys(fieldLabels) as Field[];
const knownLabels = new Map(
  fields.flatMap((field) =>
    [fieldLabels[field], ...aliases[field]].map(
      (label) => [label.toLowerCase(), field] as const,
    ),
  ),
);
const metadata: Field[] = ["page", "anchor", "target"];
const content: Field[] = ["after", "add", "original", "edited"];

export type FormattedRequest = {
  text: string;
  issues: string[];
};

function fieldFor(label: string) {
  return knownLabels.get(
    label
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/\s*\/\s*/g, " / "),
  );
}

function readLabel(line: string) {
  const match = line.match(
    /^\s*(?:[-*•]\s+)?(\*\*|__)?([a-z][a-z /_-]{0,39}?)(\*\*|__)?\s*:[ \t]*(.*)$/i,
  );
  const field = match && fieldFor(match[2]);
  if (!field) return null;
  const [, open, , close, text] = match;
  const value =
    open && !close && text.startsWith(open)
      ? text.slice(open.length).trimStart()
      : text;
  return { field, value };
}

export function requestWebUrl(value: string) {
  const url = value.replace(/^(https?)\\:/i, "$1:");
  if (!/^https?:\/\/[^\s]/i.test(url) || /\s|[<>]/.test(url)) return "";
  try {
    return new URL(url).hostname ? url : "";
  } catch {
    return "";
  }
}

function cleanMetadata(field: Field, value: string) {
  const trimmed = value.trim().replace(/\\$/, "");
  if (field === "anchor") return trimmed;
  const markdown = trimmed.match(/^\[[^\]]*\]\\?\((.*?)\\?\)$/);
  const candidate = (markdown?.[1] ?? trimmed).replace(/^<(.*)>$/, "$1");
  return requestWebUrl(candidate) || trimmed;
}

function pastedRows(input: string) {
  const rows: { raw: string; cells: string[]; unclosed: boolean }[] = [];
  let start = 0;
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index <= input.length; index++) {
    const char = input[index];
    if (quoted && char === '"') {
      if (input[index + 1] === '"') {
        cell += char;
        index++;
      } else {
        quoted = false;
      }
    } else if (char === undefined || (!quoted && char === "\n")) {
      rows.push({
        raw: input.slice(start, index),
        cells: [...cells, cell],
        unclosed: quoted,
      });
      start = index + 1;
      cells = [];
      cell = "";
    } else if (quoted) {
      cell += char;
    } else if (char === "\t") {
      cells.push(cell);
      cell = "";
    } else if (
      char === '"' &&
      !cell.trim() &&
      (cells.length > 0 || /^"[^"\n]*"\t/.test(input.slice(index)))
    ) {
      quoted = true;
    } else {
      cell += char;
    }
  }
  return rows;
}

function groupRequests(input: string) {
  const groups: { lines: string[]; issues: string[] }[] = [];
  let lines: string[] = [];
  let issues: string[] = [];
  let hasPage = false;
  let tabbed = false;
  let columns: string[] | undefined;
  const rows = pastedRows(input);
  function finish() {
    if (lines.some((line) => line.trim())) groups.push({ lines, issues });
    lines = [];
    issues = [];
    hasPage = false;
    tabbed = false;
  }

  for (const [index, row] of rows.entries()) {
    const { cells, raw, unclosed } = row;
    const header = cells.map((value) => fieldFor(value));
    if (
      header.includes("page") &&
      (header.includes("anchor") || header.includes("target"))
    ) {
      finish();
      columns = cells;
      continue;
    }
    // A tabbed request uses the selected sheet headers or the 3 leading fields.
    const tabbedRequest =
      cells.length > 1 &&
      !readLabel(cells[0]) &&
      (!!columns ||
        !!requestWebUrl(cleanMetadata("page", cells[0])) ||
        (cells.length >= 3 &&
          (tabbed || !!requestWebUrl(cleanMetadata("target", cells[2])))));
    if (tabbedRequest) {
      finish();
      hasPage = true;
      tabbed = true;
      const labels = columns ?? [
        "Page",
        "Anchor",
        "Target Link",
        "Instructions",
      ];
      for (const [column, value] of cells.entries()) {
        const label = labels[column]?.trim();
        const field = label && fieldFor(label);
        if (!value.trim()) {
          if (field && metadata.includes(field))
            lines.push(`${fieldLabels[field]}:`);
          continue;
        }
        if (field === "instructions") {
          const [first, ...rest] = value.trim().split("\n");
          if (!readLabel(first)) lines.push("Instructions:");
          lines.push(first, ...rest);
        } else if (field) {
          lines.push(`${fieldLabels[field]}: ${value}`);
        } else {
          lines.push(`Notes: ${label ? `${label}: ` : ""}${value}`);
        }
      }
      if (unclosed)
        issues.push(
          "A spreadsheet cell has an unclosed quote. Check the pasted rows.",
        );
      continue;
    }

    const line =
      cells.length > 1 && cells.every((cell) => !cell.trim() || readLabel(cell))
        ? cells.join("\n")
        : raw;
    const label = readLabel(line.split("\n", 1)[0]);
    const heading =
      /^\s*(?:#{1,6}\s+)?(?:\*\*)?request\s+#?\d+(?:\*\*)?\s*:?\s*$/i.test(raw);
    if (heading) {
      finish();
      continue;
    }
    const startsLooseRequest =
      !lines.at(-1)?.trim() &&
      !!requestWebUrl(cleanMetadata("page", raw)) &&
      !!rows[index + 1]?.raw.trim() &&
      !!requestWebUrl(cleanMetadata("target", rows[index + 2]?.raw ?? ""));
    if ((label?.field === "page" || startsLooseRequest) && hasPage) finish();
    if (label?.field === "page" || startsLooseRequest) hasPage = true;
    lines.push(...line.split("\n"));
  }
  finish();
  return groups;
}

function formatGroup(
  lines: string[],
  initialIssues: string[],
): FormattedRequest {
  const values = new Map<Field, string>();
  const loose: string[] = [];
  const issues = new Set(initialIssues);
  let active: { field: Field; lines: string[] } | undefined;

  function finishField() {
    if (!active) return;
    const { field } = active;
    const raw = active.lines.join("\n").trim();
    active = undefined;
    if (!raw) return;
    const value = metadata.includes(field) ? cleanMetadata(field, raw) : raw;
    const previous = values.get(field);
    if (!previous) {
      values.set(field, value);
    } else if (previous !== value) {
      if (metadata.includes(field)) {
        loose.push(`${fieldLabels[field]}: ${value}`);
        issues.add(`Multiple ${fieldLabels[field]} values found. Check Notes.`);
      } else {
        values.set(field, `${previous}\n\n${value}`);
        if (content.includes(field)) {
          issues.add(
            `Multiple ${fieldLabels[field]} sections found. Check their order.`,
          );
        }
      }
    }
  }

  // A plain URL, anchor, and target on three lines can be read without labels.
  const nonempty = lines.map((line) => line.trim()).filter(Boolean);
  const [page, anchor, target] = nonempty;
  if (
    page &&
    anchor &&
    target &&
    !readLabel(anchor) &&
    !requestWebUrl(cleanMetadata("anchor", anchor)) &&
    requestWebUrl(cleanMetadata("page", page)) &&
    requestWebUrl(cleanMetadata("target", target))
  ) {
    lines = [
      `Page: ${page}`,
      `Anchor: ${anchor}`,
      `Target Link: ${target}`,
      ...lines.slice(lines.findIndex((line) => line.trim() === target) + 1),
    ];
  }

  for (const line of lines.flatMap((line) => line.split("\n"))) {
    const label = readLabel(line);
    if (label) {
      finishField();
      active = { field: label.field, lines: [label.value] };
    } else if (
      active &&
      (!metadata.includes(active.field) ||
        !active.lines.some((part) => part.trim()))
    ) {
      active.lines.push(line);
    } else {
      finishField();
      loose.push(line);
    }
  }
  finishField();

  for (const field of metadata) {
    const value = values.get(field);
    if (!value) issues.add(`Add ${fieldLabels[field]}.`);
    else if (field !== "anchor" && !requestWebUrl(value)) {
      issues.add(`Check the ${fieldLabels[field]} URL.`);
    } else if (
      field === "anchor" &&
      (value.includes("\n") || requestWebUrl(value))
    ) {
      issues.add("Check the anchor text.");
    }
  }

  const hasAddition = values.has("after") || values.has("add");
  const hasReplacement = values.has("original") || values.has("edited");
  if (hasAddition && (!values.has("after") || !values.has("add"))) {
    issues.add("Check the placement line and the line to add.");
  }
  if (hasReplacement && (!values.has("original") || !values.has("edited"))) {
    issues.add("Check the original and edited content.");
  }
  if (hasAddition && hasReplacement)
    issues.add("Confirm whether this is an addition, a replacement, or both.");
  if (!hasAddition && !hasReplacement) {
    issues.add(
      values.has("instructions")
        ? "Check the instructions before sharing."
        : "Add or confirm the edit instructions.",
    );
  }

  const unassigned = loose.join("\n").trim();
  if (unassigned) {
    issues.add("Review the pasted text kept in Notes.");
    values.set(
      "notes",
      [values.get("notes"), unassigned].filter(Boolean).join("\n\n"),
    );
  }

  const details = metadata.map((field) =>
    `${fieldLabels[field]}: ${values.get(field) ?? ""}`.trimEnd(),
  );
  const edits = fields.slice(metadata.length).flatMap((field) => {
    const value = values.get(field);
    if (!value) return [];
    const separator = field === "after" || field === "add" ? " " : "\n";
    return [`${fieldLabels[field]}:${separator}${value}`];
  });
  return {
    text: [details.join("\n"), ...edits].join("\n\n"),
    issues: [...issues],
  };
}

export function formatRequests(input: string) {
  const normalized = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  return groupRequests(normalized).map(({ lines, issues }) =>
    formatGroup(lines, issues),
  );
}

export function formattedLine(line: string) {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const label = line.slice(0, colon);
  const field = fieldFor(label);
  return field && fieldLabels[field] === label
    ? { field, label: line.slice(0, colon + 1), value: line.slice(colon + 1) }
    : null;
}
