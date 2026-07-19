"use client";

import { useRef, useState } from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { cn } from "@/lib/utils";
import { Painting } from "./painting";
import { CountUp, DURATION, EASE, SPRING, STAGGER, TiltCard } from "./motion";
import { BreathingRings, LiveDot, OrbitDots, TravelingPacket } from "./illustration/packet";

/* ---------------------------------------------------------------------------
   Animated product-card mockups. Each is a small piece of UI-art that stands
   in the framed well beside a feature list, echoing the reference's stacked
   lists, fanned cards, monitor rows, and logo-tile grids.

   Every card tracks its own scroll progress through the viewport (useScroll
   on the card) and layers a scroll-linked "energy" transform on top of the
   entrance stagger, plus a tasteful ambient loop and a hover state. All
   scroll- and loop-driven motion touches only transform/opacity, and every
   effect collapses to a static, settled pose under reduced motion.
--------------------------------------------------------------------------- */

const CARD = "rounded-[26px] bg-[var(--site-card)] p-6 sm:p-8";

/** Tracks a card's full lifecycle through the viewport (from first entering
 *  the bottom edge to leaving the top edge), smoothed with a spring:
 *  `energy` rises 0->1 as the card arrives and settles, `recede` rises 0->1
 *  as the card later scrolls up and out, so scenes have a full arrive/settle/
 *  recede arc rather than snapping to a static pose once revealed. Both
 *  clamp to their resting value under reduced motion. Also returns `inView`,
 *  a plain viewport-visibility boolean (independent of the eased energy
 *  curve) that ambient/looping decorations use to fully pause their
 *  `repeat: Infinity` animations while the card is off-screen, a
 *  performance win, since otherwise every mounted card's packets/rings/
 *  floats would keep animating in the background for the whole page. */
function useCardEnergy(reduce: boolean | null) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const smooth = useSpring(scrollYProgress, SPRING.scroll);
  const energy = useTransform(smooth, [0.12, 0.42], reduce ? [1, 1] : [0, 1]);
  const recede = useTransform(smooth, [0.74, 0.98], reduce ? [0, 0] : [0, 1]);
  const inView = useInView(ref, { margin: "-10% 0px -10% 0px" });
  return { ref, energy, recede, inView };
}

/** A gentle scale that rises from `enterFrom` to 1 with `energy`, then eases
 *  down a few percent as `recede` rises, transform-only. */
function useSceneScale(energy: MotionValue<number>, recede: MotionValue<number>, reduce: boolean | null, enterFrom = 0.97) {
  return useTransform([energy, recede], (latest) => {
    const [e, r] = latest as number[];
    if (reduce) return 1;
    const enter = enterFrom + (1 - enterFrom) * e;
    return enter * (1 - r * 0.06);
  });
}

/** A subtle opacity dim (never full fade) as `recede` rises, so a card
 *  visibly recedes into the page rather than abruptly disappearing. */
function useSceneOpacity(recede: MotionValue<number>, reduce: boolean | null) {
  return useTransform(recede, [0, 1], reduce ? [1, 1] : [1, 0.85]);
}

/** Connect: a list of agent frameworks, one highlighted white and lifted. */
export function ConnectMock() {
  const reduce = useReducedMotion();
  const { ref, energy, recede, inView } = useCardEnergy(reduce);
  const settle = useSceneScale(energy, recede, reduce);
  const opacity = useSceneOpacity(recede, reduce);
  const rows = [
    { name: "Register agent", tone: "muted" },
    { name: "Issue token", tone: "muted" },
    { name: "Heartbeat online", tone: "soft" },
    { name: "Stream activity", tone: "active", glyph: "#8b5cf6" },
    { name: "Assign skills", tone: "soft" },
    { name: "Route work", tone: "muted" },
    { name: "Track output", tone: "faint" },
  ];
  return (
    <TiltCard>
      <div ref={ref} className={cn(CARD, "grid place-items-center")}>
        <motion.div style={{ scale: settle, opacity }} className="w-full max-w-[300px] space-y-2.5">
        {rows.map((r, i) => {
          const active = r.tone === "active";
          return (
            <motion.div
              key={r.name}
              initial={{ opacity: 0, x: reduce ? 0 : -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              whileHover={reduce ? undefined : { x: 3 }}
              transition={{ delay: reduce ? 0 : i * STAGGER.base, duration: reduce ? DURATION.reduced : DURATION.base, ease: EASE }}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] transition-shadow duration-300",
                active
                  ? "bg-white text-[var(--site-ink)] shadow-[0_10px_24px_rgba(31,31,28,0.10)]"
                  : r.tone === "soft"
                    ? "bg-white/55 text-[#6c6a64] hover:bg-white/75"
                    : r.tone === "faint"
                      ? "text-[#b4b1aa]"
                      : "text-[#8a8781] hover:text-[#6c6a64]",
              )}
            >
              <motion.span
                whileHover={reduce ? undefined : { scale: 1.08, transition: { duration: DURATION.instant } }}
                animate={active && !reduce && inView ? { scale: [1, 1.08, 1] } : undefined}
                transition={active && !reduce && inView ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" } : undefined}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white"
                style={{ background: active ? r.glyph : "#c9c6bf" }}
              >
                <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M2 6h8M6 2v8" strokeLinecap="round" />
                </svg>
              </motion.span>
              <span className={active ? "font-medium" : ""}>{r.name}</span>
              {active && <LiveDot color="#8b5cf6" active={inView} className="ml-auto h-1.5 w-1.5" />}
            </motion.div>
          );
        })}
        </motion.div>
      </div>
    </TiltCard>
  );
}

