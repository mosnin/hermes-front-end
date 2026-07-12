"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Card, EmptyState, StatusDot } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";

const SLO_LABELS: Record<string, string> = {
  runSuccess: "Run success ≥95%",
  messageLoss: "Zero message loss",
  errorBudget: "Errors ≤50 / 24h",
  fleetOnline: "Fleet reachable",
};

export default function OpsPage() {
  const { spaceId } = useActiveSpace();
  const usage = useQuery(api.usage.summary, spaceId ? { spaceId } : "skip");
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  const alerts = useQuery(api.health.alerts, spaceId ? { spaceId } : "skip");
  const metrics = useQuery(api.metrics.summary, spaceId ? { spaceId } : "skip");
  const errors = useQuery(
    api.observability.listErrors,
    spaceId ? { spaceId, limit: 10 } : "skip",
  );
  const deadLetters = useQuery(
    api.reliability.listDeadLetters,
    spaceId ? { spaceId, status: "open" } : "skip",
  );

  const [exporting, setExporting] = useState(false);
  const audit = useQuery(
    api.audit.export_,
    exporting && spaceId ? { spaceId, sinceDays: 30 } : "skip",
  );

  useEffect(() => {
    if (exporting && audit) {
      const blob = new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExporting(false);
    }
  }, [exporting, audit]);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ops & scale</h1>
          <p className="text-sm text-muted">
            Spend & budget, agent health, alerts, and audit export for this Space.
          </p>
        </div>
        <Button variant="outline" onClick={() => setExporting(true)} disabled={exporting}>
          {exporting ? "Exporting…" : "Export audit (30d)"}
        </Button>
      </div>

      {usage?.autonomyPaused && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          ⏸ Autonomy is paused — possibly by the budget guard. Resume in Space
          settings once reviewed.
        </div>
      )}

      {metrics && (
        <Card className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Service health (24h)</h2>
            <Badge tone={metrics.healthy ? "green" : "red"}>
              {metrics.healthy ? "All SLOs met" : "SLO breach"}
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(metrics.slo).map(([key, s]) => (
              <div key={key} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">{SLO_LABELS[key] ?? key}</span>
                  <Badge tone={s.ok ? "green" : "red"}>{s.ok ? "ok" : "breach"}</Badge>
                </div>
                <p className="mt-1 text-lg font-semibold">
                  {s.actual === null
                    ? "—"
                    : typeof s.actual === "number" && s.actual <= 1 && key !== "errorBudget" && key !== "messageLoss"
                      ? `${Math.round(s.actual * 100)}%`
                      : s.actual}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <span className="text-muted">
              Runs: {metrics.runs.completed}✓ {metrics.runs.failed}✗
              {metrics.runs.durationP50Ms !== null &&
                ` · p50 ${(metrics.runs.durationP50Ms / 1000).toFixed(1)}s`}
            </span>
            <span className="text-muted">
              A2A: {metrics.a2a.sent} sent · {metrics.a2a.acked} acked
              {metrics.a2a.redelivered > 0 && ` · ${metrics.a2a.redelivered} redelivered`}
            </span>
            <span className="text-muted">
              Dead letters: {metrics.deadLetters.open} open
            </span>
            <span className="text-muted">
              Window spend: ${metrics.spend.windowUsd.toFixed(2)}
            </span>
          </div>
        </Card>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">Spend this month</h2>
          <p className="text-3xl font-semibold">
            ${usage?.totalCost.toFixed(2) ?? "0.00"}
            {usage && usage.budget > 0 && (
              <span className="text-base font-normal text-muted"> / ${usage.budget}</span>
            )}
          </p>
          {usage && usage.budget > 0 && (
            <div className="mt-2 h-2 w-full rounded-full bg-surface-2">
              <div
                className={`h-2 rounded-full ${usage.budgetUsedPct >= 1 ? "bg-red-500" : "bg-accent-2"}`}
                style={{ width: `${Math.round(usage.budgetUsedPct * 100)}%` }}
              />
            </div>
          )}
          <div className="mt-3 space-y-1">
            {usage &&
              Object.entries(usage.byKind).map(([k, val]) => {
                const vv = val as { count: number; cost: number };
                return (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="capitalize text-muted">{k}</span>
                    <span>{vv.count} · ${vv.cost.toFixed(2)}</span>
                  </div>
                );
              })}
          </div>
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">Agent health</h2>
          <ul className="space-y-2">
            {(agents ?? []).map((a) => (
              <li key={a._id} className="flex items-center gap-2 text-sm">
                <StatusDot status={a.status} />
                <span className="flex-1 truncate">{a.name}</span>
                <Badge tone={a.status === "online" ? "green" : a.status === "degraded" ? "yellow" : "default"}>
                  {a.status}
                </Badge>
                <span className="text-xs text-muted">{timeAgo(a.lastHeartbeat)}</span>
              </li>
            ))}
            {agents?.length === 0 && <li className="text-sm text-muted">No agents.</li>}
          </ul>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold">Alerts</h2>
        {alerts?.length === 0 ? (
          <EmptyState title="No alerts" body="Health and governance alerts will appear here." />
        ) : (
          <ul className="divide-y divide-border">
            {(alerts ?? []).map((a) => (
              <li key={a._id} className="flex items-center gap-3 py-2">
                <Badge tone="red">alert</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{a.title}</p>
                  {a.detail && <p className="truncate text-xs text-muted">{a.detail}</p>}
                </div>
                <span className="text-xs text-muted">{timeAgo(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Error stream</h2>
          {errors?.length === 0 ? (
            <EmptyState title="No recent errors" body="Structured failures (with trace ids) appear here." />
          ) : (
            <ul className="divide-y divide-border">
              {(errors ?? []).map((e) => (
                <li key={e._id} className="py-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={e.kind === "guard_violation" ? "yellow" : "red"}>
                      {e.kind}
                    </Badge>
                    <span className="text-xs text-muted">{e.source}</span>
                    <span className="ml-auto text-xs text-muted">{timeAgo(e.createdAt)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm">{e.message}</p>
                  <p className="text-[10px] text-muted">trace {e.traceId}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Dead letters</h2>
          {deadLetters?.length === 0 ? (
            <EmptyState
              title="Nothing dead-lettered"
              body="Terminal failures land here with enough context to replay."
            />
          ) : (
            <ul className="divide-y divide-border">
              {(deadLetters ?? []).map((d) => (
                <li key={d._id} className="py-2">
                  <div className="flex items-center gap-2">
                    <Badge tone="red">{d.kind}</Badge>
                    <span className="ml-auto text-xs text-muted">{timeAgo(d.createdAt)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm">{d.error}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
