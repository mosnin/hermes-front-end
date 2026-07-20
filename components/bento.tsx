"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsUp,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { DURATION, EASE } from "@/components/site/motion";

/* ---------------------------------------------------------------------------
   Bento cards — the premium card system: very round (rounded-3xl), generous
   padding, big quiet titles, tiny muted metadata, one accent per card.
   Cycle 7 cross-surface consistency: the hover-lift here now shares the
   exact `DURATION.instant` + `EASE` transition every other pressable
   surface in the app uses (Button, Modal's close glyph) instead of a
   bespoke `duration: 0.2` with the framer default ease.
--------------------------------------------------------------------------- */

export function BentoCard({
  title,
  action,
  children,
  className,
  tone = "surface",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "surface" | "accent";
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn(
        "rounded-3xl p-6 transition-shadow",
        tone === "accent"
          ? "bg-accent text-white shadow-[0_0_40px_rgba(255,91,4,0.18)]"
          : "border border-border bg-surface hover:shadow-[0_8px_28px_-16px_rgba(31,31,28,0.25)]",
        className,
      )}
      whileHover={reduce ? undefined : { y: -3, transition: { duration: DURATION.instant, ease: EASE } }}
    >
      {(title || action) && (
        <div className="mb-5 flex items-center justify-between gap-3">
          {title && <h2 className="text-xl font-semibold tracking-tight">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </motion.div>
  );
}

/** Quiet dropdown-style label for a card corner ("Circles view ⌄"). */
export function CardMenuLabel({ children }: { children: ReactNode }) {
  return (
    <button className="flex items-center gap-1.5 text-sm text-muted transition hover:text-foreground">
      {children}
      <ChevronDown className="h-4 w-4" />
    </button>
  );
}

/* -- Dot matrix (skills board) ---------------------------------------------- */

export function DotMatrixCard({
  title,
  rows,
  cols = 10,
  axis,
  action,
  className,
}: {
  title: string;
  rows: { label: string; value: number }[];
  cols?: number;
  axis?: [string, string, string];
  action?: ReactNode;
  className?: string;
}) {
  return (
    <BentoCard title={title} action={action} className={className}>
      <div className="space-y-3">
        {rows.map((r, ri) => (
          <div key={r.label} className="flex items-center gap-4">
            <div className="flex flex-1 items-center gap-1.5">
              {Array.from({ length: cols }, (_, i) => (
                <motion.span
                  key={i}
                  className={cn(
                    "aspect-square min-w-0 flex-1 rounded-full",
                    i < r.value
                      ? "bg-lime-400 shadow-[0_0_6px_rgba(163,230,53,0.35)]"
                      : "bg-surface-2",
                  )}
                  style={{ maxWidth: 34 }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 420,
                    damping: 24,
                    delay: 0.05 * ri + 0.03 * i,
                  }}
                />
              ))}
            </div>
            <span className="w-16 shrink-0 text-right text-sm text-muted">
              {r.label}
            </span>
          </div>
        ))}
      </div>
      {axis && (
        <div className="mt-5 flex items-center justify-between pr-20 text-sm text-muted">
          <span>{axis[0]}</span>
          <span>{axis[1]}</span>
          <span>{axis[2]}</span>
        </div>
      )}
    </BentoCard>
  );
}

/* -- Solid accent media card (interview record) ------------------------------ */

export function MediaCard({
  title,
  subtitle,
  bars,
  meta,
  href,
  onClear,
  className,
}: {
  title: string;
  subtitle?: string;
  bars: number[]; // waveform heights, arbitrary scale
  meta: string; // centered footer label ("4:20")
  href?: string; // play button target
  onClear?: () => void;
  className?: string;
}) {
  const max = Math.max(...bars, 1);
  const Wrapper = href ? Link : "div";
  const reduce = useReducedMotion();
  return (
    <BentoCard tone="accent" className={cn("flex flex-col", className)}>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-white/70">{subtitle}</p>}
      </div>
      <div className="my-5 flex justify-center">
        <motion.div
          animate={reduce ? undefined : { scale: [1, 1.06, 1] }}
          transition={reduce ? undefined : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <Wrapper
            href={(href ?? "#") as never}
            className="grid h-16 w-16 place-items-center rounded-full bg-white/20 backdrop-blur transition hover:bg-white/30 active:scale-95"
          >
            <Play className="ml-1 h-6 w-6 fill-white text-white" />
          </Wrapper>
        </motion.div>
      </div>
      <div className="flex h-14 items-end justify-center gap-[3px]">
        {bars.map((b, i) => (
          <motion.span
            key={i}
            className="w-[3px] origin-bottom rounded-full bg-white/85"
            style={{ height: `${Math.max(8, (b / max) * 100)}%` }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.2 + i * 0.018, type: "spring", stiffness: 320, damping: 22 }}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={onClear}
          className="text-white/60 transition hover:text-white"
          title="Clear"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">{meta}</span>
        <button className="text-white/60 transition hover:text-white" title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
    </BentoCard>
  );
}

/* -- Date / session chip ------------------------------------------------------ */

export function DateChipCard({
  date,
  label,
  className,
}: {
  date: string;
  label: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn(
        "flex items-center gap-4 rounded-3xl border border-border bg-surface px-6 py-5",
        className,
      )}
      whileHover={reduce ? undefined : { y: -3, transition: { duration: DURATION.instant, ease: EASE } }}
    >
      <span className="h-9 w-1 rounded-full bg-accent shadow-[0_0_8px_rgba(255,91,4,0.6)]" />
      <div>
        <p className="font-semibold tracking-tight">{date}</p>
        <p className="text-sm text-muted">{label}</p>
      </div>
    </motion.div>
  );
}

/* -- Review list (candidates review) ------------------------------------------ */

export type ReviewRow = {
  id: string;
  glyph: ReactNode; // avatar circle content
  name: string;
  role: string;
  pill: string;
  right: ReactNode; // trailing control (toggle, link…)
  href?: string;
};

export function ReviewListCard({
  title,
  rows,
  onAdd,
  addLabel,
  className,
}: {
  title: string;
  rows: ReviewRow[];
  onAdd?: () => void;
  addLabel?: string;
  className?: string;
}) {
  return (
    <BentoCard title={title} className={className}>
      <div>
        {rows.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 * i, type: "spring", stiffness: 320, damping: 28 }}
            className={cn(
              "flex items-center gap-4 py-3.5",
              i > 0 && "border-t border-border",
            )}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-sm">
              {r.glyph}
            </span>
            <div className="min-w-0 flex-1">
              {r.href ? (
                <Link href={r.href as never} className="block truncate font-medium hover:text-accent">
                  {r.name}
                </Link>
              ) : (
                <p className="truncate font-medium">{r.name}</p>
              )}
              <p className="truncate text-sm text-muted">{r.role}</p>
            </div>
            <span className="rounded-full bg-surface-2 px-3.5 py-1.5 text-sm">
              {r.pill}
            </span>
            <div className="flex w-28 shrink-0 items-center justify-end gap-3">
              {r.right}
            </div>
          </motion.div>
        ))}
        {onAdd && (
          <button
            onClick={onAdd}
            className={cn(
              "flex w-full items-center gap-4 py-3.5 text-muted transition hover:text-foreground",
              rows.length > 0 && "border-t border-border",
            )}
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-2">
              <Plus className="h-4 w-4" />
            </span>
            <span className="text-sm">{addLabel ?? "Add new"}</span>
          </button>
        )}
      </div>
    </BentoCard>
  );
}

