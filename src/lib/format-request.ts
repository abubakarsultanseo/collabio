const fieldLabels = {
  page: "Page",
  anchor: "Anchor",
  target: "Target Link",
  section: "Section",
  after: "After this line",
  original: "Original Content",
  add: "Add this line",
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
    "link from",
    "url",
    "website",
    "site",
  ],
  anchor: ["anchor text", "link text", "keyword"],
  target: [
    "target",
    "target url",
    "link to",
    "destination",
    "destination url",
    "link",
  ],
  section: ["article section", "placement section"],
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
    "text to be added",
    "insert this",
    "text to add",
    "what to add",
    "addition",
  ],
  original: [
    "original",
    "original text",
    "existing",
    "existing content",
    "existing sentence",
    "existing text",
    "before",
    "before text",
    "text before",
  ],
  edited: [
    "edited",
    "edited text",
    "revised",
    "revised text",
    "revised content",
    "new sentence",
    "new sentence / addition",
    "new text",
    "updated content",
    "replacement text",
    "after",
    "after text",
    "text after",
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

type FieldValue = { field: Field; value: string };

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
    /^\s*(?:>\s*)*(?:[-*•]\s+)?(\*\*|__)?([a-z][a-z /_-]{0,39}?)(\*\*|__)?\s*:[ \t]*(.*)$/i,
  );
  const field = match && fieldFor(match[2]);
  if (!field) return null;
  const [, open, label, close, text] = match;
  const value =
    open && !close && text.startsWith(open)
      ? text.slice(open.length).trimStart()
      : text;
  return { field, value, label: label.trim().toLowerCase() };
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

function pastedUrl(value: string) {
  const trimmed = value
    .trim()
    .replace(/^🔗\uFE0F?\s*/, "")
    .replace(/\\$/, "");
  const markdown = trimmed.match(/^\[[^\]]*\]\\?\((.*?)\\?\)$/);
  const candidate = (markdown?.[1] ?? trimmed).replace(
    /^<([^|>]+)(?:\|[^>]+)?>$/,
    "$1",
  );
  const bareDomain =
    /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d+)?(?:[/?#][^\s<>]*)?$/i;
  return requestWebUrl(
    bareDomain.test(candidate) ? `https://${candidate}` : candidate,
  );
}

function cleanMetadata(field: Field, value: string) {
  const trimmed = value.trim().replace(/\\$/, "");
  return field === "anchor" ? trimmed : pastedUrl(trimmed) || trimmed;
}

function markdownRequestLinks(text: string) {
  return text.matchAll(
    /\[([^\]\n]+)\]\\?\((https?\\?:\/\/(?:[^()\s<>\\]+|\([^()\s<>]*\))+)\\?\)/gi,
  );
}

function fillLinkDetails(values: Map<Field, string>) {
  const anchor = values.get("anchor");
  const target = values.get("target");
  if (anchor && target) return;

  const links = new Map<string, { label: string; href: string }>();
  const destination = target && requestWebUrl(target);
  for (const field of ["add", "edited"] as const) {
    for (const [, label, url] of markdownRequestLinks(
      values.get(field) ?? "",
    )) {
      const href = requestWebUrl(url);
      if (!href || (anchor && anchor !== label)) continue;
      const canonical = new URL(href).href;
      if (target && (!destination || new URL(destination).href !== canonical))
        continue;
      links.set(JSON.stringify([label, canonical]), { label, href });
    }
  }

  if (links.size !== 1) return;
  const [link] = links.values();
  if (!anchor) values.set("anchor", link.label);
  if (!target) values.set("target", link.href);
}

