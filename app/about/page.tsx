"use client";

import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";
import { Reveal, Stagger, StaggerItem } from "@/components/marketing/motion";

const PRINCIPLES = [
  {
    title: "Ongoing beats one-off",
    body: "Most agent tools demo a single prompt and call it autonomy. Real value is an agent that runs a job for weeks (outreach, monitoring, operations) and keeps receipts.",
  },
  {
    title: "Autonomy needs brakes",
    body: "A fleet you can't stop isn't a product, it's a liability. Kill switch, shadow mode, budgets that pause on real spend. Governance is the feature, not the fine print.",
  },
  {
    title: "If it isn't observable, it didn't happen",
    body: "Every action lands in an immutable work record. Failures are captured with traces. The audit log exports as a hash chain an auditor can verify without trusting us.",
  },
  {
    title: "Your compute, your models",
    body: "Agents run on your infrastructure with your API keys. We orchestrate; we don't meter your intelligence.",
  },
];

const TIMELINE = [
  { when: "Phase 1", what: "Multi-agent registry, threads, tasks, skills with vector search." },
  { when: "Phase 2", what: "A2A broker with guardrails; workflow engine with retries and approvals." },
  { when: "Phase 3", what: "Real-time push transport; O(1) metering; dead-letter + watchdog reliability." },
  { when: "Phase 4", what: "Plan enforcement, Stripe billing, SSO/SCIM path, tamper-evident audit." },
  { when: "Now", what: "OpenClaw, Goose, and generic CLI framework adapters. Any agent, one panel." },
];

export default function AboutPage() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 sm:px-6">
        <section className="pt-20 pb-14 text-center">
          <Reveal>
            <h1 className="mx-auto max-w-2xl text-balance text-4xl font-bold tracking-tight">
              We build the panel that keeps{" "}
              <span className="text-accent text-glow-accent">autonomous companies</span>{" "}
              honest
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-muted">
              Agents are cheap now. Trustworthy, ongoing, observable agent
              operations are not. Cadre is the missing layer
              between "it ran once in a demo" and "it runs the department."
            </p>
          </Reveal>
        </section>

        <section className="pb-16">
          <Stagger className="grid gap-4 sm:grid-cols-2">
            {PRINCIPLES.map((p, i) => (
              <StaggerItem
                key={p.title}
                className="rounded-2xl border border-border bg-surface p-7"
              >
                <p className="mb-3 font-mono text-sm text-accent">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h2 className="font-semibold">{p.title}</h2>
                <p className="mt-2 text-sm text-muted">{p.body}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        <section className="pb-20">
          <Reveal className="mb-8">
            <h2 className="text-2xl font-bold">How we got here</h2>
          </Reveal>
          <div className="space-y-0">
            {TIMELINE.map((t, i) => (
              <Reveal key={t.when} delay={i * 0.04}>
                <div className="flex gap-5 border-l border-border pl-6 pb-8 last:pb-0">
                  <span className="-ml-[31px] mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-accent shadow-[0_0_8px_rgba(255,91,4,0.7)]" />
                  <div>
                    <p className="text-xs uppercase tracking-wider text-accent">{t.when}</p>
                    <p className="mt-1 text-sm text-muted">{t.what}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="pb-24 text-center">
          <Reveal>
            <Link
              href="/contact"
              className="rounded-lg bg-accent px-6 py-3 font-medium text-white shadow-[0_0_20px_rgba(255,91,4,0.4)] transition hover:brightness-110"
            >
              Talk to us
            </Link>
          </Reveal>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
