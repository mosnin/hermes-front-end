"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ImagePlaceholder } from "@/components/site/painting";

/* ---------------------------------------------------------------------------
   About. Editorial headline, short prose, a numbered principles list with
   hairline separators (ported from the previous app/about/page.tsx), a team
   row of four portrait placeholders, and a closing CTA. The prior page had
   no Clerk SignUpButton, so the closing CTA links to /pricing.
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

const PRINCIPLES = [
  {
    title: "Ongoing beats one-off",
    body: "Most agent tools demo a single prompt and call it autonomy. Real value is an agent that runs a job for weeks, outreach, monitoring, operations, and keeps receipts the whole way.",
  },
  {
    title: "Autonomy needs brakes",
    body: "A fleet you can't stop isn't a product, it's a liability. Kill switch, shadow mode, budgets that pause on real spend. Governance is the feature, not the fine print.",
  },
  {
    title: "If it isn't observable, it didn't happen",
    body: "Every action lands in an immutable work record, and failures are captured with traces. The audit log exports as a hash chain an auditor can verify without trusting us.",
  },
];

const TEAM = [
  { name: "Founding engineer", role: "Orchestration engine" },
  { name: "Founding engineer", role: "Governance and guardrails" },
  { name: "Founding engineer", role: "Integrations and adapters" },
  { name: "Founding engineer", role: "Platform and reliability" },
];

export default function AboutPage() {
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-[1060px] px-5 pb-16 pt-24 sm:px-7 sm:pt-32">
        <Rise>
          <h1 className="max-w-[820px] text-[44px] font-medium leading-[1.06] tracking-[-0.015em] text-[var(--site-ink)] sm:text-[64px]">
            The panel that keeps autonomous companies honest
          </h1>
        </Rise>
        <Rise delay={0.1}>
          <div className="mt-8 max-w-[640px] space-y-5 text-[17px] leading-relaxed text-[var(--site-body)]">
            <p>
              Agents are cheap now. Trustworthy, ongoing, observable agent
              operations are not. Cadre is the missing layer between &ldquo;it
              ran once in a demo&rdquo; and &ldquo;it runs the department.&rdquo;
            </p>
            <p>
              We started with a control plane, not another agent framework.
              Hermes runs natively, OpenClaw and Goose plug in through
              first-class adapters, and anything with a command line joins
              through the generic CLI adapter. One panel, any agent.
            </p>
            <p>
              Every decision the fleet makes lands in a record you can
              inspect, export, and hand to an auditor. That discipline is
              what turns a demo into infrastructure a company can run on.
            </p>
          </div>
        </Rise>
      </section>

      {/* Principles */}
      <section className="mx-auto max-w-[1060px] px-5 pb-24 sm:px-7">
        <div className="border-t border-[var(--site-line)]">
          {PRINCIPLES.map((p, i) => (
            <Rise key={p.title} delay={i * 0.06}>
              <div className="grid gap-3 border-b border-[var(--site-line)] py-9 sm:grid-cols-[80px_1fr] sm:gap-8">
                <p className="font-mono text-[14px] text-[#a3a09a]">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <div className="max-w-[560px]">
                  <h2 className="text-[18px] font-medium text-[var(--site-ink)]">
                    {p.title}
                  </h2>
                  <p className="mt-2.5 text-[15.5px] leading-relaxed text-[var(--site-body)]">
                    {p.body}
                  </p>
                </div>
              </div>
            </Rise>
          ))}
        </div>
      </section>

      {/* Team */}
      <section className="bg-[var(--site-band)] py-20">
        <div className="mx-auto max-w-[1060px] px-5 sm:px-7">
          <Rise>
            <h2 className="text-[34px] font-medium tracking-[-0.01em] text-[var(--site-ink)] sm:text-[40px]">
              The people building it
            </h2>
          </Rise>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TEAM.map((t, i) => (
              <Rise key={`${t.name}-${i}`} delay={i * 0.06}>
                <ImagePlaceholder label="Portrait" className="aspect-[0.85] rounded-[20px]" />
                <p className="mt-4 text-[15.5px] font-medium text-[var(--site-ink)]">{t.name}</p>
                <p className="mt-1 text-[13.5px] text-[var(--site-body)]">{t.role}</p>
              </Rise>
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
            <Link
              href="/pricing"
              className="rounded-full bg-[#1f1f1c] px-6 py-3 text-[15px] font-medium text-white transition hover:bg-black"
            >
              Get started
            </Link>
          </div>
        </Rise>
      </section>
    </main>
  );
}