function inlineInsertion(value: string) {
  const match = value.match(
    /^(?:"([^"]+)"|“([^”]+)”|'([^']+)'|‘([^’]+)’)\s*[,;]?\s+(?:then\s+)?(?:add|insert|append)\b\s*:?\s*(\S.*)$/i,
  );
  if (!match) return null;
  const [, straight, curly, single, singleCurly, text] = match;
  const addition = text
    .replace(/^"([^"]*)"$/, "$1")
    .replace(/^“([^”]*)”$/, "$1")
    .replace(/^'([^']*)'$/, "$1")
    .replace(/^‘([^’]*)’$/, "$1");
  return { after: straight ?? curly ?? single ?? singleCurly, addition };
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

type RequestGroup = {
  lines: string[];
  sheetValues: FieldValue[];
  issues: string[];
};

function sheetFields(cells: string[]): Field[] {
  const [firstEdit, secondEdit, thirdEdit] = cells.slice(3);
  const plainContent = (value?: string) =>
    value !== undefined && !readLabel(value.trim().split("\n", 1)[0]);

  if (
    !firstEdit?.trim() &&
    secondEdit?.trim() &&
    thirdEdit?.trim() &&
    plainContent(secondEdit) &&
    plainContent(thirdEdit)
  ) {
    return [...metadata, "notes", "original", "edited"];
  }
  if (
    plainContent(firstEdit) &&
    plainContent(secondEdit) &&
    (firstEdit.trim() || secondEdit.trim())
  ) {
    return [...metadata, "original", "edited"];
  }
  return [...metadata, "instructions"];
}

