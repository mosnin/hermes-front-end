"use client";

import * as React from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useAnimationFrame,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
  type Variants,
} from "motion/react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Shared motion primitives for the whole site + app. Every lane imports from
   here so the motion vocabulary (easing, durations, reduced-motion behavior)
   stays consistent everywhere. Animate only transform + opacity for anything
   scroll- or loop-driven; every primitive fully degrades to a static, settled
   state when `useReducedMotion()` is true.
--------------------------------------------------------------------------- */

/** Shared "editorial rise" easing curve used across reveals and transitions. */
export const EASE: [number, number, number, number] = [0.22, 0.61, 0.24, 1];

/** Canonical duration scale (seconds), so every primitive here, and every
 *  mock/illustration that composes them, reaches for one of a handful of
 *  named settle times instead of a bespoke magic number per call site. Every
 *  one-shot transition's reduced-motion fallback uses `reduced` uniformly. */
export const DURATION = {
  /** Reduced-motion fallback for every one-shot reveal/transition: one
   *  settle time everywhere instead of a different number per call site. */
  reduced: 0.3,
  /** Instant micro-pops: a glyph or pill nudging on hover. */
  instant: 0.2,
  /** Fast hover/press micro-interactions (tilt, magnetic press). */
  fast: 0.28,
  /** Standard single row/tile/chip entrance. */
  base: 0.4,
  /** A larger single-element entrance (a fanned step, a spring-flavored
   *  tween) that reads slightly more deliberate than `base`. */
  medium: 0.5,
  /** `StaggerItem`'s default rise. */
  slow: 0.6,
  /** `Reveal`'s default, the largest editorial rise. */
  slower: 0.7,
  /** Route-level cross-fade (`PageTransition`). */
  route: 0.32,
} as const;

/** Canonical stagger gaps (seconds between siblings) for row/tile/chip
 *  entrance lists across the mock illustrations: `tight` for dense grids,
 *  `base` for typical ~5-item lists, `loose` for a slower, more dramatic
 *  single-column reveal (e.g. a fanned card stack). */
export const STAGGER = {
  tight: 0.06,
  base: 0.07,
  loose: 0.1,
} as const;

/** Canonical spring presets so every pointer- or scroll-linked motion value
 *  in this system settles with the same handful of feels instead of a
 *  bespoke stiffness/damping/mass per call site: `snappy` for pointer-linked
 *  response (magnetic pulls, tilt, hover blends), `scroll` for scroll-linked
 *  progress smoothing (a card's "energy"), `soft` for slow ambient drift
 *  (parallax offsets). */
export const SPRING = {
  snappy: { stiffness: 300, damping: 22, mass: 0.4 },
  scroll: { stiffness: 140, damping: 26, mass: 0.5 },
  soft: { stiffness: 120, damping: 30, mass: 0.4 },
} as const;

const MOTION_TAGS = {
  div: motion.div,
  span: motion.span,
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
  h4: motion.h4,
  p: motion.p,
  li: motion.li,
} as const;

type MotionTagName = keyof typeof MOTION_TAGS;

/* ------------------------------- Reveal --------------------------------- */

export type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** Animation start delay in seconds. */
  delay?: number;
  duration?: number;
  /** Vertical travel distance in px (0 disables). */
  y?: number;
  /** Horizontal travel distance in px (0 disables). */
  x?: number;
  once?: boolean;
  /** Viewport root margin, e.g. "-80px" to trigger before fully visible. */
  margin?: string;
  as?: MotionTagName;
};

/** Fade + rise reveal that triggers once an element scrolls into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  duration = DURATION.slower,
  y = 20,
  x = 0,
  once = true,
  margin = "-60px",
  as = "div",
}: RevealProps) {
  const reduce = useReducedMotion();
  const Tag = MOTION_TAGS[as];
  return (
    <Tag
      initial={{ opacity: 0, y: reduce ? 0 : y, x: reduce ? 0 : x }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once, margin, amount: 0.2 }}
      transition={{ duration: reduce ? DURATION.reduced : duration, delay: reduce ? 0 : delay, ease: EASE }}
      className={className}
    >
      {children}
    </Tag>
  );
}

/* ------------------------------- Stagger -------------------------------- */

