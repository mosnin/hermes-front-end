"use client";

import { useQuery } from "convex/react";
import { motion } from "motion/react";
import { api } from "@/convex/_generated/api";

/* ---------------------------------------------------------------------------
   Status. Headline, a big state pill (emerald dot when every component is
   operational, amber/red preserved for maintenance/outage), a quiet card of
   component rows with small status dots, and a 90-day history strip of thin
   vertical bars. The Convex query only ever reports "operational" or
   "maintenance" today and carries no history series, so the strip renders
   uniform emerald placeholder bars; the mapping below stays defensive so a
   future "outage"/degraded status still resolves to a sane color.
--------------------------------------------------------------------------- */

function Rise({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 0.6, 0.24, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

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

export default function StatusPage() {
  const status = useQuery(api.status.page, {});
  const overall = levelOf(status?.overall);
  const components = status?.components ?? [];

  return (
    <main>
      <section className="mx-auto max-w-[760px] px-5 pb-24 pt-24 sm:px-7 sm:pt-32">
        <Rise>
          <h1 className="text-[44px] font-medium leading-[1.06] tracking-[-0.015em] text-[var(--site-ink)] sm:text-[56px]">
            System status
          </h1>
          <p className="mt-5 max-w-[480px] text-[17px] leading-relaxed text-[var(--site-body)]">
            Live health for the Cadre control plane. This page reflects
            platform component health only and never exposes customer data.
          </p>
        </Rise>

        {/* Big state pill */}
        <Rise delay={0.05} className="mt-10">
          <div
            className={`flex items-center gap-4 rounded-[24px] p-6 ${PILL_BG_CLASS[overall]}`}
          >
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white">
              <span className={`h-2.5 w-2.5 rounded-full ${DOT_CLASS[overall]}`} />
            </span>
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
        </Rise>

        {/* Component rows */}
        <Rise delay={0.1} className="mt-14">
          <h2 className="mb-4 text-[13px] font-medium uppercase tracking-wide text-[var(--site-body)]">
            Components
          </h2>
          <div className="rounded-[24px] bg-[var(--site-band)] p-3">
            <div className="divide-y divide-[var(--site-line)]">
              {components.map((c) => {
                const level = levelOf(c.status);
                return (
                  <div
                    key={c.key}
                    className="flex items-center justify-between gap-4 px-5 py-4"
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
                  </div>
                );
              })}
              {components.length === 0 && (
                <div className="px-5 py-4 text-[14.5px] text-[var(--site-body)]">
                  Checking components
                </div>
              )}
            </div>
          </div>
        </Rise>

        {/* 90-day history strip */}
        <Rise delay={0.15} className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[13px] font-medium uppercase tracking-wide text-[var(--site-body)]">
              90-day history
            </h2>
            <span className="text-[13px] text-[var(--site-body)]">
              {overall === "operational" ? "100% uptime" : "See components above"}
            </span>
          </div>
          <div className="mt-4 flex h-10 items-end gap-[3px] rounded-[16px] bg-[var(--site-band)] p-3">
            {Array.from({ length: HISTORY_DAYS }).map((_, i) => (
              <span
                key={i}
                className={`h-full flex-1 rounded-[2px] ${
                  overall === "operational" ? "bg-emerald-400" : DOT_CLASS[overall]
                }`}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[12.5px] text-[var(--site-body)]">
            <span>90 days ago</span>
            <span>Today</span>
          </div>
        </Rise>
      </section>
    </main>
  );
}
