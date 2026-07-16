"use client";

import { ReactNode, useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   ASCII / terminal aesthetic primitives. Monospace, box-drawing, subtle. Reads
   as an instrument panel, not a gimmick.
--------------------------------------------------------------------------- */

/** A framed terminal window with a titlebar and monospace body. */
export function AsciiPanel({
  path = "~/hermes",
  children,
  className,
  glow,
}: {
  path?: string;
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-[#0c0c0c]",
        glow && "shadow-[0_0_40px_rgba(255,91,4,0.10)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border bg-surface/60 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
        <span className="ml-2 truncate text-xs text-muted">{path}</span>
      </div>
      <div className="p-5 font-mono text-sm leading-relaxed">{children}</div>
    </div>
  );
}

/** A prompt line, optionally typed out on view. */
export function TermLine({
  prompt = "$",
  children,
  className,
  accent,
}: {
  prompt?: string;
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <p className={cn("flex gap-2", className)}>
      <span className="select-none text-accent">{prompt}</span>
      <span className={accent ? "text-foreground" : "text-muted"}>{children}</span>
    </p>
  );
}

/** Box-drawing horizontal rule. */
export function AsciiRule({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "select-none overflow-hidden font-mono text-[10px] leading-none text-border",
        className,
      )}
      aria-hidden
    >
      {"─".repeat(400)}
    </div>
  );
}

/** A blinking block cursor. */
export function Cursor() {
  const reduce = useReducedMotion();
  return (
    <motion.span
      className="ml-0.5 inline-block h-[1em] w-[0.55em] translate-y-[0.12em] bg-accent"
      animate={reduce ? {} : { opacity: [1, 1, 0, 0] }}
      transition={{ duration: 1, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
      aria-hidden
    />
  );
}

const GLYPHS = "01∴·+=×/\\<>[]{}#".split("");

/** Faint animated glyph field for section backgrounds. Deterministic layout
    (seeded by index) so it doesn't use Math.random at module scope. */
export function AsciiField({
  className,
  rows = 8,
  cols = 40,
}: {
  className?: string;
  rows?: number;
  cols?: number;
}) {
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setTick((t) => t + 1), 900);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <div
      className={cn(
        "pointer-events-none select-none overflow-hidden font-mono text-[10px] leading-[1.35] text-muted/15",
        className,
      )}
      aria-hidden
    >
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="whitespace-nowrap">
          {Array.from({ length: cols }, (_, c) => {
            const seed = (r * 31 + c * 17 + tick * 13) % GLYPHS.length;
            const lit = (r * 7 + c * 3 + tick) % 29 === 0;
            return (
              <span key={c} className={lit ? "text-accent/40" : undefined}>
                {GLYPHS[seed]}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** ASCII hexagon wordmark mark (the ⬡ built from box characters). */
export function AsciiMark({ className }: { className?: string }) {
  return (
    <pre
      className={cn("select-none font-mono text-[7px] leading-[1.1] text-accent", className)}
      aria-hidden
    >{`  __
 /  \\
 \\__/`}</pre>
  );
}