export type StaggerProps = {
  children: React.ReactNode;
  className?: string;
  /** Seconds between each child's start. */
  gap?: number;
  delay?: number;
  once?: boolean;
  margin?: string;
  as?: MotionTagName;
};

/** Container that reveals `StaggerItem` children in cascading sequence. */
export function Stagger({
  children,
  className,
  gap = 0.08,
  delay = 0,
  once = true,
  margin = "-60px",
  as = "div",
}: StaggerProps) {
  const reduce = useReducedMotion();
  const Tag = MOTION_TAGS[as];
  const container: Variants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: reduce ? 0 : gap,
        delayChildren: reduce ? 0 : delay,
      },
    },
  };
  return (
    <Tag
      initial="hidden"
      whileInView="show"
      viewport={{ once, margin, amount: 0.2 }}
      variants={container}
      className={className}
    >
      {children}
    </Tag>
  );
}

export type StaggerItemProps = {
  children: React.ReactNode;
  className?: string;
  y?: number;
  duration?: number;
  as?: MotionTagName;
};

/** A single item inside `Stagger`; must be a direct-ish descendant. */
export function StaggerItem({ children, className, y = 16, duration = DURATION.slow, as = "div" }: StaggerItemProps) {
  const reduce = useReducedMotion();
  const Tag = MOTION_TAGS[as];
  const item: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : y },
    show: { opacity: 1, y: 0, transition: { duration: reduce ? DURATION.reduced : duration, ease: EASE } },
  };
  return (
    <Tag variants={item} className={className}>
      {children}
    </Tag>
  );
}

/* ------------------------------- Parallax -------------------------------- */

export type ParallaxProps = {
  children: React.ReactNode;
  className?: string;
  /** Max px of travel across the full scroll range. */
  offset?: number;
  direction?: "up" | "down";
  /** Which transform axis the travel applies to. */
  axis?: "x" | "y";
  /** Extra scale delta applied across the scroll range for a subtle depth-zoom
   *  (0 disables): e.g. 0.06 scales the content from 0.97 to 1.03 as it
   *  crosses the viewport. Transform-only, layers on top of the offset. */
  scale?: number;
  /** Tune the spring that smooths the scroll-linked travel; merges over the
   *  site's standard parallax feel. */
  springConfig?: { stiffness?: number; damping?: number; mass?: number };
};

const PARALLAX_SPRING = SPRING.soft;

/** Scroll-linked depth: content drifts opposite scroll direction (and
 *  optionally scales) at a rate independent of the page's own scroll,
 *  transform-only. */
export function Parallax({
  children,
  className,
  offset = 60,
  direction = "up",
  axis = "y",
  scale = 0,
  springConfig,
}: ParallaxProps) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const range = direction === "up" ? [offset, -offset] : [-offset, offset];
  const spring = { ...PARALLAX_SPRING, ...springConfig };

  const rawOffset = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : range);
  const smoothOffset = useSpring(rawOffset, spring);

  const rawScale = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    reduce || !scale ? [1, 1, 1] : [1 - scale / 2, 1, 1 + scale / 2],
  );
  const smoothScale = useSpring(rawScale, spring);

  const style: Record<string, unknown> = axis === "x" ? { x: smoothOffset } : { y: smoothOffset };
  if (scale) style.scale = smoothScale;

  return (
    <motion.div ref={ref} style={style} className={className}>
      {children}
    </motion.div>
  );
}

/* --------------------------- MagneticButton ------------------------------ */

export type MagneticButtonProps = {
  children: React.ReactNode;
  className?: string;
  /** How strongly the element follows the pointer (0..1). */
  strength?: number;
  /** Max px of travel from center, clamps the pull. */
  range?: number;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
};

/** Wraps a button/pill; it magnetically drifts toward the pointer, springs
 *  back on leave, and gives a press-scale on tap. Transform-only. */
