"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { Painting } from "./painting";

/* ---------------------------------------------------------------------------
   Animated product-card mockups. Each is a small piece of UI-art that stands
   in the framed well beside a feature list, echoing the reference's stacked
   lists, fanned cards, monitor rows, and logo-tile grids.
--------------------------------------------------------------------------- */

const CARD = "rounded-[26px] bg-[var(--site-card)] p-6 sm:p-8";

/** Connect: a list of agent frameworks, one highlighted white and lifted. */
export function ConnectMock() {
  const reduce = useReducedMotion();
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
    <div className={cn(CARD, "grid place-items-center")}>
      <div className="w-full max-w-[300px] space-y-2.5">
        {rows.map((r, i) => {
          const active = r.tone === "active";
          return (
            <motion.div
              key={r.name}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: reduce ? 0 : i * 0.07, duration: 0.4 }}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px]",
                active
                  ? "bg-white text-[var(--site-ink)] shadow-[0_10px_24px_rgba(31,31,28,0.10)]"
                  : r.tone === "soft"
                    ? "bg-white/55 text-[#6c6a64]"
                    : r.tone === "faint"
                      ? "text-[#b4b1aa]"
                      : "text-[#8a8781]",
              )}
            >
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white"
                style={{ background: active ? r.glyph : "#c9c6bf" }}
              >
                <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M2 6h8M6 2v8" strokeLinecap="round" />
                </svg>
              </span>
              <span className={active ? "font-medium" : ""}>{r.name}</span>
              {active && !reduce && (
                <motion.span
                  className="ml-auto h-1.5 w-1.5 rounded-full bg-[#8b5cf6]"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                />
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/** Orchestrate: fanned, skewed workflow-step cards drifting in perspective. */
export function OrchestrateMock() {
  const reduce = useReducedMotion();
  const steps = [
    "Fetch context",
    "Draft outreach",
    "Run policy check",
    "Await approval",
    "Dispatch to agent",
  ];
  return (
    <div className={cn(CARD, "relative min-h-[340px] overflow-hidden")}>
      <div
        className="absolute left-8 right-0 top-10"
        style={{ perspective: "900px" }}
      >
        {steps.map((s, i) => {
          const active = i === 2;
          return (
            <motion.div
              key={s}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: reduce ? 0 : i * 0.1, duration: 0.5 }}
              className={cn(
                "mb-3 flex items-center gap-3 rounded-2xl px-5 py-4 text-[15px]",
                active
                  ? "bg-white text-[var(--site-ink)] shadow-[0_14px_30px_rgba(31,31,28,0.12)]"
                  : "bg-white/50 text-[#7c7a74]",
              )}
              style={{
                transform: `rotateX(32deg) rotateZ(-24deg) translateX(${i * 14}px)`,
                transformOrigin: "left center",
              }}
            >
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
      </div>
    </div>
  );
}

/** Govern: a monitoring list card with live status rows. */
export function GovernMock() {
  const reduce = useReducedMotion();
  const rows = [
    { label: "Kill switch", state: "armed", ok: true },
    { label: "Budget guard", state: "82% of cap", ok: true },
    { label: "Shadow mode", state: "proposing", ok: true },
    { label: "Audit chain", state: "verified", ok: true },
    { label: "Runaway watch", state: "0 flags", ok: true },
  ];
  return (
    <div className={cn(CARD, "grid place-items-center")}>
      <div className="w-full max-w-[320px] space-y-2">
        {rows.map((r, i) => (
          <motion.div
            key={r.label}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: reduce ? 0 : i * 0.08 }}
            className="flex items-center justify-between rounded-xl bg-white/65 px-4 py-3 text-[14px]"
          >
            <span className="flex items-center gap-2.5 text-[var(--site-ink)]">
              <span className="relative flex h-2 w-2">
                {!reduce && (
                  <motion.span
                    className="absolute inline-flex h-full w-full rounded-full bg-emerald-500"
                    animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
                    transition={{ duration: 1.9, repeat: Infinity, delay: i * 0.3 }}
                  />
                )}
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {r.label}
            </span>
            <span className="text-[13px] text-[#8a8781]">{r.state}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** Integrate: a grid of partner logo tiles (placeholder wordmarks). */
export function IntegrateMock() {
  const reduce = useReducedMotion();
  const tiles = ["Slack", "Telegram", "Discord", "Composio", "MCP", "OpenAI", "Convex", "Clerk", "Webhook"];
  return (
    <div className={cn(CARD, "!p-3")}>
      <div className="grid grid-cols-3 overflow-hidden rounded-2xl">
        {tiles.map((t, i) => (
          <motion.div
            key={t}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: reduce ? 0 : i * 0.06 }}
            className="grid aspect-[3/2] place-items-center border border-white/60 bg-white/40 text-[14px] font-medium text-[#8a8781]"
          >
            {t}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** The control-plane diagram: painted center blob + four connected pills. */
export function ControlPlaneDiagram() {
  const reduce = useReducedMotion();
  const pills = [
    { label: "Connect", pos: "left" },
    { label: "Decide", pos: "top" },
    { label: "Lifecycle", pos: "right" },
    { label: "Data platform", pos: "bottom" },
  ];
  const Pill = ({ label }: { label: string }) => (
    <span className="rounded-full bg-[#e9e7e1] px-5 py-2.5 text-[15px] font-medium text-[var(--site-ink)]">
      {label}
    </span>
  );
  return (
    <div className="relative mx-auto grid max-w-[820px] grid-cols-3 grid-rows-3 place-items-center gap-y-6 py-6">
      {/* connectors */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <g stroke="#cdcac3" strokeWidth="1.2" strokeDasharray="3 4">
          <line x1="50%" y1="24%" x2="50%" y2="42%" />
          <line x1="50%" y1="58%" x2="50%" y2="76%" />
          <line x1="26%" y1="50%" x2="40%" y2="50%" />
          <line x1="60%" y1="50%" x2="74%" y2="50%" />
        </g>
      </svg>
      <div />
      <div className="col-start-2 row-start-1"><Pill label="Decide" /></div>
      <div />
      <div className="col-start-1 row-start-2"><Pill label="Connect" /></div>
      {/* center */}
      <div className="col-start-2 row-start-2">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 200, damping: 22 }}
          className="relative grid place-items-center"
        >
          {[0, 1, 2].map((r) => (
            <motion.span
              key={r}
              className="absolute rounded-[999px] border border-[#dcd9d2]"
              style={{ width: 220 + r * 26, height: 128 + r * 26 }}
              animate={reduce ? {} : { opacity: [0.6, 0.2, 0.6] }}
              transition={{ duration: 3, repeat: Infinity, delay: r * 0.4 }}
            />
          ))}
          <Painting scene="dusk" className="grid h-[120px] w-[210px] place-items-center rounded-[999px]">
            <span className="relative text-[24px] font-semibold text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.35)]">
              Control Plane
            </span>
          </Painting>
        </motion.div>
      </div>
      <div className="col-start-3 row-start-2"><Pill label="Lifecycle" /></div>
      <div />
      <div className="col-start-2 row-start-3"><Pill label="Data platform" /></div>
      <div />
      {/* keep pills array referenced for lint */}
      <span className="hidden">{pills.length}</span>
    </div>
  );
}