function groupRequests(input: string) {
  const groups: RequestGroup[] = [];
  let lines: string[] = [];
  let sheetValues: FieldValue[] = [];
  let issues: string[] = [];
  let hasPage = false;
  let tabbed = false;
  let columns: string[] | undefined;
  const rows = pastedRows(input);
  function finish() {
    if (sheetValues.length || lines.some((line) => line.trim())) {
      groups.push({ lines, sheetValues, issues });
    }
    lines = [];
    sheetValues = [];
    issues = [];
    hasPage = false;
    tabbed = false;
  }

  for (const [index, row] of rows.entries()) {
    const { cells, raw, unclosed } = row;
    if (cells.length > 1 && cells.every((cell) => !cell.trim())) {
      finish();
      continue;
    }
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
        !!pastedUrl(cells[0]) ||
        (cells.length >= 3 && (tabbed || !!pastedUrl(cells[2]))));
    if (tabbedRequest) {
      finish();
      hasPage = true;
      tabbed = true;
      const positions = columns ? columns.map(fieldFor) : sheetFields(cells);
      for (const [column, rawValue] of cells.entries()) {
        const value = rawValue.trim();
        if (!value) continue;
        const field = positions[column];
        const firstLineLabel = readLabel(value.split("\n", 1)[0]);
        if (
          field === "instructions" ||
          (!field && !columns && firstLineLabel)
        ) {
          if (firstLineLabel) lines.push(...value.split("\n"));
          else sheetValues.push({ field: "instructions", value });
        } else if (field) {
          sheetValues.push({ field, value });
        } else {
          const label = columns?.[column]?.trim();
          sheetValues.push({
            field: "notes",
            value: label ? `${label}: ${value}` : value,
          });
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
      columns = undefined;
      continue;
    }
    const url = pastedUrl(raw);
    const next = rows[index + 1]?.raw.trim() ?? "";
    const nextLabel = readLabel(next || rows[index + 2]?.raw || "");
    const looseMetadata =
      next &&
      !readLabel(next) &&
      !pastedUrl(next) &&
      pastedUrl(rows[index + 2]?.raw ?? "");
    const barePage =
      url &&
      (!hasPage || !lines.at(-1)?.trim()) &&
      (looseMetadata || (nextLabel && nextLabel.field !== "page"));
    if ((label?.field === "page" || barePage) && hasPage) finish();
    if (label?.field === "page" || barePage) {
      hasPage = true;
      columns = undefined;
    }
    if (barePage && !looseMetadata) {
      lines.push(`Page: ${url}`);
      continue;
    }
    lines.push(...line.split("\n"));
  }
  finish();
  return groups;
}

function formatGroup({
  lines,
  sheetValues,
  issues: initialIssues,
}: RequestGroup): FormattedRequest {
  const values = new Map<Field, string>();
  const loose: string[] = [];
  const issues = new Set(initialIssues);
  let active: { field: Field; lines: string[] } | undefined;

  function saveField({ field, value: raw }: FieldValue) {
    raw = raw.trim();
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

  function finishField() {
    if (!active) return;
    saveField({ field: active.field, value: active.lines.join("\n") });
    active = undefined;
  }

  sheetValues.forEach(saveField);

  // A plain URL, anchor, and target on three lines can be read without labels.
  const nonempty = lines.flatMap((line, index) =>
    line.trim() ? [{ value: line.trim(), index }] : [],
  );
  const [page, anchor, target] = nonempty;
  if (
    page &&
    anchor &&
    target &&
    !readLabel(anchor.value) &&
    !pastedUrl(anchor.value) &&
    pastedUrl(page.value) &&
    pastedUrl(target.value)
  ) {
    lines = [
      `Page: ${page.value}`,
      `Anchor: ${anchor.value}`,
      `Target Link: ${target.value}`,
      ...lines.slice(target.index + 1),
    ];
  }

  for (const line of lines.flatMap((line) => line.split("\n"))) {
    const label = readLabel(line);
    if (label) {
      finishField();
      const insertion = label.label === "after" && inlineInsertion(label.value);
      if (insertion) {
        saveField({ field: "after", value: insertion.after });
        active = { field: "add", lines: [insertion.addition] };
      } else {
        active = { field: label.field, lines: [label.value] };
      }
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

  let unassigned = loose.join("\n").trim();
  if (
    !content.some((field) => values.has(field)) &&
    !values.has("instructions") &&
    metadata.every((field) => values.has(field))
  ) {
    const paragraphs = unassigned
      .split(/\n(?:[^\S\n]*\n)+/)
      .map((part) => part.trim());
    const parts = paragraphs.length === 1 ? unassigned.split("\n") : paragraphs;
    if (parts.length === 2 && parts.every((part) => part.trim())) {
      saveField({ field: "original", value: parts[0] });
      saveField({ field: "edited", value: parts[1] });
      unassigned = "";
    }
  }

  if (
    values.has("original") &&
    values.has("add") &&
    !values.has("after") &&
    !values.has("edited")
  ) {
    values.set("after", values.get("original")!);
    values.delete("original");
  }
  fillLinkDetails(values);

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

  const hasAfter = values.has("after");
  const hasAdd = values.has("add");
  const hasAddition = hasAfter || hasAdd;
  const hasReplacement = values.has("original") || values.has("edited");
  if (
    (hasAfter && !hasAdd) ||
    (hasAdd && !hasAfter && !values.has("original"))
  ) {
    issues.add("Check the placement line and the line to add.");
  }
  if (
    hasReplacement &&
    (!values.has("edited") ||
      (!values.has("original") && !(hasAfter && hasAdd)))
  ) {
    issues.add("Check the original and edited content.");
  }
  if (
    hasAfter &&
    values.has("original") &&
    values.get("after") !== values.get("original")
  )
    issues.add("Confirm whether this is an addition, a replacement, or both.");
  if (!hasAddition && !hasReplacement) {
    issues.add(
      values.has("instructions")
        ? "Check the instructions before sharing."
        : "Add or confirm the edit instructions.",
    );
  }

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
    const separator =
      field === "section" || field === "after" || field === "add" ? " " : "\n";
    return [`${fieldLabels[field]}:${separator}${value}`];
  });
  return {
    text: [details.join("\n"), ...edits].join("\n\n"),
    issues: [...issues],
  };
}

export function formatRequests(input: string) {
  const normalized = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  return groupRequests(normalized).map(formatGroup);
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
