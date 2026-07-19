"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { Reveal, Stagger, StaggerItem, CountUp, EASE } from "@/components/site/motion";

/* ---------------------------------------------------------------------------
   Editorial dashboard kit. The application interior in the marketing site's
   design language: paper white, beige/white rounded panels, big grotesk
   headers, quiet hairlines, pill buttons, generous air, and the shared
   motion vocabulary. Pure presentation; pages map their real data onto these.
--------------------------------------------------------------------------- */

/** Page header: eyebrow, big grotesk title, muted sub, right-aligned actions. */
export function PageHead({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Reveal as="div" y={12} className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-2 font-mono text-[11.5px] uppercase tracking-[0.14em] text-[var(--muted)]">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[30px] font-medium leading-[1.1] tracking-[-0.01em] text-[var(--foreground)] sm:text-[36px]">
          {title}
        </h1>
        {sub && <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[var(--muted)]">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </Reveal>
  );
}

/** Solid-ink pill button (primary action). */
export function PillButton({
  children,
  onClick,
  href,
  variant = "solid",
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "solid" | "outline";
  className?: string;
}) {
  const reduce = useReducedMotion();
  const cls = cn(
    "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-[14px] font-medium transition-colors",
    variant === "solid"
      ? "bg-[var(--foreground)] text-[var(--background)] hover:opacity-90"
      : "border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:border-[var(--border-hover)]",
    className,
  );
  const inner = <span className={cls}>{children}</span>;
  const motionProps = reduce ? {} : { whileTap: { scale: 0.97 }, transition: { duration: 0.15, ease: EASE } };
  if (href) {
    return (
      <motion.span {...motionProps} className="inline-flex">
        <Link href={href} className={cls}>
          {children}
        </Link>
      </motion.span>
    );
  }
  return (
    <motion.button {...motionProps} onClick={onClick} className={cls}>
      {children}
    </motion.button>
  );
}

/** A rounded panel: white by default, beige when `tone="band"`. Generous pad. */
export function Panel({
  title,
  action,
  tone = "white",
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  tone?: "white" | "band";
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      whileHover={{ y: -2 }}
      transition={{ duration: 0.3, ease: EASE }}
      className={cn(
        "rounded-[22px] p-6 sm:p-7",
        tone === "band"
          ? "bg-[var(--surface)]"
          : "bg-[var(--background)] ring-1 ring-inset ring-[var(--border)]",
        className,
      )}
    >
      {(title || action) && (
        <div className="mb-5 flex items-center justify-between gap-3">
          {title && <h2 className="text-[16px] font-semibold tracking-tight text-[var(--foreground)]">{title}</h2>}
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </motion.section>
  );
}

/** Big-number stat tile with an animated count-up. */
export function StatTile({
  value,
  suffix,
  prefix,
  label,
  hint,
  tone = "white",
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  hint?: string;
  tone?: "white" | "band" | "ink";
}) {
  return (
    <StaggerItem y={16}>
      <div
        className={cn(
          "flex h-full flex-col justify-between rounded-[20px] p-5 sm:p-6",
          tone === "ink"
            ? "bg-[var(--foreground)] text-[var(--background)]"
            : tone === "band"
              ? "bg-[var(--surface)] text-[var(--foreground)]"
              : "bg-[var(--background)] text-[var(--foreground)] ring-1 ring-inset ring-[var(--border)]",
        )}
      >
        <p className={cn("text-[38px] font-medium leading-none tracking-[-0.02em] tabular-nums sm:text-[44px]")}>
          <CountUp value={value} prefix={prefix} suffix={suffix} />
        </p>
        <div className="mt-4">
          <p className="text-[14.5px] font-medium">{label}</p>
          {hint && (
            <p className={cn("mt-0.5 text-[12.5px]", tone === "ink" ? "text-white/55" : "text-[var(--muted)]")}>
              {hint}
            </p>
          )}
        </div>
      </div>
    </StaggerItem>
  );
}

/** A responsive grid of stat tiles with staggered reveal. */
export function StatRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Stagger className={cn("grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4", className)} gap={0.07}>
      {children}
    </Stagger>
  );
}

/** A quiet list row with generous height, for activity/agent lists. */
export function ListRow({
  leading,
  title,
  meta,
  trailing,
  href,
  onClick,
}: {
  leading?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <div className="flex items-center gap-3.5 px-1 py-3.5">
      {leading && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--surface)] text-[13px] font-medium text-[var(--muted-strong)]">{leading}</span>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] text-[var(--foreground)]">{title}</p>
        {meta && <p className="truncate text-[12.5px] text-[var(--muted)]">{meta}</p>}
      </div>
      {trailing && <div className="shrink-0 text-[13px] text-[var(--muted)]">{trailing}</div>}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--surface)]/50">
        {inner}
      </Link>
    );
  }
  return (
    <div
      onClick={onClick}
      className={cn("border-b border-[var(--border)] last:border-0", onClick && "cursor-pointer transition-colors hover:bg-[var(--surface)]/50")}
    >
      {inner}
    </div>
  );
}

/** Small status dot with an optional breathing ping (online). */
export function Dot({ tone = "online" }: { tone?: "online" | "paused" | "idle" | "error" }) {
  const reduce = useReducedMotion();
  const color =
    tone === "online" ? "#3fb950" : tone === "paused" ? "#d9a441" : tone === "error" ? "#e5484d" : "#b4b1aa";
  return (
    <span className="relative flex h-2 w-2">
      {tone === "online" && !reduce && (
        <motion.span
          className="absolute inline-flex h-full w-full rounded-full"
          style={{ background: color }}
          animate={{ scale: [1, 2.3], opacity: [0.5, 0] }}
          transition={{ duration: 1.9, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

/** Section label with a trailing hairline. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">{children}</span>
      <span className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}
