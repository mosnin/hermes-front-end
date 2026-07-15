"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";
import { Reveal, Stagger, StaggerItem } from "@/components/marketing/motion";
import { CheckCircle2, Wrench } from "lucide-react";

export default function StatusPage() {
  const status = useQuery(api.status.page, {});
  const maintenance = status?.overall === "maintenance";

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6">
        <section className="pt-20 pb-8">
          <Reveal>
            <div
              className={`flex items-center gap-4 rounded-3xl border p-6 ${
                maintenance
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-lime-400/30 bg-lime-400/5"
              }`}
            >
              <span
                className={`grid h-12 w-12 place-items-center rounded-2xl ${
                  maintenance ? "bg-amber-400/10 text-amber-400" : "bg-lime-400/10 text-lime-400"
                }`}
              >
                {maintenance ? <Wrench className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
              </span>
              <div>
                <h1 className="text-xl font-semibold">
                  {maintenance ? "Maintenance in progress" : "All systems operational"}
                </h1>
                <p className="text-sm text-muted">
                  {status
                    ? `Updated ${new Date(status.updatedAt).toLocaleString()}`
                    : "Checking status…"}
                </p>
              </div>
            </div>
          </Reveal>
        </section>

        <section className="pb-24">
          <h2 className="mb-4 text-sm uppercase tracking-wider text-muted">Components</h2>
          <Stagger className="space-y-2">
            {(status?.components ?? []).map((c) => {
              const ok = c.status === "operational";
              return (
                <StaggerItem key={c.key}>
                  <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4">
                    <span className="font-medium">{c.name}</span>
                    <span className="flex items-center gap-2 text-sm">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-lime-400 shadow-[0_0_8px_rgba(163,230,53,0.7)]" : "bg-amber-400"}`}
                      />
                      <span className={ok ? "text-lime-400" : "text-amber-400"}>
                        {ok ? "Operational" : "Maintenance"}
                      </span>
                    </span>
                  </div>
                </StaggerItem>
              );
            })}
          </Stagger>
          <p className="mt-8 text-center text-xs text-muted">
            This page reflects platform component health only and never exposes
            customer data.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
