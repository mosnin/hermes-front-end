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
import { DURATION, EASE } from "@/components/site/motion";

/* ---------------------------------------------------------------------------
   Cycle 7 cross-surface consistency: shared spring presets for the UI kit's
   pill-glide and pop-in interactions, so every `layoutId` pill morph and
   every badge/count spring-pop in the shell settles with the same handful of
   feels instead of a bespoke stiffness/damping per call site (this file had
   three near-identical-but-not-quite pill springs and two near-identical pop
   springs before this pass). `components/sidebar.tsx` imports these too, so
   its active-nav pill and live-count badge match Segmented/Badge/Toggle
   exactly rather than drifting a point or two off. Distinct from Lane A's
   `SPRING` in `site/motion.tsx` (`snappy`/`scroll`/`soft`), which tunes
   pointer- and scroll-linked motion values, a different feel from a
   discrete pill/badge settle. */
export const UI_SPRING = {
  /** `layoutId` pill glide: Segmented's active option, the sidebar's active
   *  nav pill. */
  pill: { type: "spring", stiffness: 420, damping: 34 },
  /** Small badge/count pop-in or value bump: Badge mount, Toggle's knob
   *  travel, the sidebar's live agent-count bump. */
  pop: { type: "spring", stiffness: 500, damping: 32 },
  /** Modal panel entrance. */
  panel: { type: "spring", stiffness: 380, damping: 30 },
} as const;

/* ---------------------------------------------------------------------------
   Application UI kit — paper-white pill/beige-card language. Every consumer
   across the dashboard keeps the exact same props; only the presentation and
   the hover/press micro-interactions changed.
--------------------------------------------------------------------------- */

// framer-motion's HTMLMotionProps redefine a handful of native event names
// (drag/animation lifecycle) with its own gesture signatures, so a spread of
// plain ButtonHTMLAttributes can collide with them. Button is used ~60 places
// and none pass those, so omitting them from the public prop type is safe.
type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd"
>;

// Same drag/animation event-name collision as Button above, for the two
// motion-wrapped form fields below.
type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd"
>;
type NativeTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd"
>;

