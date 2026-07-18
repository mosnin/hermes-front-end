"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { SectionHead, DarkPill, PillLabel } from "@/components/site/ui";
import {
  ConnectMock,
  OrchestrateMock,
  GovernMock,
  IntegrateMock,
} from "@/components/site/mockups";

/* ---------------------------------------------------------------------------
   Features. Hero headline band, then six product pillars in the home page's
   product-section pattern (SectionHead + 2-col grid: mock card, feature
   list with one highlighted beige row and simple rows). Four pillars reuse
   the shared mockups; the remaining two (Real-time, Skills and memory) get
   small inline beige mock cards in the same visual language. Closes with a
   centered CTA band.
--------------------------------------------------------------------------- */

const CARD = "rounded-[26px] bg-[var(--site-card)] p-6 sm:p-8";

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

/** Real-time: a stream of pushed events arriving with latency badges. */
function RealtimeMock() {
  const reduce = useReducedMotion();
  const rows = [
    { label: "Work pushed", meta: "~1s" },
    { label: "Burst drain", meta: "250ms", active: true },
    { label: "Idle backoff", meta: "auto" },
    { label: "Token stream", meta: "live" },
    { label: "Heartbeat", meta: "ok" },
  ];
  return (
    <div className={cn(CARD, "grid place-items-center")}>
      <div className="w-full max-w-[300px] space-y-2.5">
        {rows.map((r, i) => (
          <motion.div
            key={r.label}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: reduce ? 0 : i * 0.07, duration: 0.4 }}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px]",
              r.active
                ? "bg-white text-[var(--site-ink)] shadow-[0_10px_24px_rgba(31,31,28,0.10)]"
                : "bg-white/55 text-[#6c6a64]",
            )}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              {!reduce && (
                <motion.span
                  className="absolute inline-flex h-full w-full rounded-full bg-[#8b5cf6]"
                  animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
                  transition={{ duration: 1.7, repeat: Infinity, delay: i * 0.25 }}
                />
              )}
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#8b5cf6]" />
            </span>
            <span className={r.active ? "font-medium" : ""}>{r.label}</span>
            <span className="ml-auto text-[12.5px] text-[#a3a09a]">{r.meta}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** Skills and memory: vector-searched skill chips feeding a memory row. */
