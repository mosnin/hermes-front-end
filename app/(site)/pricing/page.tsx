"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { SignedIn, SignedOut, SignUpButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Pricing. Centered headline, three plan cards (middle emphasized on the
   beige card fill), FAQ as a two-column hairline list, closing CTA band.
   Plan copy ported from the previous app/pricing/page.tsx, which mirrors
   convex/lib/plans.ts PLAN_LIMITS. The server enforces these numbers.
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
      "Guardrails and kill switch",
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
      "Chat bridges (Slack, Telegram, Discord)",
      "Public REST API (10 keys)",
      "Campaigns and agent evals",
      "Per-tenant SLOs and error traces",
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
      "Unlimited agents and workflows",
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

const ADDON = {
  name: "Cadre Cloud",
  blurb: "Don't want to run agents yourself? We'll host them.",
  price: "from $X",
  period: "/ agent / month",
  features: [
    "Isolated container per agent, no servers to manage",
    "Bring your own keys (BYOK), your LLM bill, not ours",
    "Same guardrails, budgets, and audit trail as self-hosted",
  ],
};

const FAQ = [
  {
    q: "Do you run my agents' compute?",
    a: "By default, no. Agents run on your infrastructure, AWS, GCP, a laptop, anywhere, and you pay your own compute and LLM tokens. If you'd rather not host, the Cadre Cloud add-on runs them for you.",
  },
  {
    q: "Do I have to self-host my agents?",
    a: "No. Cadre Cloud runs agents for you on isolated containers we manage, no servers or setup on your end. Bring your own model keys and pay per hosted agent, on top of any plan.",
  },
  {
    q: "Which agent frameworks are supported?",
    a: "Hermes natively, OpenClaw and Goose via first-class adapters, and anything with a command-line interface via the generic CLI adapter.",
  },
  {
    q: "Are the plan limits enforced?",
    a: "Yes, server-side. The numbers on this page are the same constants the backend enforces at every create path.",
  },
  {
    q: "How do budgets work?",
    a: "Agents report real token usage per call. When a Space crosses its monthly budget, autonomy auto-pauses, with no human required and no runaway bills.",
  },
  {
    q: "Can other companies see my data?",
    a: "Every row is scoped to your organization and Space, enforced on every query, with behavioral tests proving cross-tenant reads are refused.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes. Upgrade or downgrade a Space at any time; the change takes effect on your next billing cycle with no migration required.",
  },
];

function CheckRow({ label }: { label: string }) {
  return (
    <li className="flex items-start gap-2.5 text-[14.5px] text-[var(--site-ink)]">
      <svg
        viewBox="0 0 16 16"
        className="mt-0.5 h-4 w-4 shrink-0 text-[#55534e]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
      >
        <path d="M3 8.5 6 11.5 13 4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </li>
  );
}

function PlanCTA({ tier }: { tier: (typeof TIERS)[number] }) {
  const cls =
    "block w-full rounded-full bg-[#1f1f1c] px-5 py-2.5 text-center text-[14.5px] font-medium text-white transition hover:bg-black";

  if (tier.name === "Enterprise") {
    return (
      <Link href="/contact" className={cls}>
        {tier.cta}
      </Link>
    );
  }

  return (
    <>
      <SignedOut>
        <SignUpButton mode="modal">
          <button className={cls}>{tier.cta}</button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <Link href="/dashboard/billing" className={cls}>
          {tier.cta}
        </Link>
      </SignedIn>
    </>
  );
}

