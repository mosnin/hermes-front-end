"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ImagePlaceholder } from "@/components/site/painting";
import { DarkPill, RADIUS, TYPE_H1, TYPE_H2 } from "@/components/site/ui";
import { Reveal, Stagger, StaggerItem, TextReveal, Parallax, EASE } from "@/components/site/motion";

/* ---------------------------------------------------------------------------
   About. Editorial headline, short prose, a numbered principles list with
   hairline separators (ported from the previous app/about/page.tsx), a team
   row of four portrait placeholders, and a closing CTA. The prior page had
   no Clerk SignUpButton, so the closing CTA links to /pricing. Now wired
   through Lane A's shared motion.tsx primitives: a word-by-word TextReveal
   headline, Stagger cascades for the principles list and team row (replacing
   the page-local per-item delay math), and a magnetic closing CTA.
--------------------------------------------------------------------------- */

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
        <h1 className={cn(TYPE_H1, "max-w-[820px] text-[var(--site-ink)]")}>
          <TextReveal text="The panel that keeps autonomous companies honest" as="span" />
        </h1>
        <Reveal delay={0.15}>
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
        </Reveal>
      </section>

      {/* Principles */}
      <section className="mx-auto max-w-[1060px] px-5 pb-24 sm:px-7">
        <Stagger className="border-t border-[var(--site-line)]" gap={0.1}>
          {PRINCIPLES.map((p, i) => (
            <StaggerItem key={p.title}>
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
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Team */}
      <section className="bg-[var(--site-band)] py-20">
        <div className="mx-auto max-w-[1060px] px-5 sm:px-7">
          <Reveal>
            <h2 className={TYPE_H2}>The people building it</h2>
          </Reveal>
          <Stagger className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4" gap={0.07}>
            {TEAM.map((t, i) => (
              <StaggerItem key={`${t.name}-${i}`}>
                <motion.div
                  whileHover={{ y: -4 }}
                  transition={{ duration: 0.25, ease: EASE }}
                >
                  <Parallax offset={14} direction={i % 2 === 0 ? "up" : "down"}>
                    <ImagePlaceholder label="Portrait" className={cn("aspect-[0.85]", RADIUS.image)} />
                  </Parallax>
                  <p className="mt-4 text-[15.5px] font-medium text-[var(--site-ink)]">{t.name}</p>
                  <p className="mt-1 text-[13.5px] text-[var(--site-body)]">{t.role}</p>
                </motion.div>
              </StaggerItem>
            ))}
          </Stagger>
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
            <DarkPill href="/pricing">Get started</DarkPill>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
