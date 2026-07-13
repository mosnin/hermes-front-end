"use client";

import Link from "next/link";
import { SignedIn, SignedOut, SignUpButton } from "@clerk/nextjs";
import { Check } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";
import { Reveal, Stagger, StaggerItem, Lift } from "@/components/marketing/motion";
import { cn } from "@/lib/utils";

// Mirrors convex/lib/plans.ts PLAN_LIMITS — the server enforces these numbers.
const TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    blurb: "Kick the tires with a small crew.",
    features: [
      "3 agents",
      "5 workflows",
      "Real-time transport",
      "A2A with delivery guarantees",
      "Guardrails & kill switch",
      "Community support",
    ],
    cta: "Start free",
    highlight: false,
  },
  {
    name: "Team",
    price: "$49",
    period: "/ space / month",
    blurb: "For teams running real ongoing jobs.",
    features: [
      "25 agents · 100 workflows",
      "Chat bridges (Slack / Telegram / Discord)",
      "Public REST API (10 keys)",
      "Campaigns & agent evals",
      "Per-tenant SLOs & error traces",
      "Priority email support",
    ],
    cta: "Upgrade to Team",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "annual",
    blurb: "Governance your security team will sign.",
    features: [
      "Unlimited agents & workflows",
      "SSO / SAML + SCIM provisioning",
      "Tamper-evident audit export",
      "Token-accurate spend metering",
      "Custom guardrail policies",
      "Dedicated support",
    ],
    cta: "Talk to us",
    highlight: false,
  },
];

const FAQ = [
  {
    q: "Do you run my agents' compute?",
    a: "No — agents run on your infrastructure (AWS, GCP, a laptop, anywhere). You pay your own compute and LLM tokens; the platform is the communication and orchestration layer.",
  },
  {
    q: "Which agent frameworks are supported?",
    a: "Hermes natively, OpenClaw and Goose via first-class adapters, and anything with a command-line interface via the generic CLI adapter.",
  },
  {
    q: "Are the plan limits enforced?",
    a: "Yes — server-side. The numbers on this page are the same constants the backend enforces at every create path.",
  },
  {
    q: "How do budgets work?",
    a: "Agents report real token usage per call. When a Space crosses its monthly budget, autonomy auto-pauses — no human required, no runaway bills.",
  },
  {
    q: "Can other companies see my data?",
    a: "Every row is scoped to your organization and Space, enforced on every query — with behavioral tests proving cross-tenant reads are refused.",
  },
];

export default function PricingPage() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6">
        <section className="pt-20 pb-12 text-center">
          <Reveal>
            <h1 className="text-4xl font-bold tracking-tight">
              Pay for the panel, <span className="text-accent text-glow-accent">not the compute</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-muted">
              Your agents run on your infrastructure. Plans meter the control
              plane — and the limits are enforced server-side.
            </p>
          </Reveal>
        </section>

        <Stagger className="grid gap-4 pb-16 lg:grid-cols-3">
          {TIERS.map((t) => (
            <StaggerItem key={t.name}>
              <Lift
                className={cn(
                  "flex h-full flex-col rounded-2xl border bg-surface p-7",
                  t.highlight
                    ? "border-accent/60 shadow-[0_0_32px_rgba(255,91,4,0.12)]"
                    : "border-border",
                )}
              >
                {t.highlight && (
                  <span className="mb-3 self-start rounded-md bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                    Most popular
                  </span>
                )}
                <h2 className="text-lg font-semibold">{t.name}</h2>
                <p className="mt-1 text-sm text-muted">{t.blurb}</p>
                <p className="mt-4 text-4xl font-bold">
                  {t.price}
                  <span className="ml-1 text-sm font-normal text-muted">{t.period}</span>
                </p>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-7">
                  {t.name === "Enterprise" ? (
                    <Link
                      href="/contact"
                      className="block rounded-lg border border-border px-4 py-2.5 text-center text-sm font-medium transition hover:border-muted"
                    >
                      {t.cta}
                    </Link>
                  ) : (
                    <>
                      <SignedOut>
                        <SignUpButton mode="modal">
                          <button
                            className={cn(
                              "w-full rounded-lg px-4 py-2.5 text-sm font-medium transition",
                              t.highlight
                                ? "bg-accent text-white shadow-[0_0_16px_rgba(255,91,4,0.35)] hover:brightness-110"
                                : "border border-border hover:border-muted",
                            )}
                          >
                            {t.cta}
                          </button>
                        </SignUpButton>
                      </SignedOut>
                      <SignedIn>
                        <Link
                          href="/dashboard/billing"
                          className={cn(
                            "block rounded-lg px-4 py-2.5 text-center text-sm font-medium transition",
                            t.highlight
                              ? "bg-accent text-white shadow-[0_0_16px_rgba(255,91,4,0.35)] hover:brightness-110"
                              : "border border-border hover:border-muted",
                          )}
                        >
                          {t.cta}
                        </Link>
                      </SignedIn>
                    </>
                  )}
                </div>
              </Lift>
            </StaggerItem>
          ))}
        </Stagger>

        <section className="pb-24">
          <Reveal className="mb-8 text-center">
            <h2 className="text-2xl font-bold">Questions, answered straight</h2>
          </Reveal>
          <div className="mx-auto max-w-3xl space-y-3">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={i * 0.03}>
                <details className="group rounded-xl border border-border bg-surface p-5">
                  <summary className="cursor-pointer list-none text-sm font-medium marker:hidden">
                    {f.q}
                  </summary>
                  <p className="mt-3 text-sm text-muted">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