export function MagneticButton({
  children,
  className,
  strength = 0.35,
  range = 14,
  onClick,
}: MagneticButtonProps) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, SPRING.snappy);
  const springY = useSpring(y, SPRING.snappy);

  const handleMove = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (reduce || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const relX = e.clientX - (rect.left + rect.width / 2);
      const relY = e.clientY - (rect.top + rect.height / 2);
      x.set(Math.max(-range, Math.min(range, relX * strength)));
      y.set(Math.max(-range, Math.min(range, relY * strength)));
    },
    [reduce, strength, range, x, y],
  );

  const handleLeave = React.useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={onClick}
      style={reduce ? undefined : { x: springX, y: springY }}
      whileTap={reduce ? undefined : { scale: 0.95 }}
      className={cn("inline-block", className)}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------- TiltCard -------------------------------- */

export type TiltCardProps = {
  children: React.ReactNode;
  className?: string;
  /** Max tilt rotation in degrees at the pointer's furthest extent from center. */
  max?: number;
  /** CSS perspective depth in px; smaller reads as a stronger 3D effect. */
  perspective?: number;
  /** Extra uniform scale applied while hovered. */
  hoverScale?: number;
};

/** Wraps a card so it tilts gently in 3D toward the pointer and lifts with a
 *  small scale, springing back flat on leave. Transform-only; renders
 *  children with no wrapper transforms at all under reduced motion so the
 *  layout stays identical but fully static. */
