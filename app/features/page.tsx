"use client";

import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";
import { BentoTile } from "@/components/marketing/bento-tile";
import { AsciiRule } from "@/components/marketing/ascii";
import { Reveal } from "@/components/marketing/motion";
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

const PILLARS = [
  {
    id: "orchestration",
    graphic: OrbitGraphic,
    title: "Orchestration that survives reality",
    body: "Multi-step, multi-agent workflows with dependency chaining, so each step receives the outputs of the steps it depends on. Retries with backoff, step timeouts, a stuck-run watchdog, and a dead-letter queue with one-click replay.",
    points: ["Data flows between steps", "Backoff and timeouts", "Dead-letter replay", "Human approval gates"],
  },
  {
    id: "a2a",
    graphic: MeshGraphic,
    title: "Agent to agent, done properly",
    body: "Spec-conformant A2A with Agent Cards, JSON-RPC, and streaming. Internally, messages are delivered at least once, unacked deliveries requeue automatically, with loop detection and rate limits standing guard.",
    points: ["At-least-once delivery", "Loop detection in O(1)", "Per-minute rate guards", "External A2A by card URL"],
  },
  {
    id: "realtime",
    graphic: WaveGraphic,
    title: "Real-time, not real-expensive",
    body: "One held connection replaces polling storms. Work is pushed to agents in about a second and burst-drained when busy, while idle agents back off automatically, cutting idle cost by roughly 90 percent.",
    points: ["~1s push latency", "250ms burst drain", "Adaptive idle backoff", "Token streaming into the UI"],
  },
  {
    id: "governance",
    graphic: ShieldGraphic,
    title: "Governance an enterprise can sign",
    body: "A kill switch that actually stops everything. Shadow mode that proposes instead of executes. Budgets metered on real token spend that auto-pause the fleet. A hash-chained, tamper-evident audit export any auditor can verify offline.",
    points: ["Kill switch and shadow mode", "Budgets on real spend", "Tamper-evident audit", "RBAC viewer to owner"],
  },
  {
    id: "frameworks",
    graphic: ChipGraphic,
    title: "Any agent framework",
    body: "Hermes agents connect natively. OpenClaw and Goose run through first-class adapters. Anything else that takes an instruction on the command line and prints a result becomes a managed fleet member through the generic CLI adapter.",
    points: ["Hermes native runtime", "OpenClaw adapter", "Goose adapter", "Generic CLI adapter"],
  },
  {
    id: "integrations",
    graphic: PlugGraphic,
    title: "MCP servers and integrations",
    body: "Assign MCP servers to agents and they use those tools in a real multi-step tool loop. Bridge conversations to Slack, Telegram, and Discord both ways, and execute Composio toolkits.",
    points: ["Per-agent MCP assignment", "Multi-step tool use", "Slack, Telegram, Discord", "Composio toolkits"],
  },
];

const EXTRAS = [
  { graphic: KnowledgeGraphic, title: "Skills and memory", body: "Vector-searched skills and Space memory ground every agent response." },
  { graphic: TasksGraphic, title: "Ongoing jobs", body: "Give agents threads of work and track everything they do, not one-off prompts." },
];

export default function FeaturesPage() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 sm:px-6">
        <section className="pb-8 pt-16 text-center sm:pt-20">
          <Reveal>
            <h1 className="mx-auto max-w-2xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
              An operations layer for{" "}
              <span className="text-accent text-glow-accent">ongoing</span> agent work
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-muted">
              Not one-off prompts. Fleets with jobs, guardrails, and receipts.
            </p>
          </Reveal>
        </section>

        <section className="space-y-4 pb-6">
          {PILLARS.map((p) => {
            const G = p.graphic;
            return (
              <BentoTile key={p.id} className="!p-0">
                <div id={p.id} className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
                  <div className="aspect-video overflow-hidden rounded-xl border border-border bg-[#0c0c0c]">
                    <div className="grid h-full place-items-center p-6">
                      <G className="max-h-44" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">{p.title}</h2>
                    <p className="mt-3 text-muted">{p.body}</p>
                    <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                      {p.points.map((pt) => (
                        <li key={pt} className="flex items-center gap-2 text-sm">
                          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_rgba(255,91,4,0.7)]" />
                          {pt}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </BentoTile>
            );
          })}
        </section>

        <section className="pb-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-widest text-muted">also included</span>
            <AsciiRule className="flex-1" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {EXTRAS.map((e) => (
              <BentoTile key={e.title} title={e.title} body={e.body} graphic={<e.graphic className="max-h-36" />} />
            ))}
          </div>
        </section>

        <section className="pb-24 text-center">
          <Reveal>
            <Link
              href="/pricing"
              className="inline-block rounded-lg bg-accent px-6 py-3 font-medium text-white shadow-[0_0_20px_rgba(255,91,4,0.4)] transition hover:brightness-110"
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
