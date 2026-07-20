"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { PillLabel, TYPE_H1 } from "@/components/site/ui";
import { Reveal, Stagger, StaggerItem, TextReveal, CountUp, EASE } from "@/components/site/motion";

/* ---------------------------------------------------------------------------
   Changelog. "News" editorial header, then entries as plain rows: uppercase
   meta line (date · category), title, body. Hairline separators, no cards,
   no icons. Ported from the previous app/changelog/page.tsx; each entry's
   bullet items are folded into a single body paragraph and every version's
   tags/copy are preserved. Header headline is now a word-by-word TextReveal;
   entries cascade in through a single Stagger container instead of manual
   per-row delay math, with a small hover nudge per row.
--------------------------------------------------------------------------- */

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
        <Reveal>
          <PillLabel>News</PillLabel>
        </Reveal>
        <h1 className={cn(TYPE_H1, "mt-5 max-w-[640px] text-[var(--site-ink)]")}>
          <TextReveal text="What shipped" as="span" delay={0.08} />
        </h1>
        <Reveal delay={0.3}>
          <p className="mt-5 max-w-[520px] text-[17px] leading-relaxed text-[var(--site-body)]">
            Every release, in the order it shipped. No vaporware, no
            marketing gloss.
          </p>
          <p className="mt-6 text-[13.5px] text-[#a3a09a]">
            <CountUp value={ENTRIES.length} duration={0.9} className="font-medium text-[var(--site-ink)]" />
            {" "}releases shipped since launch
          </p>
        </Reveal>
      </section>

      {/* Entries */}
      <section className="mx-auto max-w-[720px] px-5 pb-24 sm:px-7">
        <Stagger className="border-t border-[var(--site-line)]" gap={0.06}>
          {ENTRIES.map((e) => (
            <StaggerItem key={e.version} as="div">
              <motion.article
                className="border-b border-[var(--site-line)] py-9"
                whileHover={{ x: 3 }}
                transition={{ duration: 0.2, ease: EASE }}
              >
                <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#a3a09a]">
                  {e.date} · {e.version} · {e.category}
                </p>
                <h2 className="mt-3 text-[22px] font-medium text-[var(--site-ink)]">
                  {e.title}
                </h2>
                <p className="mt-3 text-[15.5px] leading-relaxed text-[var(--site-body)]">
                  {e.body}
                </p>
              </motion.article>
            </StaggerItem>
          ))}
        </Stagger>
      </section>
    </main>
  );
}