export function TiltCard({ children, className, max = 7, perspective = 1000, hoverScale = 1.015 }: TiltCardProps) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springRX = useSpring(rotateX, SPRING.snappy);
  const springRY = useSpring(rotateY, SPRING.snappy);

  const handleMove = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (reduce || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      rotateY.set(px * max * 2);
      rotateX.set(-py * max * 2);
    },
    [reduce, max, rotateX, rotateY],
  );

  const handleLeave = React.useCallback(() => {
    rotateX.set(0);
    rotateY.set(0);
  }, [rotateX, rotateY]);

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={className} style={{ perspective }}>
      <motion.div
        ref={ref}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        whileHover={{ scale: hoverScale }}
        transition={{ duration: DURATION.fast, ease: EASE }}
        style={{ rotateX: springRX, rotateY: springRY, transformStyle: "preserve-3d" }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/* -------------------------------- CountUp --------------------------------- */

export type CountUpProps = {
  value: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  /** Format the final rendered number; defaults to locale grouping. */
  format?: (n: number) => string;
  /** Easing curve for the count; defaults to the shared editorial `EASE`. */
  easing?: [number, number, number, number] | "linear";
  /** Small one-shot scale pop when the count finishes, transform-only and
   *  skipped entirely under reduced motion. */
  pop?: boolean;
};

/** Animates a number from 0 to `value` once it scrolls into view. If `value`
 *  changes later (a live counter ticking up), it animates onward from the
 *  current displayed number rather than resetting to 0. Digits render with
 *  tabular figures so the surrounding layout doesn't jitter while counting. */
export function CountUp({
  value,
  duration = 1.4,
  className,
  prefix = "",
  suffix = "",
  decimals = 0,
  format,
  easing = EASE,
  pop = true,
}: CountUpProps) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [display, setDisplay] = React.useState(reduce ? value : 0);
  const currentRef = React.useRef(reduce ? value : 0);
  const popScale = useMotionValue(1);

  React.useEffect(() => {
    if (!inView) return;
    if (reduce) {
      currentRef.current = value;
      setDisplay(value);
      return;
    }
    const controls = animate(currentRef.current, value, {
      duration,
      ease: easing,
      onUpdate: (v) => {
        currentRef.current = v;
        setDisplay(v);
      },
      onComplete: () => {
        if (pop) animate(popScale, [1, 1.1, 1], { duration: 0.42, ease: EASE });
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduce, value, duration, easing, pop]);

  const rendered = format ? format(display) : decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString();

  return (
    <motion.span
      ref={ref}
      className={className}
      style={{ scale: popScale, display: "inline-block", fontVariantNumeric: "tabular-nums" }}
    >
      {prefix}
      {rendered}
      {suffix}
    </motion.span>
  );
}

/* ------------------------------- TextReveal -------------------------------- */

export type TextRevealProps = {
  text: string;
  className?: string;
  wordClassName?: string;
  as?: "span" | "div" | "h1" | "h2" | "h3" | "p";
  delay?: number;
  stagger?: number;
  duration?: number;
  once?: boolean;
};

/** Word-by-word masked rise, the headline treatment. Falls back to a plain
 *  fade of the whole string under reduced motion. */
export function TextReveal({
  text,
  className,
  wordClassName,
  as = "span",
  delay = 0,
  stagger = 0.045,
  duration = DURATION.slow,
  once = true,
}: TextRevealProps) {
  const reduce = useReducedMotion();
  const words = React.useMemo(() => text.split(" "), [text]);
  const MotionTag = MOTION_TAGS[as];

  if (reduce) {
    return (
      <MotionTag
        className={className}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once, amount: 0.2 }}
        transition={{ duration: DURATION.reduced }}
      >
        {text}
      </MotionTag>
    );
  }

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren: delay } },
  };
  const wordVariant: Variants = {
    hidden: { y: "110%" },
    show: { y: "0%", transition: { duration, ease: EASE } },
  };

  return (
    <MotionTag
      className={cn("inline-block", className)}
      initial="hidden"
      whileInView="show"
      viewport={{ once, amount: 0.3, margin: "-40px" }}
      variants={container}
    >
      {words.map((w, i) => (
        <span key={`${w}-${i}`} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <motion.span variants={wordVariant} className={cn("inline-block", wordClassName)}>
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </MotionTag>
  );
}

/* -------------------------------- Marquee ---------------------------------- */

export type MarqueeProps = {
  children: React.ReactNode;
  className?: string;
  /** px of travel per second. */
  speed?: number;
  gap?: number;
  pauseOnHover?: boolean;
  reverse?: boolean;
};

/** Continuous horizontal loop (logo rows, ticker text). Driven by a raw
 *  animation-frame loop over a single transform (`x`), so pausing on hover
 *  never snaps back, it just stops advancing. Transform-only. */
export function Marquee({ children, className, speed = 40, gap = 48, pauseOnHover = true, reverse = false }: MarqueeProps) {
  const reduce = useReducedMotion();
  const trackRef = React.useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const pausedRef = React.useRef(false);
  const halfWidthRef = React.useRef(0);

  React.useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => {
      halfWidthRef.current = el.scrollWidth / 2;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useAnimationFrame((_, delta) => {
    if (reduce || pausedRef.current) return;
    const half = halfWidthRef.current;
    if (!half) return;
    const dir = reverse ? 1 : -1;
    let next = x.get() + dir * speed * (delta / 1000);
    if (dir < 0 && next <= -half) next += half;
    if (dir > 0 && next >= 0) next -= half;
    x.set(next);
  });

  if (reduce) {
    return (
      <div className={cn("flex overflow-x-auto", className)} style={{ gap }}>
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      onMouseEnter={() => {
        if (pauseOnHover) pausedRef.current = true;
      }}
      onMouseLeave={() => {
        if (pauseOnHover) pausedRef.current = false;
      }}
    >
      <motion.div ref={trackRef} className="flex w-max" style={{ gap, x }}>
        <div className="flex shrink-0 items-center" style={{ gap }}>
          {children}
        </div>
        <div className="flex shrink-0 items-center" style={{ gap }} aria-hidden>
          {children}
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------- StickyScene -------------------------------- */

export type StickySceneProps = {
  children: (progress: MotionValue<number>) => React.ReactNode;
  className?: string;
  /** Total scrollable height of the pinning track, e.g. "220vh". */
  height?: string | number;
};

/** A pinned scroll scene: the track scrolls for `height`, its content stays
 *  sticky at the top of the viewport, and children receive scroll progress
 *  (0..1) to drive their own transform/opacity. */
export function StickyScene({ children, className, height = "220vh" }: StickySceneProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  return (
    <div ref={ref} className={cn("relative", className)} style={{ height }}>
      <div className="sticky top-0 h-screen overflow-hidden">{children(scrollYProgress)}</div>
    </div>
  );
}

/* ------------------------------ PageTransition ------------------------------- */

export type PageTransitionProps = {
  children: React.ReactNode;
  className?: string;
};

/** Route-level fade + rise, keyed by pathname. Drop this once near the root
 *  of a layout/template so navigations cross-fade instead of hard-cutting. */
export function PageTransition({ children, className }: PageTransitionProps) {
  const reduce = useReducedMotion();
  const pathname = usePathname();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: DURATION.route, ease: EASE }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
