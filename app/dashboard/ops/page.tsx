"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Card, EmptyState, StatusDot } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";

export default function OpsPage() {
  const { spaceId } = useActiveSpace();
  const skip = spaceId ? { spaceId } : "skip";
  const usage = useQuery(api.usage.summary, skip);
  const agents = useQuery(api.agents.list, skip);
  const alerts = useQuery(api.health.alerts, skip);

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
    </div>
  );
}
