"use client";

import { Instrument_Sans } from "next/font/google";
import { motion } from "motion/react";
import { Reveal, Stagger, StaggerItem } from "@/components/site/motion";
import {
  PageHead,
  PillButton,
  Panel,
  StatTile,
  StatRow,
  ListRow,
  Dot,
  SectionLabel,
} from "@/components/dash/kit";

const font = Instrument_Sans({ subsets: ["latin"], variable: "--font-app" });

/* Design preview only: renders the redesigned dashboard shell + overview with
   static sample data so the editorial aesthetic can be reviewed without auth.
   Not linked anywhere; removed once the real pages adopt the kit. */

const NAV = [
  { label: "Work", items: ["Overview", "Agents", "Workflows", "Network", "Threads"] },
  { label: "Insight", items: ["Analytics", "Ops", "Cost", "Alerts"] },
  { label: "Build", items: ["Skills", "Knowledge", "MCP", "Integrations"] },
];

const AGENTS = [
  { name: "Scout", framework: "hermes", tone: "online" as const, seen: "now" },
  { name: "Closer", framework: "openclaw", tone: "online" as const, seen: "12s" },
  { name: "Analyst", framework: "goose", tone: "idle" as const, seen: "4m" },
  { name: "Archivist", framework: "hermes", tone: "paused" as const, seen: "1h" },
];

const ACTIVITY = [
  { who: "Scout", what: "completed outreach step 3", when: "just now" },
  { who: "Closer", what: "sent message to Analyst", when: "22s" },
  { who: "Analyst", what: "retrieved 3 memories", when: "1m" },
  { who: "Workflow", what: "run #4821 reached approval gate", when: "3m" },
  { who: "Archivist", what: "auto-paused by budget guard", when: "1h" },
];

export default function PreviewPage() {
  return (
    <div className={`app-light ${font.variable} min-h-screen bg-[var(--background)] text-[var(--foreground)]`}>
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--band)] p-4 lg:flex">
          <div className="flex items-center gap-2 px-2 py-2">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
              <g stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
                <path d="M12 3v18" /><path d="M4.2 7.5l15.6 9" /><path d="M19.8 7.5l-15.6 9" />
              </g>
            </svg>
            <span className="text-[15px] font-semibold tracking-[0.12em]">CADRE</span>
          </div>

          <div className="mt-4 rounded-xl bg-[var(--background)] px-3 py-2.5 ring-1 ring-inset ring-[var(--border)]">
            <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Space</p>
            <p className="text-[14px] font-medium">Ambrio Ops</p>
          </div>

          <nav className="mt-5 flex-1 space-y-5">
            {NAV.map((sec) => (
              <div key={sec.label}>
                <p className="mb-1.5 px-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--muted)]">{sec.label}</p>
                <div className="space-y-0.5">
                  {sec.items.map((it, i) => {
                    const active = sec.label === "Work" && i === 0;
                    return (
                      <span
                        key={it}
                        className={`relative flex items-center gap-2.5 rounded-full px-3 py-2 text-[14px] ${
                          active ? "text-[var(--background)]" : "text-[var(--muted-strong)] hover:bg-[var(--surface)]"
                        }`}
                      >
                        {active && (
                          <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-[var(--foreground)]" />
                        )}
                        <span className="relative">{it}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-4 flex items-center gap-2.5 border-t border-[var(--border)] px-2 pt-3">
            <span className="h-8 w-8 rounded-full bg-[var(--surface)]" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">Jordan Vega</p>
              <p className="truncate text-[11px] text-[var(--muted)]">owner</p>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1 px-6 py-8 sm:px-10 sm:py-10">
          <div className="mx-auto max-w-[1100px] space-y-8">
            <PageHead
              eyebrow="Ambrio Ops · control plane"
              title="Overview"
              sub="Your fleet at a glance. Live agent health, throughput, and what shipped."
              actions={
                <>
                  <PillButton variant="outline">Load demo</PillButton>
                  <PillButton>Actions</PillButton>
                </>
              }
            />

            <StatRow>
              <StatTile value={4} label="Agents online" hint="of 6 connected" tone="ink" />
              <StatTile value={3} label="Workflows running" hint="2 awaiting approval" />
              <StatTile value={128} label="Messages · 24h" hint="A2A + bridges" />
              <StatTile value={0} label="Errors · 24h" hint="all clear" />
            </StatRow>

            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <Panel title="Live activity" action={<PillButton variant="outline" href="#">See all</PillButton>}>
                <div>
                  {ACTIVITY.map((a) => (
                    <ListRow
                      key={a.what}
                      leading={a.who.slice(0, 2).toUpperCase()}
                      title={<><span className="font-medium">{a.who}</span> {a.what}</>}
                      trailing={a.when}
                    />
                  ))}
                </div>
              </Panel>

              <Panel title="Fleet" tone="band" action={<PillButton variant="outline" href="#">Manage</PillButton>}>
                <div>
                  {AGENTS.map((a) => (
                    <ListRow
                      key={a.name}
                      leading={<Dot tone={a.tone} />}
                      title={a.name}
                      meta={a.framework}
                      trailing={a.seen}
                    />
                  ))}
                </div>
              </Panel>
            </div>

            <div>
              <SectionLabel>throughput · last 7 days</SectionLabel>
              <Panel>
                <div className="flex h-40 items-end gap-2.5">
                  {[38, 52, 44, 70, 61, 88, 74].map((h, i) => (
                    <Reveal key={i} as="div" y={0} delay={i * 0.05} className="flex flex-1 flex-col items-center gap-2">
                      <motion.div
                        initial={{ scaleY: 0 }}
                        whileInView={{ scaleY: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: i * 0.05, ease: [0.22, 0.61, 0.24, 1] }}
                        style={{ height: `${h}%`, transformOrigin: "bottom" }}
                        className="w-full rounded-t-lg bg-[var(--foreground)]"
                      />
                      <span className="text-[11px] text-[var(--muted)]">{["M", "T", "W", "T", "F", "S", "S"][i]}</span>
                    </Reveal>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
