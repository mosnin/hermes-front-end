import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/nextjs";
import { Activity, Boxes, ListTodo, Plug, Sparkles, Workflow } from "lucide-react";
import { RingGauge } from "@/components/ui";

const features = [
  {
    icon: Boxes,
    title: "Multi-agent registry",
    body: "Connect Hermes agents deployed anywhere — AWS, GCP, or your laptop — and manage them all from one place.",
  },
  {
    icon: Activity,
    title: "Live activity",
    body: "See everything your agents do in real time: messages, tool calls, status, and errors as they happen.",
  },
  {
    icon: ListTodo,
    title: "Threads & tasks",
    body: "Give agents threads of work and track tasks on a board. Assign, prioritize, and follow through.",
  },
  {
    icon: Sparkles,
    title: "Skills with vector search",
    body: "Save reusable instructions and context. Find the right skill instantly with semantic search.",
  },
  {
    icon: Plug,
    title: "Integrations",
    body: "Wire in Slack, GitHub, and more so your agents act where your work already lives.",
  },
  {
    icon: Workflow,
    title: "Orchestration",
    body: "Compose multi-step, multi-agent workflows — easier than a terminal or a chat app.",
  },
];

const DIALS = [
  { label: "Agents online", value: 12, unit: "up", color: "green", pct: 0.92 },
  { label: "Run success", value: 98, unit: "%", color: "accent", pct: 0.98 },
  { label: "A2A msgs / min", value: 42, unit: "msg", color: "yellow", pct: 0.6 },
  { label: "Spend today", value: "$7", unit: "usd", color: "cyan", pct: 0.35 },
] as const;

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6">
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2 text-lg font-bold lowercase tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white shadow-[0_0_16px_rgba(255,91,4,0.45)]">
            ⬢
          </span>
          hermes
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="rounded-lg px-3 py-2 text-muted hover:text-foreground">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded-lg bg-accent px-4 py-2 font-medium text-white shadow-[0_0_16px_rgba(255,91,4,0.35)] hover:brightness-110">
                Get started
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="rounded-lg bg-accent px-4 py-2 font-medium text-white shadow-[0_0_16px_rgba(255,91,4,0.35)] hover:brightness-110"
            >
              Open dashboard
            </Link>
          </SignedIn>
        </nav>
      </header>

      <section className="pt-16 text-center">
        <p className="mb-4 inline-block rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-lime-400 align-middle shadow-[0_0_8px_rgba(163,230,53,0.8)]" />
          Mission control for autonomous agents
        </p>
        <h1 className="mx-auto max-w-3xl text-balance text-5xl font-bold leading-tight tracking-tight">
          Control every Hermes agent you run —{" "}
          <span className="text-accent text-glow-accent">from one panel</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
          Deploy your agents anywhere, connect them here, and give them threads,
          tasks, skills, and integrations. Watch everything they do live —
          easier than a terminal or a messaging app.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <SignedOut>
            <SignUpButton mode="modal">
              <button className="rounded-lg bg-accent px-6 py-3 font-medium text-white shadow-[0_0_20px_rgba(255,91,4,0.4)] hover:brightness-110">
                Start free
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="rounded-lg bg-accent px-6 py-3 font-medium text-white shadow-[0_0_20px_rgba(255,91,4,0.4)] hover:brightness-110"
            >
              Open dashboard
            </Link>
          </SignedIn>
        </div>
      </section>

      {/* Instrument-panel preview */}
      <section className="py-16">
        <div className="rounded-2xl border border-border bg-surface p-2 shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white">
              Overview
            </span>
            <span className="px-3 py-1 text-xs text-muted">Device log</span>
            <span className="px-3 py-1 text-xs text-muted">Configuration</span>
            <span className="px-3 py-1 text-xs text-muted">Rules</span>
            <span className="ml-auto rounded-lg border border-accent/40 px-3 py-1 text-xs text-accent">
              Live
            </span>
          </div>
          <div className="grid gap-2 p-2 sm:grid-cols-2 lg:grid-cols-4">
            {DIALS.map((d) => (
              <div
                key={d.label}
                className="rounded-xl border border-border bg-background p-4"
              >
                <p className="text-sm">{d.label}</p>
                <p className="mt-0.5 text-xs text-muted">Last update: now</p>
                <div className="mt-3 flex justify-center">
                  <RingGauge
                    value={d.value}
                    unit={d.unit}
                    color={d.color}
                    pct={d.pct}
                    size={104}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-border bg-surface p-6 transition hover:border-accent/40"
          >
            <f.icon className="mb-3 h-6 w-6 text-accent" />
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="flex items-center justify-between border-t border-border py-8 text-xs text-muted">
        <span className="lowercase">hermes control plane</span>
        <span>Convex · Clerk · A2A · MCP</span>
      </footer>
    </main>
  );
}
