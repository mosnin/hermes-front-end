"use client";

import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";
import { Reveal } from "@/components/marketing/motion";
import { Badge } from "@/components/ui";

const ENTRIES: {
  version: string;
  title: string;
  tags: ("new" | "improved" | "fixed")[];
  items: string[];
}[] = [
  {
    version: "0.6",
    title: "Any agent framework",
    tags: ["new"],
    items: [
      "OpenClaw and Goose adapters — run them as managed fleet members.",
      "Generic CLI adapter: any command that takes an instruction and prints a result.",
      "Framework badge on agents across the dashboard.",
    ],
  },
  {
    version: "0.5",
    title: "Instrument panel",
    tags: ["new", "improved"],
    items: [
      "Full visual overhaul: near-black instrument theme, mono type, glowing ring gauges.",
      "Sensor cards with live area sparklines on the overview.",
      "New multi-page marketing site with motion animations.",
    ],
  },
  {
    version: "0.4",
    title: "Real dollars, real delivery",
    tags: ["new", "improved"],
    items: [
      "Token-accurate spend metering; budgets auto-pause on real cost.",
      "A2A delivery is at-least-once: acks + automatic redelivery, expiry to dead-letter.",
      "Workflow steps chain their dependency outputs downstream.",
      "Retention sweeps keep every operational table bounded.",
    ],
  },
  {
    version: "0.3",
    title: "Enterprise governance",
    tags: ["new"],
    items: [
      "Plan limits enforced server-side; Stripe checkout + webhook drive entitlements.",
      "Tamper-evident (hash-chained) audit export with offline verification.",
      "Connector token rotation; audited secret access; signed Slack webhooks.",
      "Per-tenant SLO verdicts and a structured error stream with trace ids.",
    ],
  },
  {
    version: "0.2",
    title: "Reliability layer",
    tags: ["new", "fixed"],
    items: [
      "Real-time push transport (~1s latency) replaced the polling loop — ~90% cheaper idle agents.",
      "Dead-letter queue with replay; retry backoff; stuck-run watchdog.",
      "O(1) counters replaced unbounded scans in metering and guards.",
    ],
  },
  {
    version: "0.1",
    title: "Control plane foundations",
    tags: ["new"],
    items: [
      "Multi-agent registry, threads, tasks, goals, skills with vector search.",
      "A2A broker with loop detection and rate guards; workflow engine with approvals.",
      "Spaces with RBAC, kill switch, and shadow mode.",
    ],
  },
];

const TAG_TONE = { new: "green", improved: "blue", fixed: "yellow" } as const;

export default function ChangelogPage() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6">
        <section className="pt-20 pb-10">
          <Reveal>
            <h1 className="text-4xl font-bold tracking-tight">Changelog</h1>
            <p className="mt-3 text-muted">
              What shipped, in the order it shipped. No vaporware.
            </p>
          </Reveal>
        </section>

        <section className="space-y-6 pb-24">
          {ENTRIES.map((e, i) => (
            <Reveal key={e.version} delay={Math.min(i * 0.03, 0.15)}>
              <article className="rounded-2xl border border-border bg-surface p-7">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-semibold text-accent">
                    v{e.version}
                  </span>
                  <h2 className="text-lg font-semibold">{e.title}</h2>
                  <span className="ml-auto flex gap-1.5">
                    {e.tags.map((t) => (
                      <Badge key={t} tone={TAG_TONE[t]}>
                        {t}
                      </Badge>
                    ))}
                  </span>
                </div>
                <ul className="mt-4 space-y-2">
                  {e.items.map((it) => (
                    <li key={it} className="flex gap-2 text-sm text-muted">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                      {it}
                    </li>
                  ))}
                </ul>
              </article>
            </Reveal>
          ))}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
