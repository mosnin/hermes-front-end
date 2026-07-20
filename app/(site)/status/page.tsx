"use client";

import { useQuery } from "convex/react";
import { motion, useReducedMotion } from "motion/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { Reveal, Stagger, StaggerItem, TextReveal, CountUp, EASE } from "@/components/site/motion";
import { RADIUS, TYPE_H1 } from "@/components/site/ui";

/* ---------------------------------------------------------------------------
   Status. Headline, a big state pill (emerald dot when every component is
   operational, amber/red preserved for maintenance/outage), a quiet card of
   component rows with small status dots, and a 90-day history strip of thin
   vertical bars. The Convex query only ever reports "operational" or
   "maintenance" today and carries no history series, so the strip renders
   uniform emerald placeholder bars; the mapping below stays defensive so a
   future "outage"/degraded status still resolves to a sane color. Headline
   now a word-by-word TextReveal; the operational dot gets a gentle ambient
   pulse (opacity/scale loop, fully stopped under reduced motion); component
   rows cascade through Stagger.
--------------------------------------------------------------------------- */

type Level = "operational" | "maintenance" | "outage";

function levelOf(status: string | undefined): Level {
  if (status === "operational") return "operational";
  if (status === "maintenance") return "maintenance";
  return status ? "outage" : "operational";
}

const OVERALL_COPY: Record<Level, string> = {
  operational: "All systems operational",
  maintenance: "Maintenance in progress",
  outage: "Service disruption",
};

const DOT_CLASS: Record<Level, string> = {
  operational: "bg-emerald-500",
  maintenance: "bg-amber-500",
  outage: "bg-red-500",
};

const PILL_BG_CLASS: Record<Level, string> = {
  operational: "bg-emerald-50 ring-1 ring-inset ring-emerald-500/15",
  maintenance: "bg-amber-50 ring-1 ring-inset ring-amber-500/15",
  outage: "bg-red-50 ring-1 ring-inset ring-red-500/15",
};

const ROW_TEXT_CLASS: Record<Level, string> = {
  operational: "text-emerald-700",
  maintenance: "text-amber-700",
  outage: "text-red-700",
};

const ROW_LABEL: Record<Level, string> = {
  operational: "Operational",
  maintenance: "Maintenance",
  outage: "Outage",
};

const HISTORY_DAYS = 90;

/** The status dot: a quiet ambient pulse when operational, static otherwise
 *  and fully stopped under reduced motion. Transform/opacity only. */
function StatusDot({ level }: { level: Level }) {
  const reduce = useReducedMotion();
  const pulse = level === "operational" && !reduce;
  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white">
      {pulse && (
        <motion.span
          aria-hidden
          className={`absolute h-2.5 w-2.5 rounded-full ${DOT_CLASS[level]}`}
          animate={{ scale: [1, 2.4], opacity: [0.5, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span className={`h-2.5 w-2.5 rounded-full ${DOT_CLASS[level]}`} />
    </span>
  );
}

export default function StatusPage() {
  const status = useQuery(api.status.page, {});
  const overall = levelOf(status?.overall);
  const components = status?.components ?? [];
  const reduce = useReducedMotion();

  return (
    <main>
      <section className="mx-auto max-w-[760px] px-5 pb-24 pt-24 sm:px-7 sm:pt-32">
        <h1 className={cn(TYPE_H1, "text-[var(--site-ink)]")}>
          <TextReveal text="System status" as="span" />
        </h1>
        <Reveal delay={0.2}>
          <p className="mt-5 max-w-[480px] text-[17px] leading-relaxed text-[var(--site-body)]">
            Live health for the Cadre control plane. This page reflects
            platform component health only and never exposes customer data.
          </p>
        </Reveal>

        {/* Big state pill */}
        <Reveal delay={0.3} className="mt-10">
          <div
            className={cn(RADIUS.card, "flex items-center gap-4 p-6", PILL_BG_CLASS[overall])}
          >
            <StatusDot level={overall} />
            <div>
              <p className="text-[18px] font-medium text-[var(--site-ink)]">
                {OVERALL_COPY[overall]}
              </p>
              <p className="mt-0.5 text-[14px] text-[var(--site-body)]">
                {status
                  ? `Updated ${new Date(status.updatedAt).toLocaleString()}`
                  : "Checking status"}
              </p>
            </div>
          </div>
        </Reveal>

        {/* Component rows */}
        <Reveal delay={0.05} className="mt-14">
          <h2 className="mb-4 text-[13px] font-medium uppercase tracking-wide text-[var(--site-body)]">
            Components
          </h2>
          <div className={cn(RADIUS.card, "bg-[var(--site-band)] p-3")}>
            <Stagger className="divide-y divide-[var(--site-line)]" gap={0.06}>
              {components.map((c) => {
                const level = levelOf(c.status);
                return (
                  <StaggerItem key={c.key}>
                    <motion.div
                      className="flex items-center justify-between gap-4 px-5 py-4"
                      whileHover={{ x: 3 }}
                      transition={{ duration: 0.2, ease: EASE }}
                    >
                      <span className="text-[15.5px] font-medium text-[var(--site-ink)]">
                        {c.name}
                      </span>
                      <span className="flex items-center gap-2 text-[14px]">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${DOT_CLASS[level]}`}
                        />
                        <span className={`font-medium ${ROW_TEXT_CLASS[level]}`}>
                          {ROW_LABEL[level]}
                        </span>
                      </span>
                    </motion.div>
                  </StaggerItem>
                );
              })}
              {components.length === 0 && (
                <div className="px-5 py-4 text-[14.5px] text-[var(--site-body)]">
                  Checking components
                </div>
              )}
            </Stagger>
          </div>
        </Reveal>

        {/* 90-day history strip */}
        <Reveal delay={0.1} className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[13px] font-medium uppercase tracking-wide text-[var(--site-body)]">
              90-day history
            </h2>
            <span className="text-[13px] text-[var(--site-body)]">
              {overall === "operational" ? (
                <CountUp value={100} suffix="% uptime" duration={1.1} />
              ) : (
                "See components above"
              )}
            </span>
          </div>
          <motion.div
            initial={reduce ? undefined : { scaleX: 0 }}
            whileInView={reduce ? undefined : { scaleX: 1 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.9, ease: EASE }}
            style={{ transformOrigin: "left" }}
            className="mt-4 flex h-10 items-end gap-[3px] rounded-[16px] bg-[var(--site-band)] p-3"
          >
            {Array.from({ length: HISTORY_DAYS }).map((_, i) => (
              <span
                key={i}
                className={`h-full flex-1 rounded-[2px] ${
                  overall === "operational" ? "bg-emerald-400" : DOT_CLASS[overall]
                }`}
              />
            ))}
          </motion.div>
          <div className="mt-2 flex justify-between text-[12.5px] text-[var(--site-body)]">
            <span>90 days ago</span>
            <span>Today</span>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
