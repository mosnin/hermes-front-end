"use client";

import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { EmptyState } from "@/components/ui";
import { EASE, Reveal, Stagger } from "@/components/site/motion";
import { useActiveSpace } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";
import { PageHead, PillButton, Panel, StatTile, StatRow, ListRow, Dot, SectionLabel } from "@/components/dash/kit";

const SLO_LABELS: Record<string, string> = {
  runSuccess: "Run success ≥95%",
  messageLoss: "Zero message loss",
  errorBudget: "Errors ≤50 / 24h",
  fleetOnline: "Fleet reachable",
};

/** Small status pill, since the ok/breach and anomaly flags aren't buttons. */
function StatusPill({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-[12px] font-medium ${
        ok ? "bg-[#e9f6ec] text-[#2a7a3b]" : "bg-[#fbe9e9] text-[#b3261e]"
      }`}
    >
      {children}
    </span>
  );
}

export default function OpsPage() {
  const reduce = useReducedMotion();
  const { spaceId } = useActiveSpace();
  const usage = useQuery(api.usage.summary, spaceId ? { spaceId } : "skip");
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  const alerts = useQuery(api.health.alerts, spaceId ? { spaceId } : "skip");
  const metrics = useQuery(api.metrics.summary, spaceId ? { spaceId } : "skip");
  const forecast = useQuery(api.metrics.forecast, spaceId ? { spaceId } : "skip");
  const errors = useQuery(
    api.observability.listErrors,
    spaceId ? { spaceId, limit: 10 } : "skip",
  );
  const deadLetters = useQuery(
    api.reliability.listDeadLetters,
    spaceId ? { spaceId, status: "open" } : "skip",
  );

  const [exporting, setExporting] = useState(false);
  const exportSigned = useAction(api.audit.exportSigned);

  const downloadAudit = async () => {
    if (!spaceId || exporting) return;
    setExporting(true);
    try {
      // Tamper-evident export: hash-chained entries + chain head. Record the
      // head out-of-band to prove the log was never rewritten.
      const signed = await exportSigned({ spaceId, sinceDays: 30 });
      const blob = new Blob([JSON.stringify(signed, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-chain-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const onlineAgents = (agents ?? []).filter((a) => a.status === "online").length;

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="ops & scale · this space"
          title="Ops & scale"
          sub="Spend, agent health, alerts, and audit export for this Space."
          actions={
            <PillButton variant="outline" onClick={downloadAudit} className={exporting ? "opacity-60" : ""}>
              {exporting ? "Exporting…" : "Export signed audit (30d)"}
            </PillButton>
          }
        />

        {usage?.autonomyPaused && (
          <Reveal as="div" y={8} className="rounded-[18px] bg-[#fbe9e9] px-5 py-3.5 text-[13.5px] text-[#b3261e]">
            Autonomy is paused, possibly by the budget guard. Resume in Space settings once reviewed.
          </Reveal>
        )}

        <StatRow>
          <StatTile
            value={Math.round(usage?.totalCost ?? 0)}
            prefix="$"
            label="Spend this month"
            hint={usage && usage.budget > 0 ? `of $${usage.budget} budget` : "no budget set"}
            tone="ink"
          />
          <StatTile value={onlineAgents} label="Agents online" hint={agents ? `of ${agents.length} total` : undefined} />
          <StatTile value={errors?.length ?? 0} label="Errors · 24h" hint={errors?.length === 0 ? "all clear" : "needs a look"} />
          <StatTile value={deadLetters?.length ?? 0} label="Dead letters" hint="open, terminal failures" />
        </StatRow>

        {metrics && (
          <div>
            <SectionLabel>service health · 24h</SectionLabel>
            <Panel
              action={<StatusPill ok={metrics.healthy}>{metrics.healthy ? "All SLOs met" : "SLO breach"}</StatusPill>}
            >
              <div>
                {Object.entries(metrics.slo).map(([key, sVal]) => (
                  <ListRow
                    key={key}
                    leading={<Dot tone={sVal.ok ? "online" : "error"} />}
                    title={SLO_LABELS[key] ?? key}
                    trailing={
                      sVal.actual === null
                        ? "—"
                        : typeof sVal.actual === "number" && sVal.actual <= 1 && key !== "errorBudget" && key !== "messageLoss"
                          ? `${Math.round(sVal.actual * 100)}%`
                          : String(sVal.actual)
                    }
                  />
                ))}
              </div>
              <div className="mt-5 grid gap-2 border-t border-[var(--border)] pt-4 text-[12.5px] text-[var(--muted)] sm:grid-cols-2 lg:grid-cols-4">
                <span>
                  Runs: {metrics.runs.completed} ok · {metrics.runs.failed} failed
                  {metrics.runs.durationP50Ms !== null && ` · p50 ${(metrics.runs.durationP50Ms / 1000).toFixed(1)}s`}
                </span>
                <span>
                  A2A: {metrics.a2a.sent} sent · {metrics.a2a.acked} acked
                  {metrics.a2a.redelivered > 0 && ` · ${metrics.a2a.redelivered} redelivered`}
                </span>
                <span>Dead letters: {metrics.deadLetters.open} open</span>
                <span>Window spend: ${metrics.spend.windowUsd.toFixed(2)}</span>
              </div>
            </Panel>
          </div>
        )}

        {forecast && (
          <div>
            <SectionLabel>forecast &amp; anomalies</SectionLabel>
            <Panel action={forecast.anomaly ? <StatusPill ok={false}>error anomaly</StatusPill> : undefined}>
              <Stagger className="grid gap-3 sm:grid-cols-3" gap={0.07}>
                <StatTile
                  value={Math.round(forecast.mtdSpendUsd)}
                  prefix="$"
                  label="Month-to-date"
                  hint={`day ${forecast.dayOfMonth}/${forecast.daysInMonth}`}
                />
                <StatTile
                  value={Math.round(forecast.projectedSpendUsd)}
                  prefix="$"
                  label="Projected month-end"
                  hint={
                    forecast.budgetUsd > 0
                      ? `${Math.round((forecast.projectedPct ?? 0) * 100)}% of $${forecast.budgetUsd} budget`
                      : "no budget set"
                  }
                  tone={forecast.overBudget ? "band" : "white"}
                />
                <StatTile
                  value={forecast.errorsToday}
                  label="Errors today"
                  hint={`vs ~${forecast.errorBaseline} baseline (7d avg)`}
                  tone={forecast.anomaly ? "band" : "white"}
                />
              </Stagger>
              {forecast.overBudget && (
                <p className="mt-4 rounded-[14px] bg-[#fbe9e9] px-4 py-2.5 text-[12.5px] text-[#b3261e]">
                  At the current run-rate you&apos;ll exceed the monthly budget. Autonomy will auto-pause when it&apos;s reached.
                </p>
              )}
            </Panel>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Spend this month" tone="band">
            <p className="text-[38px] font-medium leading-none tracking-[-0.02em] tabular-nums">
              ${usage?.totalCost.toFixed(2) ?? "0.00"}
              {usage && usage.budget > 0 && (
                <span className="text-[16px] font-normal text-[var(--muted)]"> / ${usage.budget}</span>
              )}
            </p>
            {usage && usage.budget > 0 && (
              <div className="mt-3 h-1.5 w-full rounded-full bg-[var(--background)]">
                <motion.div
                  className={`h-1.5 rounded-full ${usage.budgetUsedPct >= 1 ? "bg-[#b3261e]" : "bg-[var(--foreground)]"}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(usage.budgetUsedPct * 100)}%` }}
                  transition={{ duration: reduce ? 0 : 0.8, ease: EASE }}
                />
              </div>
            )}
            <div className="mt-4 space-y-2">
              {usage &&
                Object.entries(usage.byKind).map(([k, val]) => {
                  const vv = val as { count: number; cost: number };
                  return (
                    <div key={k} className="flex justify-between text-[13px]">
                      <span className="capitalize text-[var(--muted)]">{k}</span>
                      <span className="text-[var(--foreground)]">
                        {vv.count} · ${vv.cost.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </Panel>

          <Panel title="Agent health">
            {(agents ?? []).length === 0 ? (
              <p className="py-6 text-center text-[13.5px] text-[var(--muted)]">No agents.</p>
            ) : (
              <div>
                {(agents ?? []).map((a) => (
                  <ListRow
                    key={a._id}
                    leading={
                      <Dot
                        tone={a.status === "online" ? "online" : a.status === "degraded" ? "error" : "idle"}
                      />
                    }
                    title={a.name}
                    meta={a.status}
                    trailing={timeAgo(a.lastHeartbeat)}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div>
          <SectionLabel>alerts</SectionLabel>
          <Panel>
            {alerts?.length === 0 ? (
              <EmptyState title="No alerts" body="Health and governance alerts will appear here." />
            ) : (
              <div>
                {(alerts ?? []).map((a) => (
                  <ListRow key={a._id} leading={<Dot tone="error" />} title={a.title} meta={a.detail} trailing={timeAgo(a.createdAt)} />
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Error stream">
            {errors?.length === 0 ? (
              <EmptyState title="No recent errors" body="Structured failures (with trace ids) appear here." />
            ) : (
              <div>
                {(errors ?? []).map((e) => (
                  <ListRow
                    key={e._id}
                    leading={<Dot tone={e.kind === "guard_violation" ? "paused" : "error"} />}
                    title={e.message}
                    meta={`${e.source} · trace ${e.traceId}`}
                    trailing={timeAgo(e.createdAt)}
                  />
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Dead letters">
            {deadLetters?.length === 0 ? (
              <EmptyState title="Nothing dead-lettered" body="Terminal failures land here with enough context to replay." />
            ) : (
              <div>
                {(deadLetters ?? []).map((d) => (
                  <ListRow key={d._id} leading={<Dot tone="error" />} title={d.error} meta={d.kind} trailing={timeAgo(d.createdAt)} />
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
