"use client";

import Link from "next/link";
import { SignedIn, SignedOut, SignUpButton } from "@clerk/nextjs";
import { motion } from "motion/react";
import {
  Activity,
  Boxes,
  Cable,
  Gauge,
  ListTodo,
  Network,
  Plug,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { RingGauge } from "@/components/ui";
import { AreaSpark } from "@/components/sensor-card";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";
import { Reveal, Stagger, StaggerItem, Pulse, Lift } from "@/components/marketing/motion";

const DIALS = [
  { label: "Agents online", value: 12, unit: "up", color: "green", pct: 0.92, data: [3, 5, 4, 7, 9, 8, 11, 12, 12, 10, 12, 12] },
  { label: "Run success", value: 98, unit: "%", color: "accent", pct: 0.98, data: [90, 94, 92, 96, 95, 98, 97, 98, 99, 98, 98, 98] },
  { label: "A2A msgs / min", value: 42, unit: "msg", color: "yellow", pct: 0.6, data: [12, 18, 25, 22, 30, 41, 38, 45, 42, 39, 44, 42] },
  { label: "Spend today", value: "$7", unit: "usd", color: "cyan", pct: 0.35, data: [1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 7, 7] },
] as const;

const FEATURES = [
  { icon: Boxes, title: "Multi-agent registry", body: "Connect agents deployed anywhere — AWS, GCP, your laptop — and run them from one panel." },
  { icon: Network, title: "Agent-to-agent (A2A)", body: "Spec-conformant A2A with at-least-once delivery, loop detection, and rate guards." },
  { icon: Workflow, title: "Orchestration", body: "Multi-step, multi-agent workflows with retries, backoff, approvals, and dead-letter replay." },
  { icon: Activity, title: "Real-time streaming", body: "One held connection pushes work to agents in under a second — no polling storms." },
  { icon: ShieldCheck, title: "Governance", body: "Kill switch, shadow mode, budgets that auto-pause on real spend, tamper-evident audit export." },
  { icon: Plug, title: "MCP + integrations", body: "Wire any MCP server plus Slack, Telegram, Discord, and Composio toolkits." },
  { icon: Sparkles, title: "Skills & memory", body: "Vector-searched skills and Space memory ground every agent response." },
  { icon: Gauge, title: "SLOs & metering", body: "Per-tenant SLO verdicts, error traces, and token-accurate spend metering." },
  { icon: ListTodo, title: "Threads & tasks", body: "Give agents ongoing jobs — not one-off prompts — and track everything they do." },
];

const STATS = [
  { value: "~1s", label: "work-push latency" },
  { value: "90%", label: "lower idle cost vs polling" },
  { value: "50+", label: "behavioral tests" },
  { value: "3", label: "agent frameworks supported" },
];

export default function Home() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6">
        <section className="pt-20 text-center">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-4 inline-block rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted"
          >
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-lime-400 align-middle shadow-[0_0_8px_rgba(163,230,53,0.8)]" />
            Mission control for autonomous agents
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="mx-auto max-w-3xl text-balance text-5xl font-bold leading-tight tracking-tight"
          >
            Control every agent you run —{" "}
            <span className="text-accent text-glow-accent">from one panel</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16 }}
            className="mx-auto mt-6 max-w-2xl text-lg text-muted"
          >
            Hermes, OpenClaw, Goose, or your own CLI — deploy agents anywhere,
            connect them here, and give them ongoing jobs with guardrails.
            Watch everything they do live.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.24 }}
            className="mt-8 flex justify-center gap-3"
          >
            <SignedOut>
              <SignUpButton mode="modal">
                <button className="rounded-lg bg-accent px-6 py-3 font-medium text-white shadow-[0_0_20px_rgba(255,91,4,0.4)] transition hover:brightness-110">
                  Start free
                </button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <Link
                href="/dashboard"
                className="rounded-lg bg-accent px-6 py-3 font-medium text-white shadow-[0_0_20px_rgba(255,91,4,0.4)] transition hover:brightness-110"
              >
                Open dashboard
              </Link>
            </SignedIn>
            <Link
              href="/features"
              className="rounded-lg border border-border px-6 py-3 font-medium text-muted transition hover:border-muted hover:text-foreground"
            >
              See features
            </Link>
          </motion.div>
        </section>

        {/* Instrument-panel preview */}
        <section className="py-16">
          <Reveal>
            <div className="rounded-2xl border border-border bg-surface p-2 shadow-2xl">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <span className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white">
                  Overview
                </span>
                <span className="px-3 py-1 text-xs text-muted">Device log</span>
                <span className="px-3 py-1 text-xs text-muted">Configuration</span>
                <span className="px-3 py-1 text-xs text-muted">Rules</span>
                <Pulse className="ml-auto">
                  <span className="rounded-lg border border-accent/40 px-3 py-1 text-xs text-accent">
                    Live
                  </span>
                </Pulse>
              </div>
              <Stagger className="grid gap-2 p-2 sm:grid-cols-2 lg:grid-cols-4">
                {DIALS.map((d) => (
                  <StaggerItem
                    key={d.label}
                    className="rounded-xl border border-border bg-background p-4"
                  >
                    <p className="text-sm">{d.label}</p>
                    <p className="mt-0.5 text-xs text-muted">Last update: now</p>
                    <div className="mt-3 flex justify-center">
                      <RingGauge value={d.value} unit={d.unit} color={d.color} pct={d.pct} size={100} />
                    </div>
                    <AreaSpark data={[...d.data]} color={d.color} height={64} axis={["00", "06", "12", "18", "24"]} className="mt-3" />
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </Reveal>
        </section>

        {/* Stats band */}
        <section className="pb-8">
          <Stagger className="grid gap-4 rounded-2xl border border-border bg-surface p-8 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((s) => (
              <StaggerItem key={s.label} className="text-center">
                <p className="text-4xl font-bold text-accent text-glow-accent">{s.value}</p>
                <p className="mt-1 text-sm text-muted">{s.label}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        {/* Feature grid */}
        <section className="py-16">
          <Reveal className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Everything an agent fleet needs
            </h2>
            <p className="mt-3 text-muted">
              Not a chat wrapper — an operations layer for ongoing autonomous work.
            </p>
          </Reveal>
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <StaggerItem key={f.title}>
                <Lift className="h-full rounded-2xl border border-border bg-surface p-6 transition hover:border-accent/40">
                  <f.icon className="mb-3 h-6 w-6 text-accent" />
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted">{f.body}</p>
                </Lift>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        {/* Frameworks band */}
        <section className="pb-16">
          <Reveal>
            <div className="rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/10 to-transparent p-10 text-center">
              <Cable className="mx-auto mb-3 h-6 w-6 text-accent" />
              <h2 className="text-2xl font-bold">Bring any agent framework</h2>
              <p className="mx-auto mt-2 max-w-xl text-muted">
                First-class adapters for <span className="text-foreground">Hermes</span>,{" "}
                <span className="text-foreground">OpenClaw</span>, and{" "}
                <span className="text-foreground">Goose</span> — plus a generic CLI
                adapter for anything that takes an instruction and prints a result.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
                {["hermes", "openclaw", "goose", "any CLI"].map((f) => (
                  <span key={f} className="rounded-lg border border-border bg-surface px-4 py-2 lowercase">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* CTA */}
        <section className="pb-24 text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight">
              Put your agents to work
            </h2>
            <p className="mt-3 text-muted">Free for 3 agents. No card required.</p>
            <div className="mt-6 flex justify-center gap-3">
              <SignedOut>
                <SignUpButton mode="modal">
                  <button className="rounded-lg bg-accent px-6 py-3 font-medium text-white shadow-[0_0_20px_rgba(255,91,4,0.4)] transition hover:brightness-110">
                    Start free
                  </button>
                </SignUpButton>
              </SignedOut>
              <SignedIn>
                <Link
                  href="/dashboard"
                  className="rounded-lg bg-accent px-6 py-3 font-medium text-white shadow-[0_0_20px_rgba(255,91,4,0.4)] transition hover:brightness-110"
                >
                  Open dashboard
                </Link>
              </SignedIn>
              <Link
                href="/pricing"
                className="rounded-lg border border-border px-6 py-3 font-medium text-muted transition hover:border-muted hover:text-foreground"
              >
                View pricing
              </Link>
            </div>
          </Reveal>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
