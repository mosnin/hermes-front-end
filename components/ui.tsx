"use client";

import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
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
        "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50",
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
        "rounded-2xl border border-border bg-surface p-5",
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
        "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent",
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
        "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent",
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
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
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
    <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-surface/50 p-12 text-center">
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
  return <span className={cn("inline-block h-2 w-2 rounded-full", color)} />;
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

/**
 * Glowing ring gauge: dotted track + colored luminous arc with the reading in
 * the center (value + superscript unit), like a sensor dial.
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
        {/* luminous arc */}
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={c.stroke}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circ - arc}`}
          style={{ filter: `drop-shadow(0 0 6px ${c.glow})` }}
        />
      </svg>
      <span className="text-center leading-none">
        <span className="font-semibold" style={{ fontSize: size / 4.6 }}>
          {value}
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

/** Pill-tab segmented control (Overview / Device log … or °C / °F). */
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
  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm transition",
            o.value === value
              ? "bg-accent text-white shadow-[0_0_14px_rgba(255,91,4,0.3)]"
              : "text-muted hover:bg-surface-2 hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** On/off switch (the orange chirp toggle). */
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
          "relative h-5 w-9 rounded-full transition",
          checked ? "bg-accent shadow-[0_0_10px_rgba(255,91,4,0.4)]" : "bg-surface-2 border border-border",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}
