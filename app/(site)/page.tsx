"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { SignedIn, SignedOut, SignUpButton } from "@clerk/nextjs";
import { ImagePlaceholder } from "@/components/site/painting";
import { SectionHead, ExplorePill } from "@/components/site/ui";
import {
  ConnectMock,
  OrchestrateMock,
  GovernMock,
  IntegrateMock,
  ControlPlaneDiagram,
} from "@/components/site/mockups";

/* ---------------------------------------------------------------------------
   Home. Structure mirrors the reference composition: hero image dissolving
   into a giant centered headline, logo row, stats, feature trio, testimonial
   grid, control-plane diagram, four product sections with animated mockups,
   trust band, news. All imagery = placeholders.
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

function GetStartedPill({ big }: { big?: boolean }) {
  const cls = big
    ? "rounded-full bg-[#1f1f1c] px-6 py-3 text-[15px] font-medium text-white transition hover:bg-black"
    : "rounded-full bg-[#1f1f1c] px-5 py-2.5 text-[14px] font-medium text-white transition hover:bg-black";
  return (
    <>
      <SignedOut>
        <SignUpButton mode="modal">
          <button className={cls}>Get started</button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <Link href="/dashboard" className={`inline-block ${cls}`}>
          Open dashboard
        </Link>
      </SignedIn>
    </>
  );
}

const LOGOS = ["hermes", "openclaw", "goose", "slack", "telegram", "discord", "composio"];

const STATS = [
  { value: "10x", label: "Faster agent onboarding" },
  { value: "90%", label: "Lower idle cost" },
  { value: "~1s", label: "Work push latency" },
];

const TRIO = [
  {
    title: "Run ongoing work",
    body: "Give agents standing jobs, not one-off prompts. Threads, tasks, and workflows keep long-running work moving on their own.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 17l5-5 4 4 7-8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 8h5v5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Govern every action",
    body: "Budgets on real spend, approval gates, and a kill switch that stops everything. Each action lands in a tamper-evident audit trail.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
    ),
  },
  {
    title: "Cut the busywork",
    body: "One held connection replaces polling storms, and the engine handles retries, routing, and recovery without a human in the loop.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12h8" strokeLinecap="round" />
      </svg>
    ),
  },
];

const QUOTES = [
  {
    name: "Ops lead",
    role: "Fintech scale-up",
    quote:
      "Agent ops used to be a cost center for us. Now the fleet runs jobs around the clock and every action still lands in an audit trail we trust.",
  },
  {
    name: "Platform engineer",
    role: "Logistics company",
    quote:
      "The guardrails are the whole product. Budgets, approvals, and a kill switch that actually kills, we shipped autonomy without losing sleep.",
  },
];

const SECTIONS = [
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
      body: "Hermes runs natively. OpenClaw and Goose plug in through first-class adapters, and anything with a command line joins through the generic CLI adapter.",
    },
    points: ["One-line connector install", "Health and heartbeats built in", "Live token streaming"],
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

const NEWS = [
  { title: "A note from our founding engineers", meta: "Company · 4 min read" },
  { title: "Real-time push and the end of polling storms", meta: "Engineering · 6 min read" },
  { title: "Inside the guardrail engine", meta: "Product · 5 min read" },
];

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative">
        <div className="absolute inset-x-0 top-0 h-[540px]">
          <ImagePlaceholder label="Hero image" fadeBottom className="h-full w-full" />
        </div>
        <div className="relative mx-auto max-w-[1060px] px-5 pb-6 pt-[360px] text-center sm:px-7">
          <Rise>
            <h1 className="mx-auto text-[44px] font-medium leading-[1.06] tracking-[-0.015em] text-[#33322e] sm:text-[64px]">
              The new standard
              <br />
              in agent operations
            </h1>
          </Rise>
          <Rise delay={0.1}>
            <p className="mx-auto mt-6 max-w-[430px] text-[18px] leading-relaxed text-[var(--site-body)]">
              Meet the control plane that connects your agents, automates the
              manual work and keeps every action accountable.
            </p>
          </Rise>
          <Rise delay={0.18}>
            <div className="mt-8">
              <GetStartedPill big />
            </div>
          </Rise>
        </div>
      </section>

      {/* Logo row */}
      <section className="mx-auto max-w-[1060px] px-5 pb-6 pt-24 sm:px-7">
        <p className="text-center text-[13.5px] text-[#a3a09a]">
          Built for teams that run agents in production
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-5">
          {LOGOS.map((l) => (
            <span
              key={l}
              className="text-[21px] font-semibold lowercase tracking-tight text-[#b9b6af]"
            >
              {l}
            </span>
          ))}
        </div>
        <div className="mt-16 border-b border-[var(--site-line)]" />
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-[1060px] px-5 py-20 sm:px-7">
        <div className="grid max-w-[720px] grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-0">
          {STATS.map((s, i) => (
            <Rise key={s.label} delay={i * 0.08}>
              <div className={i > 0 ? "sm:border-l sm:border-[var(--site-line)] sm:pl-10" : ""}>
                <p className="text-[38px] font-medium tracking-tight text-[var(--site-ink)]">{s.value}</p>
                <p className="mt-1 text-[14.5px] text-[var(--site-body)]">{s.label}</p>
              </div>
            </Rise>
          ))}
        </div>
      </section>

      {/* Feature trio */}
      <section className="mx-auto max-w-[1060px] px-5 pb-24 sm:px-7">
        <Rise>
          <h2 className="text-[34px] font-medium tracking-[-0.01em] text-[var(--site-ink)] sm:text-[40px]">
            Built for autonomy. Designed for trust.
          </h2>
        </Rise>
        <div className="mt-14 grid gap-12 sm:grid-cols-3">
          {TRIO.map((t, i) => (
            <Rise key={t.title} delay={i * 0.08}>
              <div className="text-[var(--site-ink)]">{t.icon}</div>
              <h3 className="mt-5 text-[16.5px] font-medium text-[var(--site-ink)]">{t.title}</h3>
              <p className="mt-3 text-[15.5px] leading-relaxed text-[var(--site-body)]">{t.body}</p>
            </Rise>
          ))}
        </div>
        <div className="mt-20 border-b border-[var(--site-line)]" />
      </section>

      {/* Trusted by operators */}
      <section className="mx-auto max-w-[1060px] px-5 pb-24 sm:px-7">
        <div className="text-center">
          <Rise>
            <h2 className="text-[34px] font-medium tracking-[-0.01em] text-[var(--site-ink)] sm:text-[40px]">
              Trusted by operators
            </h2>
            <p className="mx-auto mt-3 max-w-[360px] text-[15.5px] leading-relaxed text-[var(--site-body)]">
              Run your fleet like the world&apos;s best ops teams, without
              needing one.
            </p>
          </Rise>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-[1fr_1fr_2.05fr]">
          <Rise className="grid">
            <div className="grid min-h-[240px] place-items-center rounded-[22px] bg-[var(--site-card)] p-8">
              <span className="text-[30px] font-semibold tracking-tight text-[#8d8a83]">acme·co</span>
            </div>
          </Rise>
          <Rise delay={0.06} className="grid">
            <ImagePlaceholder label="Portrait" className="min-h-[240px] rounded-[22px]" />
          </Rise>
          <Rise delay={0.12} className="grid">
            <div className="relative overflow-hidden rounded-[22px]">
              <ImagePlaceholder label="Image" className="absolute inset-0" />
              <div className="relative flex min-h-[240px] flex-col justify-between p-6">
                <p className="text-[13.5px] font-medium text-[#55534e]">
                  {QUOTES[0].name} · {QUOTES[0].role}
                </p>
                <p className="max-w-[420px] text-[15.5px] leading-relaxed text-[#3c3a35]">
                  &ldquo;{QUOTES[0].quote}&rdquo;
                </p>
              </div>
            </div>
          </Rise>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[2.05fr_1fr_1fr]">
          <Rise className="grid">
            <div className="relative overflow-hidden rounded-[22px]">
              <ImagePlaceholder label="Image" className="absolute inset-0" />
              <div className="relative flex min-h-[240px] flex-col justify-between p-6">
                <p className="text-[13.5px] font-medium text-[#55534e]">
                  {QUOTES[1].name} · {QUOTES[1].role}
                </p>
                <p className="max-w-[420px] text-[15.5px] leading-relaxed text-[#3c3a35]">
                  &ldquo;{QUOTES[1].quote}&rdquo;
                </p>
              </div>
            </div>
          </Rise>
          <Rise delay={0.06} className="grid">
            <div className="grid min-h-[240px] place-items-center rounded-[22px] bg-[#1f1f1c] p-8">
              <span className="text-[26px] font-semibold tracking-tight text-white/85">nordic·ai</span>
            </div>
          </Rise>
          <Rise delay={0.12} className="grid">
            <ImagePlaceholder label="Portrait" className="min-h-[240px] rounded-[22px]" />
          </Rise>
        </div>
      </section>

      {/* Control plane diagram band */}
      <section className="bg-[var(--site-band)] py-20">
        <div className="mx-auto max-w-[1060px] px-5 sm:px-7">
          <SectionHead
            title={
              <>
                The infrastructure
                <br />
                behind every decision
              </>
            }
            sub="At the core of Cadre is a control plane that routes, guards, and records every agent decision across the fleet."
            explore="/features"
          />
          <div className="mt-10">
            <ControlPlaneDiagram />
          </div>
        </div>
      </section>

      {/* Product sections */}
      {SECTIONS.map((s) => (
        <section key={s.label} className="mx-auto max-w-[1060px] px-5 pt-24 sm:px-7">
          <Rise>
            <SectionHead label={s.label} title={s.title} sub={s.sub} explore="/features" />
          </Rise>
          <div className={`mt-12 grid items-start gap-10 lg:grid-cols-2 ${s.flip ? "" : ""}`}>
            <Rise className={s.flip ? "lg:order-2" : ""}>{s.mock}</Rise>
            <Rise delay={0.08} className={s.flip ? "lg:order-1" : ""}>
              <div className="rounded-[18px] bg-[var(--site-card)] p-5">
                <p className="flex items-center gap-2.5 text-[15.5px] font-medium text-[var(--site-ink)]">
                  <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="14" height="14" rx="3" />
                    <path d="M7 10.2l2.2 2.2L13.5 8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {s.highlight.title}
                </p>
                <p className="mt-2 pl-[30px] text-[13.5px] leading-relaxed text-[#75726c]">
                  {s.highlight.body}
                </p>
              </div>
              <ul className="mt-2 space-y-1">
                {s.points.map((pt) => (
                  <li key={pt} className="flex items-center gap-2.5 px-5 py-3 text-[15.5px] text-[var(--site-ink)]">
                    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px] shrink-0 text-[#55534e]" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="10" cy="10" r="7.5" />
                      <path d="M6.8 10.2l2.2 2.2L13.4 8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {pt}
                  </li>
                ))}
              </ul>
            </Rise>
          </div>
        </section>
      ))}

      {/* Safe and secure band */}
      <section className="mt-24 bg-[var(--site-band)] py-20">
        <div className="mx-auto grid max-w-[1060px] items-center gap-10 px-5 sm:px-7 md:grid-cols-[1.4fr_1fr]">
          <Rise>
            <h2 className="text-[34px] font-medium tracking-[-0.01em] text-[var(--site-ink)] sm:text-[40px]">
              Safe and secure
            </h2>
            <p className="mt-4 max-w-[480px] text-[15.5px] leading-relaxed text-[var(--site-body)]">
              Your trust is our foundation. Cadre is designed with a deep
              commitment to data privacy and security, from fail-closed admin
              access to hash-chained audit exports any auditor can verify.
            </p>
            <div className="mt-6">
              <ExplorePill href="/status" />
            </div>
          </Rise>
          <Rise delay={0.1}>
            <div className="flex items-center justify-start gap-4 md:justify-end">
              {["SOC 2", "GDPR", "ISO 27001"].map((b) => (
                <span
                  key={b}
                  className="grid h-[72px] w-[72px] place-items-center rounded-full border-[1.5px] border-[#c9c6bf] text-center text-[12px] font-semibold leading-tight text-[#75726c]"
                >
                  {b}
                </span>
              ))}
            </div>
          </Rise>
        </div>
      </section>

      {/* News */}
      <section className="mx-auto max-w-[1060px] px-5 py-24 sm:px-7">
        <div className="flex items-end justify-between">
          <Rise>
            <h2 className="text-[34px] font-medium tracking-[-0.01em] text-[var(--site-ink)]">News</h2>
          </Rise>
          <Link href="/changelog" className="text-[14.5px] font-medium text-[var(--site-ink)] hover:opacity-70">
            See more
          </Link>
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {NEWS.map((n, i) => (
            <Rise key={n.title} delay={i * 0.07}>
              <Link href="/changelog" className="group block">
                <ImagePlaceholder label="Cover" className="aspect-[1.05] rounded-[20px]" />
                <p className="mt-4 text-[16.5px] font-medium leading-snug text-[var(--site-ink)] group-hover:opacity-70">
                  {n.title}
                </p>
                <p className="mt-2 text-[12.5px] uppercase tracking-wide text-[#a3a09a]">{n.meta}</p>
              </Link>
            </Rise>
          ))}
        </div>
      </section>
    </main>
  );
}
