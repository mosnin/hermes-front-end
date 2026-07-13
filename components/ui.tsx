"use client";

import {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
  useEffect,
  useId,
  useState,
} from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "outline";
}) {
  const variants = {
    primary:
      "bg-accent text-white hover:brightness-110 shadow-[0_0_16px_rgba(255,91,4,0.25)]",
    outline: "border border-border bg-surface-2 hover:border-muted",
    ghost: "text-muted hover:text-foreground hover:bg-surface-2",
    danger: "bg-red-500/90 text-white hover:bg-red-500",
  };
  return (
    <button
      className={cn(
        // Micro-interaction: press compresses, release springs back (CSS so it
        // composes with any button content; motion handles the bigger stuff).
        "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition active:scale-[0.97]",
        "disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border bg-surface p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "green" | "yellow" | "red" | "blue";
}) {
  const tones = {
    default: "bg-surface-2 text-muted",
    green: "bg-lime-400/10 text-lime-400",
    yellow: "bg-amber-400/10 text-amber-400",
    red: "bg-red-500/10 text-red-400",
    blue: "bg-sky-400/10 text-sky-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none transition placeholder:text-muted focus:border-accent focus:shadow-[0_0_12px_rgba(255,91,4,0.15)]",
        props.className,
      )}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none transition placeholder:text-muted focus:border-accent focus:shadow-[0_0_12px_rgba(255,91,4,0.15)]",
        props.className,
      )}
    />
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="w-full max-w-lg rounded-3xl border border-border bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          >
            <h2 className="mb-4 text-lg font-semibold">{title}</h2>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-3xl border border-dashed border-border bg-surface/50 p-12 text-center">
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>
        {action && <div className="mt-4 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

export function StatusDot({ status }: { status?: string }) {
  const color =
    status === "online"
      ? "bg-lime-400 shadow-[0_0_8px_rgba(163,230,53,0.7)]"
      : status === "degraded"
        ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]"
        : status === "pending"
          ? "bg-accent shadow-[0_0_8px_rgba(255,91,4,0.6)]"
          : "bg-zinc-600";
  return (
    <span className="relative inline-flex h-2 w-2">
      {/* Live agents visibly breathe: an expanding ping ring behind the dot. */}
      {status === "online" && (
        <motion.span
          className="absolute inset-0 rounded-full bg-lime-400"
          animate={{ scale: [1, 2.4], opacity: [0.5, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span className={cn("relative inline-block h-2 w-2 rounded-full", color)} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Instrument-panel pieces
// ---------------------------------------------------------------------------

const RING_COLORS = {
  accent: { stroke: "#ff5b04", glow: "rgba(255,91,4,0.55)" },
  green: { stroke: "#a3e635", glow: "rgba(163,230,53,0.55)" },
  yellow: { stroke: "#facc15", glow: "rgba(250,204,21,0.55)" },
  red: { stroke: "#ef4444", glow: "rgba(239,68,68,0.6)" },
  cyan: { stroke: "#67e8f9", glow: "rgba(103,232,249,0.5)" },
  muted: { stroke: "#3f3f3f", glow: "transparent" },
} as const;

export type RingColor = keyof typeof RING_COLORS;

/** Animated count-up for numeric readings; passthrough for anything else. */
function Reading({ value }: { value: ReactNode }) {
  const reduce = useReducedMotion();
  const target = typeof value === "number" ? value : null;
  const [shown, setShown] = useState(target !== null && !reduce ? 0 : target);
  useEffect(() => {
    if (target === null) return;
    if (reduce) {
      setShown(target);
      return;
    }
    const controls = animate(shown ?? 0, target, {
      duration: 0.9,
      ease: [0.22, 0.8, 0.3, 1],
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduce]);
  return <>{target === null ? value : shown}</>;
}

/**
 * Glowing ring gauge: dotted track + colored luminous arc with the reading in
 * the center. The arc draws in from zero and the number counts up.
 */
export function RingGauge({
  value,
  unit,
  color = "accent",
  pct = 1,
  size = 96,
  className,
}: {
  value: ReactNode;
  unit?: string;
  color?: RingColor;
  pct?: number; // 0..1 arc fill
  size?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const c = RING_COLORS[color];
  const r = 44;
  const circ = 2 * Math.PI * r;
  const arc = Math.max(0.02, Math.min(1, pct)) * circ;
  return (
    <div
      className={cn("relative grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
        {/* dotted track */}
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth="2.5"
          strokeDasharray="1.5 4.5"
        />
        {/* luminous arc — draws in from zero */}
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={c.stroke}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: reduce ? circ - arc : circ }}
          animate={{ strokeDashoffset: circ - arc }}
          transition={{ duration: 1.1, ease: [0.22, 0.8, 0.3, 1] }}
          style={{ filter: `drop-shadow(0 0 6px ${c.glow})` }}
        />
      </svg>
      <span className="text-center leading-none">
        <span className="font-semibold" style={{ fontSize: size / 4.6 }}>
          <Reading value={value} />
        </span>
        {unit && (
          <sup className="ml-0.5 text-muted" style={{ fontSize: size / 9 }}>
            {unit}
          </sup>
        )}
      </span>
    </div>
  );
}

/** Pill-tab segmented control — the active pill morphs between options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  // Scope the morphing pill to this instance — a shared layoutId would make
  // two Segmented controls on one page animate into each other.
  const pillId = useId();
  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative rounded-lg px-3 py-1.5 text-sm transition",
            o.value === value
              ? "text-white"
              : "text-muted hover:bg-surface-2 hover:text-foreground",
          )}
        >
          {o.value === value && (
            <motion.span
              layoutId={pillId}
              className="absolute inset-0 rounded-lg bg-accent shadow-[0_0_14px_rgba(255,91,4,0.3)]"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** On/off switch — the knob travels on a spring. */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2"
    >
      {label && <span className="text-sm text-muted">{label}</span>}
      <span
        className={cn(
          "relative flex h-5 w-9 items-center rounded-full px-0.5 transition-colors",
          checked
            ? "justify-end bg-accent shadow-[0_0_10px_rgba(255,91,4,0.4)]"
            : "justify-start border border-border bg-surface-2",
        )}
      >
        <motion.span
          layout
          className="h-4 w-4 rounded-full bg-white"
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
        />
      </span>
    </button>
  );
}