/* -- Stepped column chart (employment chart) ----------------------------------- */

const STEP_TONES = {
  lime: { block: "bg-lime-400", dot: "bg-lime-400" },
  muted: { block: "bg-surface-2", dot: "bg-zinc-500" },
  accent: { block: "bg-accent", dot: "bg-accent" },
  cyan: { block: "bg-cyan-300", dot: "bg-cyan-300" },
} as const;

export function SteppedChartCard({
  title,
  columns,
  insight,
  insightHref,
  action,
  className,
}: {
  title: string;
  columns: {
    label: string;
    sub: string;
    value: number;
    tone: keyof typeof STEP_TONES;
  }[];
  insight?: string;
  insightHref?: string;
  action?: ReactNode;
  className?: string;
}) {
  const max = Math.max(...columns.map((c) => c.value), 1);
  return (
    <BentoCard title={title} action={action} className={className}>
      <div className="grid auto-cols-fr grid-flow-col items-end gap-px" style={{ height: 150 }}>
        {columns.map((c, i) => (
          <motion.div
            key={c.label}
            className={cn("origin-bottom rounded-sm", STEP_TONES[c.tone].block)}
            style={{ height: `${Math.max(12, (c.value / max) * 100)}%` }}
            initial={{ scaleY: 0, opacity: 0.4 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{ delay: 0.12 * i, type: "spring", stiffness: 220, damping: 26 }}
          />
        ))}
      </div>
      <div className="grid auto-cols-fr grid-flow-col gap-px border-t border-border">
        {columns.map((c) => (
          <div key={c.label} className="flex items-start gap-2 pt-3">
            <span className={cn("mt-1.5 h-2 w-2 rounded-full", STEP_TONES[c.tone].dot)} />
            <div>
              <p className="font-semibold tracking-tight">{c.label}</p>
              <p className="text-sm text-muted">{c.sub}</p>
            </div>
          </div>
        ))}
      </div>
      {insight && (
        <Link
          href={(insightHref ?? "#") as never}
          className="mt-5 flex items-center gap-2.5 rounded-2xl bg-surface-2 px-4 py-3 text-sm transition hover:bg-surface-2/70"
        >
          <ChevronsUp className="h-4 w-4 text-accent" />
          <span className="flex-1">{insight}</span>
          <ChevronRight className="h-4 w-4 text-muted" />
        </Link>
      )}
    </BentoCard>
  );
}
