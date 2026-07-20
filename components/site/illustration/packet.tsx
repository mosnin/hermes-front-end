"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Shared low-level pieces for the diagram illustrations: a small dot that
   travels a straight segment (transform x/y + opacity only) to suggest data
   flowing along a connector, and a soft breathing ring used for "this node is
   alive" ambient states. Both fully stop under reduced motion.

   Every primitive here also accepts an optional `active` prop (default
   `true`, fully back-compatible with existing callers such as the sign-in
   shell's `BreathingRings`). Callers that track their own viewport
   visibility can pass `active={inView}` so the infinite `repeat: Infinity`
   loops are torn down while the illustration is scrolled off-screen instead
   of running their rAF/spring work forever in the background, a
   performance win with no visual difference while the piece is in view.
--------------------------------------------------------------------------- */

type Axis = "x" | "y";

export function TravelingPacket({
  axis,
  distance,
  duration = 2.2,
  delay = 0,
  repeatDelay = 0.5,
  color = "#8b5cf6",
  size = 6,
  /** When true the packet travels out to `distance` and back, a round-trip
   *  "heartbeat" along the connector instead of a one-way trip. */
  pingpong = false,
  /** Render a soft blurred trailing glow behind the packet head. */
  trail = true,
  /** Set to `false` while off-screen to tear down the infinite loop; the
   *  packet simply isn't rendered until it becomes true again. */
  active = true,
  className,
  style,
}: {
  /** Which transform axis the packet travels along. */
  axis: Axis;
  /** px to travel; sign sets direction. */
  distance: number;
  duration?: number;
  delay?: number;
  repeatDelay?: number;
  color?: string;
  size?: number;
  pingpong?: boolean;
  trail?: boolean;
  active?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduce = useReducedMotion();
  if (reduce || !active) return null;
  const positions = pingpong ? [0, distance, 0] : [0, distance];
  const travel = axis === "x" ? { x: positions } : { y: positions };
  const headOpacity = pingpong ? [0, 1, 1, 1, 0] : [0, 1, 1, 0];
  const trailOpacity = pingpong ? [0, 0.35, 0.35, 0.35, 0] : [0, 0.35, 0.35, 0];
  const trailScale = pingpong ? [0.6, 1.7, 1.7, 1.7, 0.6] : [0.6, 1.7, 1.7, 0.6];
  return (
    <>
      {trail && (
        <motion.span
          aria-hidden
          className={cn("pointer-events-none absolute rounded-full blur-[2px]", className)}
          style={{ width: size, height: size, background: color, ...style }}
          animate={{ ...travel, opacity: trailOpacity, scale: trailScale }}
          transition={{ duration, delay: delay + 0.06, repeat: Infinity, repeatDelay, ease: "easeInOut" }}
        />
      )}
      <motion.span
        aria-hidden
        className={cn("pointer-events-none absolute rounded-full", className)}
        style={{ width: size, height: size, background: color, ...style }}
        animate={{ ...travel, opacity: headOpacity }}
        transition={{ duration, delay, repeat: Infinity, repeatDelay, ease: "easeInOut" }}
      />
    </>
  );
}

/** A ring of small dots that slowly orbits around the center of its
 *  (relatively positioned) parent, a "the system is orbiting/alive" ambient
 *  loop. Rotation-only (transform), fully removed under reduced motion. */
export function OrbitDots({
  colors,
  radius = 160,
  size = 5,
  duration = 26,
  /** Set to `false` while off-screen to stop the rotation loop. */
  active = true,
  className,
}: {
  colors: string[];
  radius?: number;
  size?: number;
  duration?: number;
  active?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce || !active) return null;
  const n = colors.length;
  return (
    <motion.div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
      animate={{ rotate: 360 }}
      transition={{ duration, repeat: Infinity, ease: "linear" }}
    >
      {colors.map((c, i) => (
        <span
          key={i}
          className="absolute rounded-full opacity-60"
          style={{
            left: 0,
            top: 0,
            width: size,
            height: size,
            background: c,
            transform: `translate(-50%, -50%) rotate(${(360 / n) * i}deg) translateY(-${radius}px)`,
          }}
        />
      ))}
    </motion.div>
  );
}

/** Concentric rings that breathe outward from a node, opacity-only loop. */
export function BreathingRings({
  count = 3,
  baseSize = 60,
  step = 16,
  color = "#dcd9d2",
  duration = 3,
  /** Set to `false` while off-screen to stop the breathing loop. */
  active = true,
  className,
}: {
  count?: number;
  baseSize?: number;
  step?: number;
  color?: string;
  duration?: number;
  active?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce || !active) return null;
  return (
    <>
      {Array.from({ length: count }).map((_, r) => (
        <motion.span
          key={r}
          aria-hidden
          className={cn("pointer-events-none absolute rounded-full border", className)}
          style={{ width: baseSize + r * step, height: (baseSize + r * step) * 0.4, borderColor: color }}
          animate={{ opacity: [0.55, 0.15, 0.55] }}
          transition={{ duration, repeat: Infinity, delay: r * (duration / count / 2) }}
        />
      ))}
    </>
  );
}

/** A short pulsing dot used as a "live" status indicator, opacity+scale only.
 *  Pass `active={false}` while off-screen to pause the ping loop; the solid
 *  center dot always renders so the status reads correctly either way. */
export function LiveDot({
  color = "#10b981",
  delay = 0,
  active = true,
  className,
}: {
  color?: string;
  delay?: number;
  active?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <span className={cn("relative flex h-2 w-2 shrink-0", className)}>
      {!reduce && active && (
        <motion.span
          className="absolute inline-flex h-full w-full rounded-full"
          style={{ background: color }}
          animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, delay }}
        />
      )}
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  );
}
