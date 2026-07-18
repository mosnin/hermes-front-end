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

/** Small circular "+" affordance sitting in the corner of a logo/portrait tile. */
function CornerPlus({ dark }: { dark?: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute bottom-4 right-4 grid h-7 w-7 place-items-center rounded-full ${
        dark ? "bg-white/15 text-white" : "bg-[#1f1f1c]/8 text-[#55534e]"
      }`}
    >
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M6 2v8M2 6h8" strokeLinecap="round" />
      </svg>
    </span>
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

/* Small inline icon set for the product-section feature rows, keeping each
   section's list visually distinct instead of one repeated glyph. */
const ICON_PROPS = { viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.5 } as const;

function IconPlug({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M7 2.5v4M13 2.5v4" strokeLinecap="round" />
      <path d="M5 6.5h10v3a5 5 0 0 1-10 0v-3z" />
      <path d="M10 14.5v3" strokeLinecap="round" />
    </svg>
  );
}
function IconBolt({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M11 2 5.5 11h4l-1 7 7-9h-4l1-7z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconPulse({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M2 11h3.5l2-5 3 9 2-7 1.5 3H18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconStream({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M4 14a8 8 0 0 1 12 0" strokeLinecap="round" />
      <path d="M6.8 11.6a4.2 4.2 0 0 1 6.4 0" strokeLinecap="round" />
      <circle cx="10" cy="15" r="1.1" />
    </svg>
  );
}
function IconFlow({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <circle cx="4.5" cy="5" r="2" />
      <circle cx="4.5" cy="15" r="2" />
      <circle cx="15.5" cy="10" r="2" />
      <path d="M6.3 5.8 13.8 9M6.3 14.2 13.8 11" strokeLinecap="round" />
    </svg>
  );
}
function IconShieldCheck({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M10 2.5 16 4.6v4.6c0 4-2.6 6.7-6 8.3-3.4-1.6-6-4.3-6-8.3V4.6L10 2.5z" strokeLinejoin="round" />
      <path d="M7.2 10 9.3 12l3.5-4.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconReplay({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M4 10a6 6 0 1 1 1.9 4.4" strokeLinecap="round" />
      <path d="M4 14.5V10h4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconClock({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <circle cx="10" cy="10.5" r="7.2" />
      <path d="M10 6.5V10.5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconLock({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <rect x="4.5" y="9" width="11" height="8" rx="2.2" />
      <path d="M6.7 9V6.5a3.3 3.3 0 0 1 6.6 0V9" />
    </svg>
  );
}
function IconCoin({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 6v8M7.8 8.2c0-1.2 1-2 2.2-2s2.2.6 2.2 1.6c0 2.2-4.4 1.2-4.4 3.4 0 1 1 1.6 2.2 1.6s2.2-.8 2.2-2" strokeLinecap="round" />
    </svg>
  );
}
function IconDoc({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M6 2.5h6l3 3v12H6z" strokeLinejoin="round" />
      <path d="M8.3 9.5h4.4M8.3 12.5h4.4M8.3 15h2.6" strokeLinecap="round" />
    </svg>
  );
}
function IconUsers({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <circle cx="7.3" cy="7" r="2.6" />
      <path d="M2.5 16.5c.5-3 2.3-4.6 4.8-4.6s4.3 1.6 4.8 4.6" strokeLinecap="round" />
      <circle cx="14.2" cy="6.3" r="2" />
      <path d="M12.8 11.6c1.9.2 3.2 1.7 3.7 4.3" strokeLinecap="round" />
    </svg>
  );
}
function IconLayers({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M10 2.8 17 6.5 10 10.2 3 6.5z" strokeLinejoin="round" />
      <path d="M3 10.5 10 14.2l7-3.7M3 14.3 10 18l7-3.7" strokeLinejoin="round" />
    </svg>
  );
}
function IconChat({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M3 4.5h14v9H8.5L5 16.5V13.5H3z" strokeLinejoin="round" />
    </svg>
  );
}
function IconGrid({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <rect x="3" y="3" width="5.5" height="5.5" rx="1.2" />
      <rect x="11.5" y="3" width="5.5" height="5.5" rx="1.2" />
      <rect x="3" y="11.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.2" />
    </svg>
  );
}
function IconLink({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M8.3 11.7 11.7 8.3" strokeLinecap="round" />
      <path d="M9 6.2 10.6 4.6a3 3 0 0 1 4.2 4.2L13.2 10.4" strokeLinecap="round" />
      <path d="M11 13.8 9.4 15.4a3 3 0 0 1-4.2-4.2L6.8 9.6" strokeLinecap="round" />
    </svg>
  );
}

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
      icon: IconPlug,
      title: "Adapters for any framework",
      body: "Hermes runs natively. OpenClaw and Goose plug in through first-class adapters, and anything with a command line joins through the generic CLI adapter.",
    },
    points: [
      { label: "One-line connector install", icon: IconBolt },
      { label: "Health and heartbeats built in", icon: IconPulse },
      { label: "Live token streaming", icon: IconStream },
    ],
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
      icon: IconFlow,
      title: "Dependency-aware steps",
      body: "Each step receives the outputs of the steps it depends on. Retries with backoff, timeouts, and a stuck-run watchdog keep runs moving.",
    },
    points: [
      { label: "Human approval gates", icon: IconShieldCheck },
      { label: "Dead-letter replay", icon: IconReplay },
      { label: "Cron, webhook, and event triggers", icon: IconClock },
    ],
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
      icon: IconLock,
      title: "Kill switch and shadow mode",
      body: "Stop everything with one switch, or run agents in shadow mode where they propose actions to a ledger instead of executing them.",
    },
    points: [
      { label: "Budgets metered on real spend", icon: IconCoin },
      { label: "Tamper-evident audit export", icon: IconDoc },
      { label: "RBAC from viewer to owner", icon: IconUsers },
    ],
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
      icon: IconLayers,
      title: "MCP servers per agent",
      body: "Assign MCP servers to agents and they use those tools in real multi-step tool loops, scoped by the same guardrails as everything else.",
    },
    points: [
      { label: "Slack, Telegram, and Discord bridges", icon: IconChat },
      { label: "Composio toolkits", icon: IconGrid },
      { label: "Spec-conformant A2A interop", icon: IconLink },
    ],
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
            <div className="relative grid min-h-[240px] place-items-center rounded-[22px] bg-[var(--site-card)] p-8">
              <span className="text-[30px] font-semibold tracking-tight text-[#8d8a83]">acme·co</span>
              <CornerPlus />
            </div>
          </Rise>
          <Rise delay={0.06} className="grid">
            <div className="relative">
              <ImagePlaceholder label="Portrait" className="min-h-[240px] rounded-[22px]" />
              <CornerPlus />
            </div>
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
            <div className="relative grid min-h-[240px] place-items-center rounded-[22px] bg-[#1f1f1c] p-8">
              <span className="text-[26px] font-semibold tracking-tight text-white/85">nordic·ai</span>
              <CornerPlus dark />
            </div>
          </Rise>
          <Rise delay={0.12} className="grid">
            <div className="relative">
              <ImagePlaceholder label="Portrait" className="min-h-[240px] rounded-[22px]" />
              <CornerPlus />
            </div>
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
          <div className="mt-12 grid items-start gap-10 lg:grid-cols-2">
            <Rise className={s.flip ? "lg:order-2" : ""}>{s.mock}</Rise>
            <Rise delay={0.08} className={s.flip ? "lg:order-1" : ""}>
              <div className="rounded-[18px] bg-[var(--site-card)] p-5">
                <p className="flex items-center gap-2.5 text-[15.5px] font-medium text-[var(--site-ink)]">
                  <s.highlight.icon className="h-[18px] w-[18px] shrink-0 text-[#33322e]" />
                  {s.highlight.title}
                </p>
                <p className="mt-2 pl-[30px] text-[13.5px] leading-relaxed text-[#75726c]">
                  {s.highlight.body}
                </p>
              </div>
              <ul className="mt-2 space-y-1">
                {s.points.map((pt) => (
                  <li key={pt.label} className="flex items-center gap-2.5 px-5 py-3 text-[15.5px] text-[var(--site-ink)]">
                    <pt.icon className="h-[18px] w-[18px] shrink-0 text-[#55534e]" />
                    {pt.label}
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
            <div className="flex items-center justify-start gap-5 md:justify-end">
              {["SOC 2", "GDPR", "ISO 27001"].map((b) => (
                <span
                  key={b}
                  className="relative grid h-[76px] w-[76px] shrink-0 place-items-center rounded-full border-[1.5px] border-[#c9c6bf]"
                >
                  <span
                    aria-hidden
                    className="absolute inset-[6px] rounded-full border border-dashed border-[#d6d3cc]"
                  />
                  {[0, 90, 180, 270].map((deg) => (
                    <svg
                      key={deg}
                      viewBox="0 0 10 10"
                      className="absolute left-1/2 top-1/2 h-2 w-2 text-[#c9c6bf]"
                      style={{
                        transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(-31px) rotate(${-deg}deg)`,
                      }}
                      aria-hidden
                    >
                      <path d="M5 0l1.1 3.4H10L6.9 5.5 8 9 5 6.9 2 9l1.1-3.5L0 3.4h3.9z" fill="currentColor" />
                    </svg>
                  ))}
                  <span className="relative px-2 text-center text-[11.5px] font-semibold leading-tight text-[#75726c]">
                    {b}
                  </span>
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
