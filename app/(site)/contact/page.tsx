"use client";

import { motion } from "motion/react";
import { DarkPill } from "@/components/site/ui";

/* ---------------------------------------------------------------------------
   Contact. Two columns: left is a headline, short copy, and a black pill
   mailto link; right is a quiet band card listing sales, support, and
   security contact rows, each with a thin inline icon and address.
   sales@ and support@ addresses ported from the previous
   app/contact/page.tsx CHANNELS list.
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

function SalesIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path
        d="M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v9A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5v-9Z"
        strokeLinejoin="round"
      />
      <path d="M3.5 5.5 10 10.5l6.5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SupportIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="10" cy="10" r="6.75" />
      <path d="M7.5 12.3a3 3 0 0 1 5 0" strokeLinecap="round" />
      <circle cx="7.9" cy="8.6" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="12.1" cy="8.6" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SecurityIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path
        d="M10 3.2 15.8 5.4v4.1c0 3.5-2.4 6.1-5.8 7.3-3.4-1.2-5.8-3.8-5.8-7.3V5.4L10 3.2Z"
        strokeLinejoin="round"
      />
      <path d="M7.6 10 9.3 11.7 12.6 8.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ROWS = [
  {
    icon: SalesIcon,
    label: "Sales",
    body: "SSO/SAML, SCIM, custom guardrail policies, annual agreements.",
    email: "sales@cadre.to",
  },
  {
    icon: SupportIcon,
    label: "Support",
    body: "Stuck connecting an agent, a workflow misbehaving, billing questions.",
    email: "support@cadre.to",
  },
  {
    icon: SecurityIcon,
    label: "Security",
    body: "Vulnerability reports, audit questions, compliance requests.",
    email: "security@cadre.to",
  },
];

export default function ContactPage() {
  return (
    <main>
      <section className="mx-auto max-w-[1060px] px-5 py-24 sm:px-7 sm:py-32">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left: headline, copy, mailto pill */}
          <Rise>
            <h1 className="text-[44px] font-medium leading-[1.06] tracking-[-0.015em] text-[var(--site-ink)] sm:text-[56px]">
              Tell us what your
              <br />
              fleet needs to do
            </h1>
            <p className="mt-6 max-w-[420px] text-[17px] leading-relaxed text-[var(--site-body)]">
              A human reads every message. Whether you are wiring up a first
              agent or rolling out guardrails across a whole org, write in
              and we will point you the right way.
            </p>
            <div className="mt-8">
              <DarkPill href="mailto:sales@cadre.to">Email sales@cadre.to</DarkPill>
            </div>
          </Rise>

          {/* Right: quiet card of contact rows */}
          <Rise delay={0.1}>
            <div className="rounded-[24px] bg-[var(--site-band)] p-3">
              <div className="divide-y divide-[var(--site-line)]">
                {ROWS.map((r) => (
                  <div key={r.label} className="flex items-start gap-4 p-5">
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#55534e] ring-1 ring-inset ring-[var(--site-line)]">
                      <r.icon />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[15.5px] font-medium text-[var(--site-ink)]">{r.label}</p>
                      <p className="mt-1 text-[14px] leading-relaxed text-[var(--site-body)]">
                        {r.body}
                      </p>
                      <a
                        href={`mailto:${r.email}`}
                        className="mt-2 inline-block text-[14.5px] font-medium text-[var(--site-ink)] underline decoration-[var(--site-line)] underline-offset-4 transition hover:decoration-[var(--site-ink)]"
                      >
                        {r.email}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Rise>
        </div>
      </section>
    </main>
  );
}
