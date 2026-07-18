"use client";

import { motion } from "motion/react";
import { PillLabel } from "@/components/site/ui";

/* ---------------------------------------------------------------------------
   Changelog. "News" editorial header, then entries as plain rows: uppercase
   meta line (date · category), title, body. Hairline separators, no cards,
   no icons. Ported from the previous app/changelog/page.tsx; each entry's
   bullet items are folded into a single body paragraph and every version's
   tags/copy are preserved.
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

const ENTRIES: {
  version: string;
  date: string;
  category: string;
  title: string;
  body: string;
}[] = [
  {
    version: "v0.6",
    date: "Jul 2026",
    category: "New",
    title: "Any agent framework",
    body: "OpenClaw and Goose adapters, run them as managed fleet members. A generic CLI adapter covers any command that takes an instruction and prints a result. A framework badge now marks agents across the dashboard.",
  },
  {
    version: "v0.5",
    date: "May 2026",
    category: "New · Improved",
    title: "Instrument panel",
    body: "A full visual overhaul: near-black instrument theme, mono type, glowing ring gauges. Sensor cards with live area sparklines on the overview. A new multi-page marketing site with motion animations.",
  },
  {
    version: "v0.4",
    date: "Mar 2026",
    category: "New · Improved",
    title: "Real dollars, real delivery",
    body: "Token-accurate spend metering, with budgets that auto-pause on real cost. A2A delivery is at-least-once: acks and automatic redelivery, expiry to dead-letter. Workflow steps chain their dependency outputs downstream. Retention sweeps keep every operational table bounded.",
  },
  {
    version: "v0.3",
    date: "Jan 2026",
    category: "New",
    title: "Enterprise governance",
    body: "Plan limits enforced server-side, with Stripe checkout and webhooks driving entitlements. A tamper-evident, hash-chained audit export with offline verification. Connector token rotation, audited secret access, signed Slack webhooks. Per-tenant SLO verdicts and a structured error stream with trace ids.",
  },
  {
    version: "v0.2",
    date: "Nov 2025",
    category: "New · Fixed",
    title: "Reliability layer",
    body: "A real-time push transport at roughly one second latency replaced the polling loop, cutting idle agent cost by about 90 percent. A dead-letter queue with replay, retry backoff, and a stuck-run watchdog. O(1) counters replaced unbounded scans in metering and guards.",
  },
  {
    version: "v0.1",
    date: "Sep 2025",
    category: "New",
    title: "Control plane foundations",
    body: "Multi-agent registry, threads, tasks, goals, and skills with vector search. An A2A broker with loop detection and rate guards, plus a workflow engine with approvals. Spaces with RBAC, a kill switch, and shadow mode.",
  },
];

export default function ChangelogPage() {
  return (
    <main>
      {/* Header */}
      <section className="mx-auto max-w-[1060px] px-5 pb-16 pt-24 sm:px-7 sm:pt-32">
        <Rise>
          <PillLabel>News</PillLabel>
        </Rise>
        <Rise delay={0.08}>
          <h1 className="mt-5 max-w-[640px] text-[44px] font-medium leading-[1.06] tracking-[-0.015em] text-[var(--site-ink)] sm:text-[64px]">
            What shipped
          </h1>
        </Rise>
        <Rise delay={0.14}>
          <p className="mt-5 max-w-[520px] text-[17px] leading-relaxed text-[var(--site-body)]">
            Every release, in the order it shipped. No vaporware, no
            marketing gloss.
          </p>
        </Rise>
      </section>

      {/* Entries */}
      <section className="mx-auto max-w-[720px] px-5 pb-24 sm:px-7">
        <div className="border-t border-[var(--site-line)]">
          {ENTRIES.map((e, i) => (
            <Rise key={e.version} delay={Math.min(i * 0.05, 0.2)}>
              <article className="border-b border-[var(--site-line)] py-9">
                <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#a3a09a]">
                  {e.date} · {e.version} · {e.category}
                </p>
                <h2 className="mt-3 text-[22px] font-medium text-[var(--site-ink)]">
                  {e.title}
                </h2>
                <p className="mt-3 text-[15.5px] leading-relaxed text-[var(--site-body)]">
                  {e.body}
                </p>
              </article>
            </Rise>
          ))}
        </div>
      </section>
    </main>
  );
}