function SkillsMock() {
  const reduce = useReducedMotion();
  const chips = ["Refunds policy", "Escalation path", "Pricing table", "Tone guide", "Space memory"];
  return (
    <div className={cn(CARD, "min-h-[300px]")}>
      <div className="flex flex-wrap gap-2">
        {chips.map((c, i) => (
          <motion.span
            key={c}
            initial={{ opacity: 0, y: 6 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: reduce ? 0 : i * 0.07, duration: 0.4 }}
            className={cn(
              "rounded-full px-3.5 py-2 text-[13.5px]",
              i === 2
                ? "bg-white font-medium text-[var(--site-ink)] shadow-[0_10px_24px_rgba(31,31,28,0.10)]"
                : "bg-white/55 text-[#6c6a64]",
            )}
          >
            {c}
          </motion.span>
        ))}
      </div>
      <div className="mt-6 space-y-2.5">
        {["Vector search: 3 matches", "Grounded response ready"].map((r, i) => (
          <motion.div
            key={r}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: reduce ? 0 : 0.35 + i * 0.08, duration: 0.4 }}
            className="flex items-center gap-2.5 rounded-xl bg-white/55 px-3.5 py-2.5 text-[13.5px] text-[#6c6a64]"
          >
            <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-[#8b5cf6]" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M2 6h8M6 2v8" strokeLinecap="round" />
            </svg>
            {r}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const HighlightIcon = () => (
  <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="14" height="14" rx="3" />
    <path d="M7 10.2l2.2 2.2L13.5 8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const RowIcon = () => (
  <svg viewBox="0 0 20 20" className="h-[18px] w-[18px] shrink-0 text-[#55534e]" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="10" cy="10" r="7.5" />
    <path d="M6.8 10.2l2.2 2.2L13.4 8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PILLARS = [
  {
    label: "Connect",
    title: (
      <>
        Bring every agent
        <br />
        into one fleet
      </>
    ),
    sub: "Native, adapter, or CLI. Connected in minutes.",
    mock: <ConnectMock />,
    highlight: {
      title: "Adapters for any framework",
      body: "Hermes runs natively. OpenClaw and Goose plug in through first-class adapters, and anything with a command line joins through the generic CLI adapter. Don't want to run any of it yourself? Cadre Cloud deploys agents to isolated containers we manage, no servers or setup required.",
    },
    points: ["One-line connector install", "Health and heartbeats built in", "Live token streaming", "Cadre Cloud managed hosting (BYOK)"],
    flip: false,
  },
  {
    label: "Orchestrate",
    title: (
      <>
        Ship multi-step work
        <br />
        that survives reality
      </>
    ),
    sub: "Dependency-aware workflows with recovery built in.",
    mock: <OrchestrateMock />,
    highlight: {
      title: "Dependency-aware steps",
      body: "Each step receives the outputs of the steps it depends on. Retries with backoff, timeouts, and a stuck-run watchdog keep runs moving.",
    },
    points: ["Human approval gates", "Dead-letter replay", "Cron, webhook, and event triggers"],
    flip: true,
  },
  {
    label: "Real-time",
    title: (
      <>
        Push, not poll,
        <br />
        and cut idle cost
      </>
    ),
    sub: "One held connection replaces polling storms.",
    mock: <RealtimeMock />,
    highlight: {
      title: "Work pushed in about a second",
      body: "A single held connection delivers work the moment it is ready and burst-drains queues in 250ms, while idle agents back off automatically.",
    },
    points: ["~1s push latency", "Adaptive idle backoff", "Token streaming into the UI"],
    flip: false,
  },
  {
    label: "Govern",
    title: (
      <>
        Guardrails an
        <br />
        enterprise can sign
      </>
    ),
    sub: "Autonomy without the pager anxiety.",
    mock: <GovernMock />,
    highlight: {
      title: "Kill switch and shadow mode",
      body: "Stop everything with one switch, or run agents in shadow mode where they propose actions to a ledger instead of executing them.",
    },
    points: ["Budgets metered on real spend", "Tamper-evident audit export", "RBAC from viewer to owner"],
    flip: true,
  },
  {
    label: "Skills and memory",
    title: (
      <>
        Ground every answer
        <br />
        in what agents know
      </>
    ),
    sub: "Vector-searched skills and Space memory, on every turn.",
    mock: <SkillsMock />,
    highlight: {
      title: "Vector-searched skills",
      body: "Skills are indexed and retrieved by relevance, not stuffed into a prompt. Space memory carries context forward across an agent's whole thread of work.",
    },
    points: ["Per-agent skill libraries", "Space memory across turns", "Grounded, cited responses"],
    flip: false,
  },
  {
    label: "Integrate",
    title: (
      <>
        Every tool your
        <br />
        agents need
      </>
    ),
    sub: "MCP servers, chat bridges, and 250+ toolkits.",
    mock: <IntegrateMock />,
    highlight: {
      title: "MCP servers per agent",
      body: "Assign MCP servers to agents and they use those tools in real multi-step tool loops, scoped by the same guardrails as everything else.",
    },
    points: ["Slack, Telegram, and Discord bridges", "Composio toolkits", "Spec-conformant A2A interop"],
    flip: true,
  },
];

export default function FeaturesPage() {
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-[1060px] px-5 pb-8 pt-24 text-center sm:px-7 sm:pt-32">
        <Rise>
          <PillLabel>Features</PillLabel>
        </Rise>
        <Rise delay={0.06}>
          <h1 className="mx-auto mt-6 max-w-[760px] text-[44px] font-medium leading-[1.06] tracking-[-0.015em] text-[var(--site-ink)] sm:text-[64px]">
            An operations layer for ongoing agent work
          </h1>
        </Rise>
        <Rise delay={0.12}>
          <p className="mx-auto mt-6 max-w-[460px] text-[18px] leading-relaxed text-[var(--site-body)]">
            Not one-off prompts. Fleets with jobs, guardrails, and receipts,
            connected, orchestrated, and governed from one control plane.
          </p>
        </Rise>
        <Rise delay={0.18}>
          <div className="mt-10">
            <DarkPill href="/pricing">See pricing</DarkPill>
          </div>
        </Rise>
      </section>

      {/* Six product pillars */}
      {PILLARS.map((s) => (
        <section key={s.label} className="mx-auto max-w-[1060px] px-5 pt-24 sm:px-7">
          <Rise>
            <SectionHead label={s.label} title={s.title} sub={s.sub} explore="/pricing" />
          </Rise>
          <div className="mt-12 grid items-start gap-10 lg:grid-cols-2">
            <Rise className={s.flip ? "lg:order-2" : ""}>{s.mock}</Rise>
            <Rise delay={0.08} className={s.flip ? "lg:order-1" : ""}>
              <div className="rounded-[18px] bg-[var(--site-card)] p-5">
                <p className="flex items-center gap-2.5 text-[15.5px] font-medium text-[var(--site-ink)]">
                  <HighlightIcon />
                  {s.highlight.title}
                </p>
                <p className="mt-2 pl-[30px] text-[13.5px] leading-relaxed text-[#75726c]">
                  {s.highlight.body}
                </p>
              </div>
              <ul className="mt-2 space-y-1">
                {s.points.map((pt) => (
                  <li key={pt} className="flex items-center gap-2.5 px-5 py-3 text-[15.5px] text-[var(--site-ink)]">
                    <RowIcon />
                    {pt}
                  </li>
                ))}
              </ul>
            </Rise>
          </div>
        </section>
      ))}

      {/* Closing CTA band */}
      <section className="mt-24 bg-[var(--site-band)] py-24">
        <div className="mx-auto max-w-[1060px] px-5 text-center sm:px-7">
          <Rise>
            <h2 className="mx-auto max-w-[520px] text-[34px] font-medium leading-[1.12] tracking-[-0.01em] text-[var(--site-ink)] sm:text-[40px]">
              One fleet, every guardrail, ready today
            </h2>
            <p className="mx-auto mt-4 max-w-[420px] text-[15.5px] leading-relaxed text-[var(--site-body)]">
              See what a plan costs and what it includes, then bring your
              agents in.
            </p>
            <div className="mt-8">
              <DarkPill href="/pricing">See pricing</DarkPill>
            </div>
          </Rise>
        </div>
      </section>
    </main>
  );
}