/** Orchestrate: fanned, skewed workflow-step cards that spread open as the
 *  card scrolls into view and fan wider still on hover, drifting in
 *  perspective. */
export function OrchestrateMock() {
  const reduce = useReducedMotion();
  const { ref, energy, recede, inView } = useCardEnergy(reduce);
  const opacity = useSceneOpacity(recede, reduce);
  const steps = [
    "Fetch context",
    "Draft outreach",
    "Run policy check",
    "Await approval",
    "Dispatch to agent",
  ];

  // The fan spreads further while the card is hovered, on top of the scroll
  // energy spread, springing back to the scroll-driven pose on leave.
  const hover = useMotionValue(0);
  const hoverSpring = useSpring(hover, SPRING.snappy);
  const onHoverStart = reduce ? undefined : () => hover.set(1);
  const onHoverEnd = reduce ? undefined : () => hover.set(0);

  // Fixed-count fan offsets driven by scroll energy (0 -> stacked, 1 ->
  // fanned) plus a hover boost. Unrolled rather than built inside `.map` so
  // hook call order stays static.
  const useFanX = (base: number, boost: number) =>
    useTransform([energy, hoverSpring], (latest) => {
      const [e, h] = latest as number[];
      return reduce ? base : e * base + h * boost;
    });
  const translateXs = [
    useFanX(0, 0),
    useFanX(14, 4),
    useFanX(28, 8),
    useFanX(42, 12),
    useFanX(56, 16),
  ];
  const rotateZ = useTransform([energy, hoverSpring], (latest) => {
    const [e, h] = latest as number[];
    if (reduce) return -24;
    return -6 + (-24 - -6) * e + h * -3;
  });

  return (
    <TiltCard>
      <div
        ref={ref}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
        className={cn(CARD, "relative min-h-[340px] overflow-hidden")}
      >
      <motion.div style={{ opacity, perspective: "900px" }} className="absolute left-8 right-0 top-10">
        {steps.map((s, i) => {
          const active = i === 2;
          return (
            <motion.div
              key={s}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              whileHover={reduce ? undefined : { y: -6 }}
              transition={{ delay: reduce ? 0 : i * STAGGER.loose, duration: reduce ? DURATION.reduced : DURATION.medium, ease: EASE }}
              style={{
                x: translateXs[i],
                rotateZ,
                rotateX: 32,
                transformOrigin: "left center",
              }}
              className={cn(
                "relative mb-3 flex items-center gap-3 rounded-2xl px-5 py-4 text-[15px]",
                active
                  ? "bg-white text-[var(--site-ink)] shadow-[0_14px_30px_rgba(31,31,28,0.12)]"
                  : "bg-white/50 text-[#7c7a74]",
              )}
            >
              {active && !reduce && inView && (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-2xl border border-[#1f1f1c]/15"
                  animate={{ opacity: [0.5, 0, 0.5], scale: [1, 1.025, 1] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                  active ? "bg-[#1f1f1c] text-white" : "border border-[#cdcac3] text-[#9a978f]",
                )}
              >
                {active ? "▸" : i + 1}
              </span>
              {s}
            </motion.div>
          );
        })}
      </motion.div>
      </div>
    </TiltCard>
  );
}

/** Govern: a monitoring list card with live status rows, a scroll-linked
 *  scanning sweep that travels down the stack as the card enters view, and a
 *  gentle recede as it scrolls past. */
export function GovernMock() {
  const reduce = useReducedMotion();
  const { ref, energy, recede, inView } = useCardEnergy(reduce);
  const opacity = useSceneOpacity(recede, reduce);
  const sweepY = useTransform(energy, [0, 1], reduce ? [220, 220] : [-20, 220]);
  const sweepOpacity = useTransform(energy, [0, 0.08, 0.85, 1], reduce ? [0, 0, 0, 0] : [0, 0.5, 0.5, 0]);
  const rows = [
    { label: "Kill switch", state: "armed" },
    { label: "Budget guard", pct: 82, active: true },
    { label: "Shadow mode", state: "proposing" },
    { label: "Audit chain", state: "verified" },
    { label: "Runaway watch", state: "0 flags" },
  ];
  return (
    <TiltCard>
      <div ref={ref} className={cn(CARD, "relative grid place-items-center overflow-hidden")}>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 h-10 rounded-full bg-white"
        style={{ y: sweepY, opacity: sweepOpacity }}
      />
      <motion.div style={{ opacity }} className="relative w-full max-w-[320px] space-y-2">
        {rows.map((r, i) => (
          <motion.div
            key={r.label}
            initial={{ opacity: 0, y: reduce ? 0 : 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            whileHover={reduce ? undefined : { scale: 1.015 }}
            transition={{ delay: reduce ? 0 : i * STAGGER.base, duration: reduce ? DURATION.reduced : DURATION.base, ease: EASE }}
            className={cn(
              "relative overflow-hidden rounded-xl px-4 py-3 text-[14px] transition-shadow duration-300",
              r.active
                ? "bg-white text-[var(--site-ink)] shadow-[0_10px_24px_rgba(31,31,28,0.10)]"
                : "bg-white/55 text-[#6c6a64] hover:bg-white/75",
            )}
          >
            <span className="flex items-center justify-between">
              <span className="flex items-center gap-2.5 text-[var(--site-ink)]">
                <LiveDot color="#10b981" delay={i * 0.3} active={inView} />
                <span className={r.active ? "font-medium" : ""}>{r.label}</span>
              </span>
              {r.pct !== undefined ? (
                <CountUp value={r.pct} suffix="% of cap" duration={1.2} className="text-[13px] tabular-nums text-[#8a8781]" />
              ) : (
                <span className="text-[13px] text-[#8a8781]">{r.state}</span>
              )}
            </span>
            {r.active && (
              <span aria-hidden className="pointer-events-none absolute inset-x-4 bottom-1.5 block h-[3px] overflow-hidden rounded-full bg-[#1f1f1c]/8">
                <motion.span
                  className="block h-full rounded-full bg-[#d97706]"
                  style={{ width: "82%" }}
                  animate={reduce || !inView ? undefined : { opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                />
              </span>
            )}
          </motion.div>
        ))}
      </motion.div>
      </div>
    </TiltCard>
  );
}

/** Integrate: a grid of partner logo tiles (placeholder wordmarks) with a
 *  gentle scroll-linked settle, a periodic shimmer sweep, and a recede as the
 *  card scrolls past. */
export function IntegrateMock() {
  const reduce = useReducedMotion();
  const { ref, energy, recede, inView } = useCardEnergy(reduce);
  const opacity = useSceneOpacity(recede, reduce);
  const tilt = useTransform([energy, recede], (latest) => {
    const [e, r] = latest as number[];
    if (reduce) return 0;
    return -1.5 + 1.5 * e + r * 0.6;
  });
  // Each grid row settles in from a slightly different depth (row 0 nearest,
  // row 2 furthest) so the 3x3 tile grid reads as layered rather than flat,
  // unrolled to three explicit transforms to keep hook order static.
  const rowParallax = [
    useTransform(energy, [0, 1], reduce ? [0, 0] : [12, 0]),
    useTransform(energy, [0, 1], reduce ? [0, 0] : [20, 0]),
    useTransform(energy, [0, 1], reduce ? [0, 0] : [30, 0]),
  ];
  const tiles = ["Slack", "Telegram", "Discord", "Composio", "MCP", "OpenAI", "Convex", "Clerk", "Webhook"];
  return (
    <TiltCard>
      <div ref={ref} className={cn(CARD, "relative overflow-hidden !p-4")}>
      {!reduce && inView && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 z-10 w-20 -skew-x-12 bg-white/35"
          animate={{ x: ["-15%", "480%"] }}
          transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 3.4, ease: "easeInOut" }}
        />
      )}
      <motion.div style={{ rotateZ: tilt, opacity }} className="grid grid-cols-3 gap-2.5">
        {tiles.map((t, i) => {
          const active = t === "MCP";
          const row = Math.floor(i / 3);
          return (
            <motion.div key={t} style={{ y: rowParallax[row] }}>
              <motion.div
                initial={{ opacity: 0, scale: reduce ? 1 : 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                whileHover={reduce ? undefined : { scale: 1.05, y: -2 }}
                transition={{ delay: reduce ? 0 : i * STAGGER.tight, duration: reduce ? DURATION.reduced : DURATION.base, ease: EASE }}
                className={cn(
                  "relative grid aspect-[3/2] place-items-center rounded-xl text-[14px] font-medium transition-shadow duration-300",
                  active
                    ? "bg-white text-[var(--site-ink)] shadow-[0_10px_24px_rgba(31,31,28,0.10)]"
                    : "bg-white/45 text-[#8a8781] hover:bg-white/65",
                )}
              >
                {active && !reduce && inView && (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-xl border border-[#8b5cf6]/40"
                    animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.06, 1] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
                {t}
              </motion.div>
            </motion.div>
          );
        })}
      </motion.div>
      </div>
    </TiltCard>
  );
}

/** Real-time: a single held connection pushes events down a dashed feed line
 *  (an ambient traveling packet, "the socket is always open"), landing in a
 *  row list where the active row's queue visibly drains and its latency
 *  counts up as the card's scroll energy rises, then everything recedes
 *  gently as the card scrolls past. */
export function RealtimeMock() {
  const reduce = useReducedMotion();
  const { ref, energy, recede, inView } = useCardEnergy(reduce);
  const sceneOpacity = useSceneOpacity(recede, reduce);
  const trackOpacity = useTransform([energy, recede], (latest) => {
    const [e, r] = latest as number[];
    if (reduce) return 1;
    return (0.25 + 0.75 * e) * (1 - r * 0.15);
  });
  const drainWidth = useTransform(energy, [0, 1], reduce ? ["14%", "14%"] : ["94%", "14%"]);
  const rows = [
    { label: "Work pushed", meta: "~1s" },
    { label: "Burst drain", active: true },
    { label: "Idle backoff", meta: "auto" },
    { label: "Token stream", meta: "live" },
    { label: "Heartbeat", meta: "ok" },
  ];
  return (
    <TiltCard>
      <div ref={ref} className={cn(CARD, "grid place-items-center")}>
      <motion.div style={{ opacity: sceneOpacity }} className="w-full max-w-[300px]">
        <motion.div
          style={{ opacity: trackOpacity }}
          className="relative mb-4 overflow-hidden rounded-xl bg-white/55 px-3.5 py-3"
        >
          <div className="flex items-center gap-2.5 text-[13px] text-[var(--site-ink)]">
            <LiveDot color="#8b5cf6" active={inView} />
            <span className="font-medium">Held connection</span>
            <span className="ml-auto text-[11.5px] text-[#a3a09a]">1 socket, always open</span>
          </div>
          <div className="relative mt-2.5 h-px w-full border-t border-dashed border-[#1f1f1c]/15">
            <TravelingPacket
              axis="x"
              distance={236}
              duration={1.7}
              delay={0.2}
              repeatDelay={0.45}
              color="#8b5cf6"
              size={5}
              active={inView}
              style={{ left: 0, top: -3 }}
            />
          </div>
        </motion.div>
        <div className="space-y-2.5">
          {rows.map((r, i) => {
            const active = r.active;
            return (
              <motion.div
                key={r.label}
                initial={{ opacity: 0, x: reduce ? 0 : -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                whileHover={reduce ? undefined : { x: 3 }}
                transition={{ delay: reduce ? 0 : 0.15 + i * STAGGER.base, duration: reduce ? DURATION.reduced : DURATION.base, ease: EASE }}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] transition-shadow duration-300",
                  active
                    ? "bg-white text-[var(--site-ink)] shadow-[0_10px_24px_rgba(31,31,28,0.10)]"
                    : "bg-white/55 text-[#6c6a64] hover:bg-white/75",
                )}
              >
                <LiveDot color="#8b5cf6" delay={i * 0.3} active={inView} />
                <span className={active ? "font-medium" : ""}>{r.label}</span>
                {active ? (
                  <span className="ml-auto flex items-center gap-2">
                    <span className="relative h-1 w-12 overflow-hidden rounded-full bg-[#1f1f1c]/8">
                      <motion.span className="block h-full rounded-full bg-[#8b5cf6]" style={{ width: drainWidth }} />
                    </span>
                    <CountUp value={250} suffix="ms" duration={1.1} className="text-[12.5px] tabular-nums text-[#a3a09a]" />
                  </span>
                ) : (
                  <span className="ml-auto text-[12.5px] text-[#a3a09a]">{r.meta}</span>
                )}
              </motion.div>
            );
          })}
        </div>
      </motion.div>
      </div>
    </TiltCard>
  );
}

/** Skills and memory: vector-searched skill chips (the retrieved chip pulses
 *  with a soft ring) feeding a relevance meter that fills with scroll energy
 *  and a match count that counts up once grounded, receding gently as the
 *  card scrolls past. */
export function SkillsMock() {
  const reduce = useReducedMotion();
  const { ref, energy, recede, inView } = useCardEnergy(reduce);
  const opacity = useSceneOpacity(recede, reduce);
  const meterWidth = useTransform(energy, [0, 1], reduce ? ["88%", "88%"] : ["10%", "88%"]);
  const chips = ["Refunds policy", "Escalation path", "Pricing table", "Tone guide", "Space memory"];
  const activeIndex = 2;
  return (
    <TiltCard>
      <div ref={ref} className={cn(CARD, "relative min-h-[300px] overflow-hidden")}>
      <motion.div style={{ opacity }} className="flex flex-wrap gap-2">
        {chips.map((c, i) => {
          const active = i === activeIndex;
          return (
            <motion.span
              key={c}
              initial={{ opacity: 0, y: reduce ? 0 : 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              whileHover={reduce ? undefined : { scale: 1.05, y: -2 }}
              transition={{ delay: reduce ? 0 : i * STAGGER.base, duration: reduce ? DURATION.reduced : DURATION.base, ease: EASE }}
              className={cn(
                "relative rounded-full px-3.5 py-2 text-[13.5px] transition-shadow duration-300",
                active
                  ? "bg-white font-medium text-[var(--site-ink)] shadow-[0_10px_24px_rgba(31,31,28,0.10)]"
                  : "bg-white/55 text-[#6c6a64] hover:bg-white/75",
              )}
            >
              {active && !reduce && inView && (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-full border border-[#8b5cf6]/40"
                  animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.07, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
              {c}
            </motion.span>
          );
        })}
      </motion.div>
      <motion.div style={{ opacity }} className="relative mt-6 space-y-2.5">
        <motion.div
          initial={{ opacity: 0, x: reduce ? 0 : -10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: reduce ? 0 : 0.4, duration: reduce ? DURATION.reduced : DURATION.base, ease: EASE }}
          className="flex items-center gap-2.5 rounded-xl bg-white/55 px-3.5 py-2.5 text-[13.5px] text-[#6c6a64]"
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-[#8b5cf6]" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M2 6h8M6 2v8" strokeLinecap="round" />
          </svg>
          <span>Vector search:</span>
          <CountUp value={3} suffix=" matches" duration={1} className="font-medium text-[var(--site-ink)]" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: reduce ? 0 : -10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          whileHover={reduce ? undefined : { scale: 1.015 }}
          transition={{ delay: reduce ? 0 : 0.5, duration: reduce ? DURATION.reduced : DURATION.base, ease: EASE }}
          className="relative overflow-hidden rounded-xl bg-white px-3.5 py-3 text-[13.5px] font-medium text-[var(--site-ink)] shadow-[0_10px_24px_rgba(31,31,28,0.10)]"
        >
          <span className="flex items-center gap-2.5">
            <LiveDot color="#10b981" active={inView} />
            Grounded response ready
          </span>
          <span aria-hidden className="pointer-events-none absolute inset-x-4 bottom-1.5 block h-[3px] overflow-hidden rounded-full bg-[#1f1f1c]/8">
            <motion.span className="block h-full rounded-full bg-[#8b5cf6]" style={{ width: meterWidth }} />
          </span>
        </motion.div>
      </motion.div>
      </div>
    </TiltCard>
  );
}

/** The four concepts orbiting the control plane, each with a fixed accent
 *  used consistently for its pill dot, connector tint, and packet color so
 *  the whole diagram reads as one coherent, color-coded system. */
const CONTROL_NODES = {
  decide: { label: "Decide", color: "#d97706" },
  connect: { label: "Connect", color: "#8b5cf6" },
  lifecycle: { label: "Lifecycle", color: "#0ea5e9" },
  data: { label: "Data platform", color: "#10b981" },
} as const;

/** Per-pill depth: which axis it settles along as the diagram arrives (a
 *  literal parallax entrance, each pill drifting in from its own distance)
 *  and the amplitude/timing of its own idle float once settled, so the four
 *  pills read as sitting at slightly different depths around the center
 *  rather than moving in lockstep with the shared whole-diagram float. */
const PILL_DEPTH: Record<keyof typeof CONTROL_NODES, { axis: "x" | "y"; enter: number; floatAmp: number; floatDuration: number; floatDelay: number }> = {
  decide: { axis: "y", enter: -26, floatAmp: 4, floatDuration: 8.5, floatDelay: 0 },
  data: { axis: "y", enter: 26, floatAmp: 4, floatDuration: 9.5, floatDelay: 0.6 },
  connect: { axis: "x", enter: -20, floatAmp: 3, floatDuration: 7.5, floatDelay: 1.1 },
  lifecycle: { axis: "x", enter: 20, floatAmp: 3, floatDuration: 8, floatDelay: 1.6 },
};

/** The control-plane diagram: painted center blob + four color-coded pills,
 *  with connector opacity ramping in on scroll, round-trip packets travelling
 *  each connector, a slow ring of dots orbiting the center (speeding up while
 *  the diagram is hovered), and a gentle whole-diagram float, all as an
 *  ambient "the system is live" loop, receding softly once scrolled past. */
export function ControlPlaneDiagram() {
  const reduce = useReducedMotion();
  const { ref, energy, recede, inView } = useCardEnergy(reduce);
  const lineOpacity = useTransform(energy, [0, 1], reduce ? [1, 1] : [0.15, 1]);
  const sceneOpacity = useSceneOpacity(recede, reduce);
  const [hovered, setHovered] = useState(false);

  const packetDuration = 2.6;
  const packetRepeatDelay = 0.7;
  const arrive = packetDuration / 2; // pingpong packets reach the pill halfway through the cycle

  const Pill = ({ node, delay }: { node: keyof typeof CONTROL_NODES; delay: number }) => {
    const { label, color } = CONTROL_NODES[node];
    const depth = PILL_DEPTH[node];
    // Entrance parallax: each pill settles in from its own depth/axis as the
    // diagram's scroll energy rises, rather than all four appearing in place.
    const enter = useTransform(energy, [0, 1], reduce ? [0, 0] : [depth.enter, 0]);
    const enterStyle = depth.axis === "y" ? { y: enter } : { x: enter };
    // Idle float: a slow, small loop layered underneath, amplitude/timing
    // unique per pill so the four visibly move at different depths at rest.
    // Paused (not just reduced) whenever the diagram is scrolled off-screen.
    const floatAnimate =
      reduce || !inView
        ? undefined
        : depth.axis === "y"
          ? { y: [0, -depth.floatAmp, depth.floatAmp, 0] }
          : { x: [0, depth.floatAmp, -depth.floatAmp, 0] };
    return (
      <motion.div style={enterStyle}>
        <motion.div
          animate={floatAnimate}
          transition={
            reduce || !inView
              ? undefined
              : { duration: depth.floatDuration, repeat: Infinity, ease: "easeInOut", delay: depth.floatDelay }
          }
        >
          <motion.span
            whileHover={reduce ? undefined : { scale: 1.06, y: -3 }}
            transition={{ duration: DURATION.instant, ease: EASE }}
            className="inline-flex items-center gap-2 rounded-full bg-[#e9e7e1] px-5 py-2.5 text-[15px] font-medium text-[var(--site-ink)] transition-colors duration-300 hover:bg-[#f0eee8]"
          >
            <LiveDot color={color} delay={delay} active={inView} className="h-1.5 w-1.5" />
            {label}
          </motion.span>
        </motion.div>
      </motion.div>
    );
  };

  return (
    <div
      ref={ref}
      onMouseEnter={reduce ? undefined : () => setHovered(true)}
      onMouseLeave={reduce ? undefined : () => setHovered(false)}
      className="relative mx-auto max-w-[820px] py-6"
    >
      <motion.div
        animate={reduce || !inView ? undefined : { y: [0, -5, 0] }}
        transition={reduce || !inView ? undefined : { duration: 7, repeat: Infinity, ease: "easeInOut" }}
        style={{ opacity: sceneOpacity }}
        className="relative grid grid-cols-3 grid-rows-3 place-items-center gap-y-6"
      >
        {/* connectors, each tinted to match the pill/packet it feeds */}
        <motion.svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ opacity: lineOpacity }} aria-hidden>
          <g strokeWidth="1.2" strokeDasharray="3 4">
            <line x1="50%" y1="24%" x2="50%" y2="42%" stroke={CONTROL_NODES.decide.color} strokeOpacity={0.35} />
            <line x1="50%" y1="58%" x2="50%" y2="76%" stroke={CONTROL_NODES.data.color} strokeOpacity={0.35} />
            <line x1="26%" y1="50%" x2="40%" y2="50%" stroke={CONTROL_NODES.connect.color} strokeOpacity={0.35} />
            <line x1="60%" y1="50%" x2="74%" y2="50%" stroke={CONTROL_NODES.lifecycle.color} strokeOpacity={0.35} />
          </g>
        </motion.svg>

        {/* round-trip packets along each connector, transform + opacity only */}
        <TravelingPacket
          axis="y" distance={-58} duration={packetDuration} delay={0} repeatDelay={packetRepeatDelay}
          pingpong color={CONTROL_NODES.decide.color} active={inView} style={{ left: "50%", top: "42%", marginLeft: -3 }}
        />
        <TravelingPacket
          axis="y" distance={58} duration={packetDuration} delay={0.6} repeatDelay={packetRepeatDelay}
          pingpong color={CONTROL_NODES.data.color} active={inView} style={{ left: "50%", top: "58%", marginLeft: -3 }}
        />
        <TravelingPacket
          axis="x" distance={54} duration={packetDuration} delay={0.3} repeatDelay={packetRepeatDelay}
          pingpong color={CONTROL_NODES.connect.color} active={inView} style={{ left: "26%", top: "50%", marginTop: -3 }}
        />
        <TravelingPacket
          axis="x" distance={-54} duration={packetDuration} delay={0.9} repeatDelay={packetRepeatDelay}
          pingpong color={CONTROL_NODES.lifecycle.color} active={inView} style={{ left: "74%", top: "50%", marginTop: -3 }}
        />

        <div />
        <div className="col-start-2 row-start-1"><Pill node="decide" delay={0 + arrive} /></div>
        <div />
        <div className="col-start-1 row-start-2"><Pill node="connect" delay={0.3 + arrive} /></div>
        {/* center */}
        <div className="col-start-2 row-start-2">
          <motion.div
            initial={{ scale: reduce ? 1 : 0.9, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            whileHover={reduce ? undefined : { scale: 1.035 }}
            transition={reduce ? { duration: DURATION.reduced, ease: EASE } : { type: "spring", ...SPRING.snappy }}
            className="relative grid place-items-center transition-shadow duration-500"
          >
            <BreathingRings count={4} baseSize={276} step={15} color="#dcd9d2" duration={hovered ? 1.8 : 3} active={inView} className="rounded-[999px]" />
            <OrbitDots
              colors={[CONTROL_NODES.decide.color, CONTROL_NODES.connect.color, CONTROL_NODES.lifecycle.color, CONTROL_NODES.data.color]}
              radius={172}
              duration={hovered ? 10 : 26}
              active={inView}
            />
            <motion.div
              animate={reduce || !inView ? undefined : { scale: [1, 1.015, 1] }}
              transition={reduce || !inView ? undefined : { duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <Painting scene="dusk" className="grid h-[104px] w-[268px] place-items-center rounded-[999px]">
                <span className="relative text-[21px] font-semibold text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.35)]">
                  Control Plane
                </span>
              </Painting>
            </motion.div>
          </motion.div>
        </div>
        <div className="col-start-3 row-start-2"><Pill node="lifecycle" delay={0.9 + arrive} /></div>
        <div />
        <div className="col-start-2 row-start-3"><Pill node="data" delay={0.6 + arrive} /></div>
        <div />
      </motion.div>
    </div>
  );
}
