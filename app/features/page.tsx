"use client";

import Link from "next/link";
import {
  Activity,
  Bot,
  Cable,
  Gauge,
  KeyRound,
  Network,
  Plug,
  ShieldCheck,
  Terminal,
  Workflow,
} from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";
import { Reveal, Stagger, StaggerItem, Lift } from "@/components/marketing/motion";
import { AreaSpark } from "@/components/sensor-card";
import { RingGauge } from "@/components/ui";

const PILLARS = [
  {
    id: "orchestration",
    icon: Workflow,
    title: "Orchestration that survives reality",
    body: "Multi-step, multi-agent workflows with dependency chaining — each step receives the outputs of the steps it depends on. Retries with exponential backoff, step timeouts, a stuck-run watchdog, and a dead-letter queue with one-click replay.",
    points: ["Dependency data flows between steps", "Exponential backoff + timeouts", "Dead-letter queue with replay", "Human approval gates"],
  },
  {
    id: "a2a",
    icon: Network,
    title: "Agent-to-agent, done properly",
    body: "Spec-conformant A2A: Agent Cards, JSON-RPC, streaming. Internally, messages are delivered at-least-once — unacked deliveries requeue automatically — with loop detection, rate limits, and daily budgets standing guard.",
    points: ["At-least-once delivery with acks", "Loop detection in O(1)", "Per-minute + daily rate guards", "External A2A agents by card URL"],
  },
  {
    id: "realtime",
    icon: Activity,
    title: "Real-time, not real-expensive",
    body: "One held connection replaces polling storms: work is pushed to agents with ~1s latency and burst-drained at 250ms when busy, while idle agents back off automatically — cutting idle cost by ~90%.",
    points: ["~1s push latency", "250ms burst drain", "Adaptive idle backoff", "Token streaming into the UI"],
  },
  {
    id: "governance",
    icon: ShieldCheck,
    title: "Governance an enterprise can sign",
    body: "A kill switch that actually stops everything. Shadow mode that proposes instead of executes. Budgets metered on real token spend that auto-pause the fleet. A hash-chained, tamper-evident audit export any auditor can verify offline.",
    points: ["Kill switch + shadow mode", "Budgets on real token spend", "Tamper-evident audit chain", "RBAC: viewer → owner"],
  },
  {
    id: "frameworks",
    icon: Bot,
    title: "Any agent framework",
    body: "Hermes agents connect natively. OpenClaw and Goose run through first-class adapters. Anything else — if it takes an instruction on the command line and prints a result, the generic CLI adapter turns it into a managed fleet member.",
    points: ["Hermes native runtime", "OpenClaw adapter", "Goose adapter", "Generic CLI adapter"],
  },
  {
    id: "integrations",
    icon: Plug,
    title: "MCP servers & integrations",
    body: "Assign MCP servers to agents and they use those tools in a real multi-step tool loop. Bridge conversations to Slack, Telegram, and Discord — inbound and outbound — and execute Composio toolkits.",
    points: ["Per-agent MCP assignment", "Multi-step tool use", "Slack / Telegram / Discord", "Composio toolkits"],
  },
];

const EXTRAS = [
  { icon: Gauge, title: "SLOs & metrics", body: "Run success, delivery health, error budget, fleet reachability — scored per Space." },
  { icon: KeyRound, title: "Secrets vault", body: "Values masked everywhere; reveals audit-logged; injected to agents at runtime." },
  { icon: Terminal, title: "Developer API", body: "hk_ API keys, public REST endpoints, webhook triggers with signed requests." },
  { icon: Cable, title: "Chat bridges", body: "Route channels to agents with real HMAC-verified Slack request signing." },
];

export default function FeaturesPage() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6">
        <section className="pt-20 pb-10 text-center">
          <Reveal>
            <h1 className="mx-auto max-w-2xl text-balance text-4xl font-bold tracking-tight">
              An operations layer for{" "}
              <span className="text-accent text-glow-accent">ongoing</span> agent work
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-muted">
              Not one-off prompts. Fleets with jobs, guardrails, and receipts.
            </p>
          </Reveal>
        </section>

        <section className="space-y-6 pb-16">
          {PILLARS.map((p, i) => (
            <Reveal key={p.id} delay={0.04 * (i % 2)}>
              <div
                id={p.id}
                className="grid gap-8 rounded-2xl border border-border bg-surface p-8 lg:grid-cols-[1.3fr_1fr]"
              >
                <div>
                  <p.icon className="mb-3 h-6 w-6 text-accent" />
                  <h2 className="text-2xl font-bold">{p.title}</h2>
                  <p className="mt-3 text-muted">{p.body}</p>
                </div>
                <ul className="grid content-center gap-2">
                  {p.points.map((pt) => (
                    <li
                      key={pt}
                      className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_rgba(255,91,4,0.7)]" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </section>

        {/* Visual proof band */}
        <section className="pb-16">
          <Reveal>
            <div className="grid gap-4 rounded-2xl border border-border bg-surface p-8 sm:grid-cols-3">
              <div className="text-center">
                <RingGauge value={98} unit="%" color="accent" pct={0.98} size={110} className="mx-auto" />
                <p className="mt-2 text-sm text-muted">Run success SLO</p>
              </div>
              <div className="text-center">
                <RingGauge value={0} unit="lost" color="green" pct={1} size={110} className="mx-auto" />
                <p className="mt-2 text-sm text-muted">Message loss target</p>
              </div>
              <div className="self-center">
                <AreaSpark
                  data={[4, 7, 6, 10, 14, 12, 18, 16, 22, 26, 24, 30]}
                  color="accent"
                  axis={["mon", "tue", "wed", "thu", "fri", "sat"]}
                />
                <p className="mt-1 text-center text-sm text-muted">Fleet throughput</p>
              </div>
            </div>
          </Reveal>
        </section>

        <section className="pb-20">
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {EXTRAS.map((e) => (
              <StaggerItem key={e.title}>
                <Lift className="h-full rounded-2xl border border-border bg-surface p-6">
                  <e.icon className="mb-3 h-5 w-5 text-accent" />
                  <h3 className="text-sm font-semibold">{e.title}</h3>
                  <p className="mt-2 text-sm text-muted">{e.body}</p>
                </Lift>
              </StaggerItem>
            ))}
          </Stagger>
          <Reveal className="mt-12 text-center">
            <Link
              href="/pricing"
              className="rounded-lg bg-accent px-6 py-3 font-medium text-white shadow-[0_0_20px_rgba(255,91,4,0.4)] transition hover:brightness-110"
            >
              See pricing
            </Link>
          </Reveal>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
