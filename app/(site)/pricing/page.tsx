"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { SignedIn, SignedOut, SignUpButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import {
  Reveal,
  Stagger,
  StaggerItem,
  TextReveal,
  CountUp,
  MagneticButton,
  EASE,
} from "@/components/site/motion";
import { RADIUS, TYPE_H1, TYPE_H2 } from "@/components/site/ui";

/* ---------------------------------------------------------------------------
   Pricing. Centered headline, three plan cards (middle emphasized on the
   beige card fill), FAQ as a two-column hairline list, closing CTA band.
   Plan copy ported from the previous app/pricing/page.tsx, which mirrors
   convex/lib/plans.ts PLAN_LIMITS. The server enforces these numbers. All
   reveal/stagger/count-up motion comes from Lane A's shared
   components/site/motion.tsx.
--------------------------------------------------------------------------- */

/** Renders a plan price; count-up animates plain "$N" prices, anything else
 *  (e.g. "Custom") renders as-is. */
function PriceTag({ price, className }: { price: string; className?: string }) {
  const match = /^\$(\d+)$/.exec(price);
  if (!match) {
    return <span className={className}>{price}</span>;
  }
  return <CountUp value={Number(match[1])} prefix="$" duration={1.1} className={className} />;
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
      <MagneticButton strength={0.24} range={8} className="!block w-full">
        <Link href="/contact" className={cls}>
          {tier.cta}
        </Link>
      </MagneticButton>
    );
  }

  return (
    <>
      <SignedOut>
        <SignUpButton mode="modal">
          <MagneticButton strength={0.24} range={8} className="!block w-full">
            <button className={cls}>{tier.cta}</button>
          </MagneticButton>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <MagneticButton strength={0.24} range={8} className="!block w-full">
          <Link href="/dashboard/billing" className={cls}>
            {tier.cta}
          </Link>
        </MagneticButton>
      </SignedIn>
    </>
  );
}

export default function PricingPage() {
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-[1060px] px-5 pb-16 pt-24 text-center sm:px-7 sm:pt-32">
        <h1 className={cn(TYPE_H1, "mx-auto text-[var(--site-ink)]")}>
          <TextReveal as="span" text="Pay for the panel," className="block" />
          <TextReveal as="span" text="not the compute" className="block" delay={0.2} />
        </h1>
        <Reveal delay={0.4}>
          <p className="mx-auto mt-6 max-w-[440px] text-[17px] leading-relaxed text-[var(--site-body)]">
            Your agents run on your infrastructure. Plans meter the control
            plane, and every limit is enforced server-side.
          </p>
        </Reveal>
      </section>

      {/* Plan cards */}
      <section className="mx-auto max-w-[1060px] px-5 pb-24 sm:px-7">
        <Stagger className="grid gap-5 lg:grid-cols-3" gap={0.1}>
          {TIERS.map((t) => (
            <StaggerItem key={t.name} y={22}>
              <motion.div
                whileHover={{ y: -5 }}
                transition={{ duration: 0.3, ease: EASE }}
                className={cn(
                  RADIUS.card,
                  "flex h-full flex-col p-7 transition-shadow duration-300",
                  t.highlight
                    ? "bg-[var(--site-card)] hover:shadow-[0_20px_40px_rgba(31,31,28,0.10)]"
                    : "bg-white ring-1 ring-inset ring-[var(--site-line)] hover:shadow-[0_20px_40px_rgba(31,31,28,0.06)]",
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
                  <PriceTag price={t.price} />
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
              </motion.div>
            </StaggerItem>
          ))}
        </Stagger>

        {/* Cadre Cloud add-on */}
        <Reveal>
          <div className={cn(RADIUS.card, "mt-6 flex flex-col gap-6 bg-white p-7 ring-1 ring-inset ring-[var(--site-line)] sm:flex-row sm:items-center sm:justify-between")}>
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
              <MagneticButton strength={0.26} range={8} className="mt-4 inline-block">
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--site-line)] bg-white px-4 py-2 text-[14px] font-medium text-[var(--site-ink)] transition hover:border-[#d6d4cd]"
                >
                  Get early access
                </Link>
              </MagneticButton>
            </div>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="border-t border-[var(--site-line)] bg-[var(--site-band)] py-20">
        <div className="mx-auto max-w-[1060px] px-5 sm:px-7">
          <Reveal className="text-center">
            <h2 className={TYPE_H2}>Questions, answered straight</h2>
          </Reveal>
          <div className="mt-14 grid gap-x-14 sm:grid-cols-2">
            {[FAQ.slice(0, 4), FAQ.slice(4)].map((col, colIdx) => (
              <Stagger
                key={colIdx}
                gap={0.07}
                className="divide-y divide-[var(--site-line)] border-t border-[var(--site-line)]"
              >
                {col.map((f) => (
                  <StaggerItem key={f.q} y={14} className="py-7">
                    <h3 className="text-[15.5px] font-medium text-[var(--site-ink)]">{f.q}</h3>
                    <p className="mt-2.5 text-[14.5px] leading-relaxed text-[var(--site-body)]">{f.a}</p>
                  </StaggerItem>
                ))}
              </Stagger>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-[1060px] px-5 py-24 text-center sm:px-7">
        <Reveal>
          <h2 className={TYPE_H2}>Ready to run your fleet?</h2>
          <p className="mx-auto mt-3 max-w-[400px] text-[15.5px] leading-relaxed text-[var(--site-body)]">
            Start free, upgrade a Space when the work is real. No card
            required to try it out.
          </p>
          <div className="mt-8 flex items-center justify-center">
            <SignedOut>
              <SignUpButton mode="modal">
                <MagneticButton strength={0.28} range={10}>
                  <button className="rounded-full bg-[#1f1f1c] px-6 py-3 text-[15px] font-medium text-white transition hover:bg-black">
                    Get started
                  </button>
                </MagneticButton>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <MagneticButton strength={0.28} range={10}>
                <Link
                  href="/dashboard"
                  className="rounded-full bg-[#1f1f1c] px-6 py-3 text-[15px] font-medium text-white transition hover:bg-black"
                >
                  Open dashboard
                </Link>
              </MagneticButton>
            </SignedIn>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