export default function PricingPage() {
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-[1060px] px-5 pb-16 pt-24 text-center sm:px-7 sm:pt-32">
        <Rise>
          <h1 className="mx-auto text-[44px] font-medium leading-[1.06] tracking-[-0.015em] text-[var(--site-ink)] sm:text-[64px]">
            Pay for the panel,
            <br />
            not the compute
          </h1>
        </Rise>
        <Rise delay={0.1}>
          <p className="mx-auto mt-6 max-w-[440px] text-[17px] leading-relaxed text-[var(--site-body)]">
            Your agents run on your infrastructure. Plans meter the control
            plane, and every limit is enforced server-side.
          </p>
        </Rise>
      </section>

      {/* Plan cards */}
      <section className="mx-auto max-w-[1060px] px-5 pb-24 sm:px-7">
        <div className="grid gap-5 lg:grid-cols-3">
          {TIERS.map((t, i) => (
            <Rise key={t.name} delay={i * 0.06}>
              <div
                className={cn(
                  "flex h-full flex-col rounded-[24px] p-7",
                  t.highlight
                    ? "bg-[var(--site-card)]"
                    : "bg-white ring-1 ring-inset ring-[var(--site-line)]",
                )}
              >
                {t.highlight ? (
                  <span className="mb-4 inline-flex w-fit rounded-full bg-[#1f1f1c] px-3 py-1 text-[11.5px] font-medium uppercase tracking-wide text-white">
                    Most popular
                  </span>
                ) : (
                  <span className="mb-4 h-[26px]" aria-hidden />
                )}
                <h2 className="text-[16.5px] font-medium text-[var(--site-ink)]">{t.name}</h2>
                <p className="mt-1.5 text-[14px] text-[var(--site-body)]">{t.blurb}</p>
                <p className="mt-6 text-[38px] font-medium tracking-[-0.01em] text-[var(--site-ink)]">
                  {t.price}
                  <span className="ml-1.5 text-[14px] font-normal text-[var(--site-body)]">
                    {t.period}
                  </span>
                </p>
                <ul className="mt-7 flex-1 space-y-3">
                  {t.features.map((f) => (
                    <CheckRow key={f} label={f} />
                  ))}
                </ul>
                <div className="mt-8">
                  <PlanCTA tier={t} />
                </div>
              </div>
            </Rise>
          ))}
        </div>

        {/* Cadre Cloud add-on */}
        <Rise>
          <div className="mt-6 flex flex-col gap-6 rounded-[24px] bg-white p-7 ring-1 ring-inset ring-[var(--site-line)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="inline-flex rounded-full bg-[var(--site-band)] px-3 py-1 text-[11.5px] font-medium uppercase tracking-wide text-[#75726c]">
                Add-on
              </span>
              <h2 className="mt-3 text-[16.5px] font-medium text-[var(--site-ink)]">{ADDON.name}</h2>
              <p className="mt-1 text-[14px] text-[var(--site-body)]">{ADDON.blurb}</p>
              <ul className="mt-4 space-y-2.5">
                {ADDON.features.map((f) => (
                  <CheckRow key={f} label={f} />
                ))}
              </ul>
            </div>
            <div className="shrink-0 text-left sm:text-right">
              <p className="text-[30px] font-medium tracking-[-0.01em] text-[var(--site-ink)]">
                {ADDON.price}
                <span className="ml-1.5 text-[14px] font-normal text-[var(--site-body)]">
                  {ADDON.period}
                </span>
              </p>
              <Link
                href="/contact"
                className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--site-line)] bg-white px-4 py-2 text-[14px] font-medium text-[var(--site-ink)] transition hover:border-[#d6d4cd]"
              >
                Get early access
              </Link>
            </div>
          </div>
        </Rise>
      </section>

      {/* FAQ */}
      <section className="border-t border-[var(--site-line)] bg-[var(--site-band)] py-20">
        <div className="mx-auto max-w-[1060px] px-5 sm:px-7">
          <Rise className="text-center">
            <h2 className="text-[34px] font-medium tracking-[-0.01em] text-[var(--site-ink)] sm:text-[40px]">
              Questions, answered straight
            </h2>
          </Rise>
          <div className="mt-14 grid gap-x-14 sm:grid-cols-2">
            {[FAQ.slice(0, 4), FAQ.slice(4)].map((col, colIdx) => (
              <div key={colIdx} className="divide-y divide-[var(--site-line)] border-t border-[var(--site-line)]">
                {col.map((f, i) => (
                  <Rise key={f.q} delay={i * 0.06} className="py-7">
                    <h3 className="text-[15.5px] font-medium text-[var(--site-ink)]">{f.q}</h3>
                    <p className="mt-2.5 text-[14.5px] leading-relaxed text-[var(--site-body)]">{f.a}</p>
                  </Rise>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-[1060px] px-5 py-24 text-center sm:px-7">
        <Rise>
          <h2 className="text-[34px] font-medium tracking-[-0.01em] text-[var(--site-ink)] sm:text-[40px]">
            Ready to run your fleet?
          </h2>
          <p className="mx-auto mt-3 max-w-[400px] text-[15.5px] leading-relaxed text-[var(--site-body)]">
            Start free, upgrade a Space when the work is real. No card
            required to try it out.
          </p>
          <div className="mt-8 flex items-center justify-center">
            <SignedOut>
              <SignUpButton mode="modal">
                <button className="rounded-full bg-[#1f1f1c] px-6 py-3 text-[15px] font-medium text-white transition hover:bg-black">
                  Get started
                </button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <Link
                href="/dashboard"
                className="rounded-full bg-[#1f1f1c] px-6 py-3 text-[15px] font-medium text-white transition hover:bg-black"
              >
                Open dashboard
              </Link>
            </SignedIn>
          </div>
        </Rise>
      </section>
    </main>
  );
}
