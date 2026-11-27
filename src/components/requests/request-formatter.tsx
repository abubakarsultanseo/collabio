"use client";

import { Copy, FileText, Pencil, WandSparkles } from "lucide-react";
import { Fragment, useRef, useState } from "react";
import { useToast } from "@/components/app/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  formatRequests,
  formattedLine,
  requestWebUrl,
  type FormattedRequest,
} from "@/lib/format-request";

const example = [
  "https://publisher.example/article",
  "example anchor",
  "https://destination.example/page",
  '"After this line: The sentence already on the page.\nAdd this line: The new sentence with an [example anchor](https://destination.example/page)."',
].join("\t");

function PreviewLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--brand-dark)] underline decoration-1 underline-offset-2"
    >
      {label}
    </a>
  );
}

function linkedText(text: string) {
  const matches = text.matchAll(
    /\[([^\]\n]+)\]\\?\((https?\\?:\/\/(?:[^()\s<>\\]+|\([^()\s<>]*\))+)\\?\)|(https?\\?:\/\/[^\s<>"`]+)/gi,
  );
  const parts: React.ReactNode[] = [];
  let end = 0;
  for (const match of matches) {
    const [full, label, markdownUrl, rawUrl] = match;
    const index = match.index;
    let url = markdownUrl ?? rawUrl.replace(/[.,;:!?]+$/, "");
    if (!markdownUrl) {
      // Keep balanced parentheses in URLs and leave surrounding punctuation as text.
      const opens = url.split("(").length;
      const closes = url.split(")").length;
      for (
        let extra = closes - opens;
        extra > 0 && url.endsWith(")");
        extra--
      ) {
        url = url.slice(0, -1);
      }
    }
    const href = requestWebUrl(url);
    if (!href) continue;
    parts.push(text.slice(end, index));
    parts.push(<PreviewLink key={index} href={href} label={label ?? url} />);
    end = index + (markdownUrl ? full.length : url.length);
  }
  parts.push(text.slice(end));
  return parts;
}

function RequestPreview({ text }: { text: string }) {
  return (
    <p className="text-sm leading-6 [overflow-wrap:anywhere]">
      {text.split("\n").map((line, index) => {
        const field = formattedLine(line);
        const url =
          field?.field === "page" || field?.field === "target"
            ? requestWebUrl(field.value.trim())
            : "";
        return (
          <Fragment key={index}>
            {index > 0 && <br />}
            {field ? (
              <>
                <strong>{field.label}</strong>
                {url ? (
                  <>
                    {" "}
                    <PreviewLink href={url} label={url} />
                  </>
                ) : (
                  linkedText(field.value)
                )}
              </>
            ) : (
              linkedText(line)
            )}
          </Fragment>
        );
      })}
    </p>
  );
}

function RequestResult({
  request,
  number,
  onEdit,
  onCopy,
}: {
  request: FormattedRequest;
  number: number;
  onEdit: (value: string) => void;
  onCopy: (text: string, html: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  return (
    <article className="space-y-3 rounded-xl border border-[var(--border)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Request {number}</h3>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={editing}
            onClick={() => setEditing(!editing)}
          >
            <Pencil size={14} aria-hidden />
            {editing ? "Done editing" : "Edit"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!request.text.trim()}
            onClick={() =>
              onCopy(request.text, preview.current?.innerHTML ?? "")
            }
          >
            <Copy size={14} aria-hidden />
            Copy request
          </Button>
        </div>
      </div>
      {request.issues.length > 0 && (
        <div className="rounded-lg bg-[var(--warning-bg)] px-3 py-2 text-xs text-[var(--text)]">
          <p className="font-semibold">Review the pasted request</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {request.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      {editing && (
        <Textarea
          aria-label={`Edit formatted request ${number}`}
          rows={12}
          value={request.text}
          onChange={(event) => onEdit(event.target.value)}
          className="font-mono text-xs"
        />
      )}
      <div ref={preview} hidden={editing} data-request-preview={number}>
        <RequestPreview text={request.text} />
      </div>
    </article>
  );
}

export function RequestFormatter() {
  const notify = useToast();
  const [input, setInput] = useState("");
  const [formattedInput, setFormattedInput] = useState("");
  const [requests, setRequests] = useState<FormattedRequest[]>([]);
  const [generation, setGeneration] = useState(0);
  const source = useRef<HTMLTextAreaElement>(null);
  const results = useRef<HTMLHeadingElement>(null);
  const output = useRef<HTMLDivElement>(null);
  const hasEdits = input !== formattedInput;

  function format() {
    setRequests(formatRequests(input));
    setFormattedInput(input);
    setGeneration((previous) => previous + 1);
    results.current?.focus();
  }

  async function copy(text: string, html: string) {
    try {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([text], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          }),
        ]);
      } catch {
        await navigator.clipboard.writeText(text);
      }
      notify("Formatted request copied.");
    } catch {
      notify(
        "Could not copy to the clipboard. You can select the text and copy it manually.",
        "error",
      );
    }
  }

  function copyAll() {
    const previews = output.current?.querySelectorAll("[data-request-preview]");
    const included = requests.flatMap((request, index) =>
      request.text.trim()
        ? [
            {
              number: index + 1,
              text: request.text,
              html: previews?.[index]?.innerHTML ?? "",
            },
          ]
        : [],
    );
    void copy(
      included
        .map(({ number, text }) => `Request ${number}\n${text}`)
        .join("\n\n"),
      included
        .map(
          ({ number, html }) =>
            `<p><strong>Request ${number}</strong></p>${html}`,
        )
        .join(""),
    );
  }

  return (
    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <form
        className="os-card min-w-0 space-y-3 p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (input.trim()) format();
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="request-source" className="font-semibold">
            Paste requests
          </label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={Boolean(input.trim())}
            onClick={() => {
              setInput(example);
              source.current?.focus();
            }}
          >
            Try an example
          </Button>
        </div>
        <p id="request-source-help" className="text-sm text-[var(--muted)]">
          Paste rows with or without column headers, or paste a request from a
          message. Include the full target URL if the pasted text only shows the
          anchor.
        </p>
        <Textarea
          ref={source}
          id="request-source"
          aria-describedby="request-source-help"
          rows={14}
          className="font-mono text-xs"
          placeholder={
            "Page: https://publisher.example/article\nAnchor: example anchor\nTarget Link: https://destination.example/page"
          }
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={!input.trim()}>
            <WandSparkles size={16} aria-hidden />
            Format Request
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={!input && !requests.length}
            onClick={() => {
              setInput("");
              setFormattedInput("");
              setRequests([]);
              source.current?.focus();
            }}
          >
            Clear
          </Button>
        </div>
        {requests.length > 0 && hasEdits && (
          <p role="status" className="text-xs text-[var(--muted)]">
            Format again to update the preview with your new input.
          </p>
        )}
      </form>

      <section className="os-card min-w-0 space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 ref={results} tabIndex={-1} className="font-semibold">
            Formatted requests
          </h2>
          {requests.length > 1 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={requests.every((request) => !request.text.trim())}
              onClick={copyAll}
            >
              <Copy size={14} aria-hidden />
              Copy all
            </Button>
          )}
        </div>
        <p role="status" className="sr-only">
          {requests.length ? `${requests.length} requests formatted.` : ""}
        </p>
        {requests.length === 0 ? (
          <div className="grid min-h-52 justify-items-center content-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
            <FileText size={24} aria-hidden className="text-[var(--muted)]" />
            <p className="text-sm text-[var(--muted)]">
              Formatted requests will appear here.
            </p>
          </div>
        ) : (
          <div ref={output} className="space-y-3">
            {requests.map((request, index) => (
              <RequestResult
                key={`${generation}-${index}`}
                request={request}
                number={index + 1}
                onCopy={(text, html) => void copy(text, html)}
                onEdit={(value) =>
                  setRequests((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, text: value } : item,
                    ),
                  )
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
