"use client";

import { Fragment, ReactNode, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A tiny, dependency-free markdown renderer.
 * Supports: headings, bold/italic, inline code, fenced code blocks,
 * bullet/numbered lists, and links. Regex-based — intentionally minimal.
 */

type Block =
  | { type: "code"; lang?: string; content: string }
  | { type: "heading"; level: number; content: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "p"; content: string };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^```(.*)$/);
    if (fence) {
      const lang = fence[1].trim() || undefined;
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: "code", lang, content: body.join("\n") });
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Heading
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        content: heading[2],
      });
      i++;
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // Paragraph — accumulate until blank line / block boundary
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", content: para.join("\n") });
  }

  return blocks;
}

/** Render inline markup: bold, italic, inline code, links. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // Token regex: code | bold | italic | link
  const pattern =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)|(\[[^\]]+\]\([^)]+\))/g;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) {
      out.push(
        <Fragment key={`${keyPrefix}-t${n++}`}>
          {text.slice(last, m.index)}
        </Fragment>,
      );
    }
    const tok = m[0];
    const k = `${keyPrefix}-m${n++}`;
    if (tok.startsWith("`")) {
      out.push(
        <code
          key={k}
          className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em]"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("**") || tok.startsWith("__")) {
      out.push(
        <strong key={k} className="font-semibold">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (tok.startsWith("[")) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (lm) {
        out.push(
          <a
            key={k}
            href={lm[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 hover:opacity-80"
          >
            {lm[1]}
          </a>,
        );
      } else {
        out.push(<Fragment key={k}>{tok}</Fragment>);
      }
    } else {
      // single * or _ => italic
      out.push(
        <em key={k} className="italic">
          {tok.slice(1, -1)}
        </em>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) {
    out.push(
      <Fragment key={`${keyPrefix}-t${n++}`}>{text.slice(last)}</Fragment>,
    );
  }
  return out;
}

function CodeBlock({ content, lang }: { content: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative my-2">
      <button
        onClick={() => {
          navigator.clipboard?.writeText(content).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-muted opacity-0 transition hover:text-foreground group-hover:opacity-100"
        aria-label="Copy code"
      >
        {copied ? (
          <>
            <Check className="h-3 w-3" /> Copied
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" /> Copy
          </>
        )}
      </button>
      {lang && (
        <span className="absolute left-3 top-2 text-[10px] uppercase tracking-wide text-muted">
          {lang}
        </span>
      )}
      <pre
        className={cn(
          "overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-[0.8rem] leading-relaxed",
          lang && "pt-7",
        )}
      >
        <code>{content}</code>
      </pre>
    </div>
  );
}

export function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const blocks = parseBlocks(content);
  return (
    <div className={cn("space-y-2 text-sm leading-relaxed", className)}>
      {blocks.map((b, idx) => {
        const key = `b${idx}`;
        switch (b.type) {
          case "code":
            return <CodeBlock key={key} content={b.content} lang={b.lang} />;
          case "heading": {
            const sizes: Record<number, string> = {
              1: "text-lg font-semibold",
              2: "text-base font-semibold",
              3: "text-sm font-semibold",
              4: "text-sm font-semibold",
              5: "text-sm font-medium",
              6: "text-sm font-medium",
            };
            return (
              <p key={key} className={cn("mt-1", sizes[b.level] ?? sizes[3])}>
                {renderInline(b.content, key)}
              </p>
            );
          }
          case "ul":
            return (
              <ul key={key} className="ml-5 list-disc space-y-1">
                {b.items.map((it, j) => (
                  <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className="ml-5 list-decimal space-y-1">
                {b.items.map((it, j) => (
                  <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</li>
                ))}
              </ol>
            );
          default:
            return (
              <p key={key} className="whitespace-pre-wrap">
                {renderInline(b.content, key)}
              </p>
            );
        }
      })}
    </div>
  );
}
