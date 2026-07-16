"use client";

import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";
import { Reveal, Stagger, StaggerItem } from "@/components/marketing/motion";

const CHANNELS = [
  {
    tag: "~/sales",
    title: "Sales & enterprise",
    body: "SSO/SAML, SCIM, custom guardrail policies, annual agreements.",
    action: "sales@cadre.to",
    href: "mailto:sales@cadre.to",
  },
  {
    tag: "~/support",
    title: "Support",
    body: "Stuck connecting an agent, a workflow misbehaving, billing questions.",
    action: "support@cadre.to",
    href: "mailto:support@cadre.to",
  },
  {
    tag: "~/partners",
    title: "Partnerships",
    body: "Framework adapters, MCP servers, deployment platforms.",
    action: "partners@cadre.to",
    href: "mailto:partners@cadre.to",
  },
];

export default function ContactPage() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 sm:px-6">
        <section className="pt-20 pb-12 text-center">
          <Reveal>
            <h1 className="text-4xl font-bold tracking-tight">Contact</h1>
            <p className="mx-auto mt-4 max-w-xl text-muted">
              A human reads every message. Tell us what your fleet needs to do.
            </p>
          </Reveal>
        </section>

        <Stagger className="grid gap-4 pb-16 lg:grid-cols-3">
          {CHANNELS.map((c) => (
            <StaggerItem
              key={c.title}
              className="rounded-2xl border border-border bg-surface p-7 text-center transition hover:border-accent/40"
            >
              <p className="mb-3 font-mono text-xs text-accent">{c.tag}</p>
              <h2 className="font-semibold">{c.title}</h2>
              <p className="mt-2 text-sm text-muted">{c.body}</p>
              <a
                href={c.href}
                className="mt-4 inline-block rounded-lg border border-accent/50 px-4 py-2 text-sm text-accent transition hover:bg-accent/10"
              >
                {c.action}
              </a>
            </StaggerItem>
          ))}
        </Stagger>

        <section className="pb-24">
          <Reveal>
            <div className="mx-auto max-w-xl rounded-2xl border border-border bg-surface p-8">
              <h2 className="font-semibold">Write to us</h2>
              <form
                className="mt-5 space-y-3"
                action="mailto:sales@cadre.to"
                method="post"
                encType="text/plain"
              >
                <input
                  name="name"
                  placeholder="Name"
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
                />
                <input
                  name="email"
                  type="email"
                  placeholder="Work email"
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
                />
                <textarea
                  name="message"
                  rows={5}
                  placeholder="What should your agents be doing?"
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
                />
                <button
                  type="submit"
                  className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_16px_rgba(255,91,4,0.35)] transition hover:brightness-110"
                >
                  Send
                </button>
              </form>
            </div>
          </Reveal>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
