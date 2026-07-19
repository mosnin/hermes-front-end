"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { api } from "@/convex/_generated/api";
import { Card, Badge, Input, SkeletonRows } from "@/components/ui";
import { CountUp, DURATION, EASE, Reveal, Stagger, StaggerItem } from "@/components/site/motion";
import { Search, Server, X } from "@/components/icons";

const STATUS_TONE: Record<string, "default" | "green" | "yellow" | "red" | "blue"> = {
  running: "green",
  provisioning: "yellow",
  stopped: "default",
  failed: "red",
  unknown: "default",
};

export default function AdminFleet() {
  const fleet = useQuery(api.admin.fleet, {});
  const [q, setQ] = useState("");
  const reduce = useReducedMotion();

  const rows = useMemo(() => {
    const list = fleet ?? [];
    const needle = q.trim().toLowerCase();
    return needle
      ? list.filter(
          (a) =>
            a.name.toLowerCase().includes(needle) ||
            a.companyId.toLowerCase().includes(needle) ||
            a.spaceName.toLowerCase().includes(needle),
        )
      : list;
  }, [fleet, q]);

  const totals = useMemo(() => {
    const list = fleet ?? [];
    return {
      running: list.filter((a) => a.deploymentStatus === "running").length,
      provisioning: list.filter((a) => a.deploymentStatus === "provisioning").length,
      stopped: list.filter((a) => a.deploymentStatus === "stopped" || a.deploymentStatus === "failed")
        .length,
    };
  }, [fleet]);

  return (
    <div className="p-8">
      <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Fleet</h1>
          <p className="text-sm text-muted">
            Every hosted agent across all tenants (managed hosting on Cloudflare
            Containers). Read-only, no terminate action yet.
          </p>
        </div>
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Filter by agent, company, space…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8 pr-8"
          />
          <AnimatePresence>
            {q.length > 0 && (
              <motion.button
                type="button"
                aria-label="Clear filter"
                onClick={() => setQ("")}
                initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
                transition={{ duration: DURATION.instant, ease: EASE }}
                className="absolute right-2.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-band hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </Reveal>

      <Stagger className="mb-4 flex flex-wrap gap-3 text-sm" gap={0.05}>
        <StaggerItem as="div" y={8} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5">
          <Server className="h-3.5 w-3.5 text-green-600" />
          <span className="text-foreground">
            <CountUp value={totals.running} duration={0.8} /> running
          </span>
        </StaggerItem>
        <StaggerItem as="div" y={8} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5">
          <Server className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-foreground">
            <CountUp value={totals.provisioning} duration={0.8} /> provisioning
          </span>
        </StaggerItem>
        <StaggerItem as="div" y={8} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5">
          <Server className="h-3.5 w-3.5 text-muted" />
          <span className="text-foreground">
            <CountUp value={totals.stopped} duration={0.8} /> stopped
          </span>
        </StaggerItem>
      </Stagger>

      <Reveal delay={0.1}>
        <Card className="p-0">
          <div className="grid grid-cols-[1fr_1fr_auto_auto_auto_auto] gap-4 border-b border-border px-6 py-3 text-xs uppercase tracking-wider text-muted">
            <span>Agent</span>
            <span>Company / Space</span>
            <span className="text-right">Provider</span>
            <span className="text-right">Region</span>
            <span className="text-right">Status</span>
            <span className="text-right">Created</span>
          </div>
          <Stagger as="div" gap={0.03}>
            {rows.map((a) => (
              <StaggerItem
                key={a.agentId}
                as="div"
                y={8}
                duration={0.4}
                className="grid grid-cols-[1fr_1fr_auto_auto_auto_auto] items-center gap-4 border-b border-border px-6 py-3.5 text-sm transition-colors last:border-b-0 hover:bg-band/60"
              >
                <span className="flex items-center gap-2 truncate text-foreground">
                  <Server className="h-4 w-4 shrink-0 text-muted" />
                  {a.name}
                </span>
                <span className="truncate font-mono text-xs text-muted">
                  {a.companyId} / {a.spaceName}
                </span>
                <span className="text-right text-xs uppercase text-muted">{a.vmProvider}</span>
                <span className="text-right text-xs text-muted">{a.region ?? "—"}</span>
                <span className="flex justify-end">
                  {/* CSS-driven pulse (Tailwind `animate-pulse`, opacity-only)
                      instead of a per-row Framer Motion `repeat: Infinity`
                      loop: a large fleet can have many rows "provisioning"
                      at once, and a compositor-only CSS animation avoids one
                      JS animation tick per row. Fully neutralized under
                      `prefers-reduced-motion` by the global rule in
                      app/globals.css (animation-iteration-count forced to 1),
                      so no local reduced-motion check is needed here. */}
                  <span className={a.deploymentStatus === "provisioning" ? "animate-pulse" : undefined}>
                    <Badge tone={STATUS_TONE[a.deploymentStatus] ?? "default"}>
                      {a.deploymentStatus}
                    </Badge>
                  </span>
                </span>
                <span className="text-right text-xs text-muted">
                  {new Date(a.createdAt).toLocaleString()}
                </span>
              </StaggerItem>
            ))}
          </Stagger>
          {fleet === undefined && (
            <div className="p-6">
              <SkeletonRows rows={5} />
            </div>
          )}
          {fleet !== undefined && rows.length === 0 && (
            <motion.div
              initial={reduce ? { opacity: 1 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? DURATION.reduced : DURATION.base, ease: EASE }}
              className="flex flex-col items-center gap-2 px-6 py-14 text-center"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-band text-muted">
                <Server className="h-4 w-4" />
              </span>
              <p className="text-sm text-muted">
                {q.trim() ? "No hosted agents match that filter." : "No hosted agents yet."}
              </p>
            </motion.div>
          )}
        </Card>
      </Reveal>
    </div>
  );
}
