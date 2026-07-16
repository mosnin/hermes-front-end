"use client";

import Link from "next/link";
import { SignedIn, SignedOut, SignUpButton } from "@clerk/nextjs";
import { motion } from "motion/react";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";
import { BentoTile } from "@/components/marketing/bento-tile";
import { AsciiPanel, TermLine, Cursor, AsciiRule } from "@/components/marketing/ascii";
import {
  ChipGraphic,
  MeshGraphic,
  OrbitGraphic,
  WaveGraphic,
  ShieldGraphic,
  PlugGraphic,
  KnowledgeGraphic,
  TasksGraphic,
} from "@/components/marketing/graphics";

const STATS = [
  { value: "~1s", label: "work push latency" },
  { value: "90%", label: "lower idle cost" },
  { value: "66", label: "behavioral tests" },
  { value: "3", label: "agent frameworks" },
];

export default function Home() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 sm:px-6">
        {/* Hero */}
        <section className="grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 font-mono text-xs text-muted"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-lime-400 shadow-[0_0_8px_rgba(163,230,53,0.8)]" />
              mission control for autonomous agents
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.06 }}
              className="text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
            >
              Run every agent
              <br />
              from{" "}
              <span className="text-accent text-glow-accent">one panel</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.14 }}
              className="mt-6 max-w-xl text-base text-muted sm:text-lg"
            >
              Hermes, OpenClaw, Goose, or your own CLI. Deploy agents anywhere,
              connect them here, give them ongoing jobs with guardrails, and
              watch everything they do live.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.22 }}
              className="mt-8 flex flex-col gap-3 sm:flex-row"
            >
              <SignedOut>
                <SignUpButton mode="modal">
                  <button className="rounded-lg bg-accent px-6 py-3 font-medium text-white shadow-[0_0_20px_rgba(255,91,4,0.4)] transition hover:brightness-110 active:scale-[0.98]">
                    Start free
                  </button>
                </SignUpButton>
              </SignedOut>
              <SignedIn>
                <Link
                  href="/dashboard"
                  className="rounded-lg bg-accent px-6 py-3 text-center font-medium text-white shadow-[0_0_20px_rgba(255,91,4,0.4)] transition hover:brightness-110"
                >
                  Open dashboard
                </Link>
              </SignedIn>
              <Link
                href="/features"
                className="rounded-lg border border-border px-6 py-3 text-center font-medium text-muted transition hover:border-muted hover:text-foreground"
              >
                See features
              </Link>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15 }}
          >
            <AsciiPanel path="~/hermes/connect" glow>
              <TermLine>hermes connect --framework goose</TermLine>
              <TermLine prompt=">" accent>
                agent &quot;scout&quot; registered
              </TermLine>
              <TermLine prompt=">" accent>
                token issued, heartbeat online
              </TermLine>
              <TermLine>hermes run outreach --ongoing</TermLine>
              <TermLine prompt=">" accent>
                find contacts, email, book demos
              </TermLine>
              <p className="mt-1 flex gap-2">
                <span className="select-none text-accent">$</span>
                <span className="text-muted">
                  watching fleet
                  <Cursor />
                </span>
              </p>
            </AsciiPanel>
          </motion.div>
        </section>

        {/* Bento feature grid */}
        <section className="pb-6">
          <div className="mb-6 flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-widest text-muted">
              capabilities
            </span>
            <AsciiRule className="flex-1" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
            {/* Big: any framework / chip */}
            <BentoTile
              className="md:col-span-3 lg:col-span-3"
              title="Bring any agent framework"
              body="Hermes runs natively. OpenClaw and Goose plug in through first-class adapters. Anything with a command line joins through the generic CLI adapter."
              graphic={<ChipGraphic className="max-h-40" />}
            />
            {/* A2A mesh */}
            <BentoTile
              className="md:col-span-3 lg:col-span-3"
              title="Agent to agent, done right"
              body="Spec-conformant A2A with at-least-once delivery, loop detection, and rate guards so your fleet coordinates without spiraling."
              graphic={<MeshGraphic className="max-h-40" />}
            />
            {/* Orchestration */}
            <BentoTile
              className="md:col-span-2"
              title="Orchestration that survives reality"
              body="Multi-step workflows with retries, backoff, approvals, and dead-letter replay."
              graphic={<OrbitGraphic className="max-h-36" />}
            />
            {/* Real-time */}
            <BentoTile
              className="md:col-span-2"
              title="Real-time, not real-expensive"
              body="One held connection pushes work in under a second and backs off when idle."
              graphic={<WaveGraphic className="max-h-36" />}
            />
            {/* Governance */}
            <BentoTile
              className="md:col-span-2"
              title="Governance you can sign"
              body="Kill switch, shadow mode, budgets that auto-pause, tamper-evident audit."
              graphic={<ShieldGraphic className="max-h-36" />}
            />
            {/* Integrations */}
            <BentoTile
              className="md:col-span-2"
              title="MCP and integrations"
              body="Assign MCP servers to agents; bridge Slack, Telegram, and Discord both ways."
              graphic={<PlugGraphic className="max-h-36" />}
            />
            {/* Knowledge */}
            <BentoTile
              className="md:col-span-2"
              title="Skills and memory"
              body="Vector-searched skills and Space memory ground every response."
              graphic={<KnowledgeGraphic className="max-h-36" />}
            />
            {/* Tasks */}
            <BentoTile
              className="md:col-span-2"
              title="Ongoing jobs, not one-offs"
              body="Give agents threads of work and track everything they do."
              graphic={<TasksGraphic className="max-h-36" />}
            />
          </div>
        </section>

        {/* Stats */}
        <section className="py-14">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="bg-surface p-6 text-center sm:p-8">
                <p className="text-3xl font-bold text-accent text-glow-accent sm:text-4xl">
                  {s.value}
                </p>
                <p className="mt-1 font-mono text-xs text-muted">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Frameworks */}
        <section className="pb-16">
          <div className="rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/10 to-transparent p-8 text-center sm:p-12">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              One control plane. Every framework.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted">
              Point any agent at Cadre and it becomes a managed member of your
              fleet, with the same guardrails, metering, and observability.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2 font-mono text-sm">
              {["hermes", "openclaw", "goose", "any cli"].map((f) => (
                <span
                  key={f}
                  className="rounded-lg border border-border bg-surface px-4 py-2 lowercase"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="pb-24 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Put your agents to work
          </h2>
          <p className="mt-3 text-muted">Free for 3 agents. No card required.</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
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
                className="rounded-lg bg-accent px-6 py-3 text-center font-medium text-white shadow-[0_0_20px_rgba(255,91,4,0.4)] transition hover:brightness-110"
              >
                Open dashboard
              </Link>
            </SignedIn>
            <Link
              href="/pricing"
              className="rounded-lg border border-border px-6 py-3 text-center font-medium text-muted transition hover:border-muted hover:text-foreground"
            >
              View pricing
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