export function Button({
  className,
  variant = "primary",
  ...props
}: NativeButtonProps & {
  variant?: "primary" | "ghost" | "danger" | "outline";
}) {
  const reduce = useReducedMotion();
  const variants = {
    primary: "bg-[var(--foreground)] text-white hover:bg-black",
    outline: "border border-border bg-background text-foreground hover:border-border-hover",
    ghost: "text-muted hover:text-foreground hover:bg-band",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <motion.button
      whileHover={reduce || props.disabled ? undefined : { y: -1 }}
      whileTap={reduce || props.disabled ? undefined : { scale: 0.96 }}
      transition={{ duration: DURATION.instant, ease: EASE }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
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
        "rounded-card border border-border bg-surface p-6 shadow-card transition-shadow duration-300 hover:shadow-card-hover",
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
  const reduce = useReducedMotion();
  const tones = {
    default: "bg-band text-muted",
    green: "bg-green-50 text-green-700",
    yellow: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-sky-50 text-sky-700",
  };
  return (
    <motion.span
      initial={reduce ? false : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={UI_SPRING.pop}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </motion.span>
  );
}

export function Input(props: NativeInputProps) {
  const reduce = useReducedMotion();
  return (
    <motion.input
      {...props}
      whileFocus={reduce ? undefined : { scale: 1.006 }}
      transition={{ duration: DURATION.instant, ease: EASE }}
      className={cn(
        "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-[var(--foreground)] focus:shadow-[0_0_0_3px_rgba(31,31,28,0.08)]",
        props.className,
      )}
    />
  );
}

export function Textarea(props: NativeTextareaProps) {
  const reduce = useReducedMotion();
  return (
    <motion.textarea
      {...props}
      whileFocus={reduce ? undefined : { scale: 1.003 }}
      transition={{ duration: DURATION.instant, ease: EASE }}
      className={cn(
        "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-[var(--foreground)] focus:shadow-[0_0_0_3px_rgba(31,31,28,0.08)]",
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
  const reduce = useReducedMotion();

  // Escape-to-close and a body scroll lock while the modal is open. Pure
  // presentation/UX polish on top of the exact same `onClose` every one of
  // the ~20 call sites already wires up; nothing about the open/children
  // contract changes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-[#1f1f1c]/40 p-4 backdrop-blur-[2px]"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION.instant, ease: EASE }}
        >
          <motion.div
            className="relative w-full max-w-lg rounded-modal border border-border bg-background p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={UI_SPRING.panel}
          >
            <motion.button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="absolute right-5 top-5 grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-band hover:text-foreground"
              whileHover={reduce ? undefined : { rotate: 90 }}
              whileTap={reduce ? undefined : { scale: 0.88 }}
              transition={{ duration: DURATION.instant, ease: EASE }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </motion.button>
            {/* Title + body settle in a beat after the panel spring lands,
                so the frame arrives first and the content reads as filling
                it rather than everything popping at once. Same editorial
                `EASE` curve as every other one-shot fade in the shell. */}
            <motion.div
              initial={reduce ? undefined : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: DURATION.instant, delay: reduce ? 0 : 0.06, ease: EASE }}
            >
              <h2 className="mb-4 pr-8 text-lg font-semibold text-foreground">{title}</h2>
              {children}
            </motion.div>
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
  graphic,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  graphic?: ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-card border border-dashed border-border bg-band/40 p-12 text-center">
      <div className="flex flex-col items-center">
        {graphic && (
          <div className="mb-5 grid h-24 w-24 place-items-center rounded-2xl border border-border bg-background">
            <div className="h-16 w-16">{graphic}</div>
          </div>
        )}
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>
        {action && <div className="mt-4 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

/** Shimmering placeholder block. Match the size of what it stands in for. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg", className)} />;
}

/** N stacked skeleton rows — the default "list is loading" affordance. */
export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatusDot({ status }: { status?: string }) {
  const reduce = useReducedMotion();
  const color =
    status === "online"
      ? "bg-green-500"
      : status === "degraded"
        ? "bg-amber-500"
        : status === "pending"
          ? "bg-[var(--foreground)]"
          : "bg-[#d8d5cd]";
  return (
    <span className="relative inline-flex h-2 w-2">
      {/* Live agents visibly breathe: an expanding ping ring behind the dot.
          Ambient/looping, so it fully stops under reduced motion instead of
          pinging forever. */}
      {status === "online" && !reduce && (
        <motion.span
          className="absolute inset-0 rounded-full bg-green-500"
          animate={{ scale: [1, 2.4], opacity: [0.45, 0] }}
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
  accent: { stroke: "#1f1f1c", glow: "rgba(31,31,28,0.28)" },
  green: { stroke: "#16a34a", glow: "rgba(22,163,74,0.32)" },
  yellow: { stroke: "#d97706", glow: "rgba(217,119,6,0.3)" },
  red: { stroke: "#dc2626", glow: "rgba(220,38,38,0.32)" },
  cyan: { stroke: "#0891b2", glow: "rgba(8,145,178,0.3)" },
  muted: { stroke: "#d8d5cd", glow: "transparent" },
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
      // Same editorial `EASE` curve as every other one-shot reveal/count in
      // the shell (cycle 7: this and RingGauge's arc draw-in used to carry
      // their own near-identical-but-not-quite bezier literal each).
      ease: EASE,
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduce]);
  return <>{target === null ? value : shown}</>;
}

/**
 * Ring gauge: dotted track + colored arc with the reading in the center. The
 * arc draws in from zero and the number counts up.
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
        {/* colored arc — draws in from zero */}
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
          transition={{ duration: 1.1, ease: EASE }}
          style={{ filter: `drop-shadow(0 0 5px ${c.glow})` }}
        />
      </svg>
      <span className="text-center leading-none">
        <span className="font-semibold text-foreground" style={{ fontSize: size / 4.6 }}>
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
  const reduce = useReducedMotion();
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-full border border-border bg-background p-1", className)}>
      {options.map((o) => (
        <motion.button
          key={o.value}
          onClick={() => onChange(o.value)}
          whileTap={reduce ? undefined : { scale: 0.94 }}
          className={cn(
            "relative rounded-full px-3 py-1.5 text-sm transition-colors",
            o.value === value
              ? "text-white"
              : "text-muted hover:text-foreground",
          )}
        >
          {o.value === value && (
            <motion.span
              layoutId={pillId}
              className="absolute inset-0 rounded-full bg-[var(--foreground)]"
              transition={UI_SPRING.pill}
            />
          )}
          <span className="relative">{o.label}</span>
        </motion.button>
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
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      whileTap={reduce ? undefined : { scale: 0.94 }}
      className="inline-flex items-center gap-2"
    >
      {label && <span className="text-sm text-muted">{label}</span>}
      <span
        className={cn(
          "relative flex h-5 w-9 items-center rounded-full px-0.5 transition-colors",
          checked
            ? "justify-end bg-[var(--foreground)]"
            : "justify-start border border-border bg-band",
        )}
      >
        <motion.span
          layout
          className="h-4 w-4 rounded-full bg-background shadow-[0_1px_2px_rgba(31,31,28,0.25)]"
          transition={UI_SPRING.pop}
        />
      </span>
    </motion.button>
  );
}
