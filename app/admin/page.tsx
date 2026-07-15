"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, RingGauge, Toggle, Badge } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/marketing/motion";
import { useToast } from "@/components/toast";
import {
  AlertTriangle,
  Boxes,
  Building2,
  Pause,
  Server,
  Workflow,
} from "lucide-react";

export default function AdminOverview() {
  const stats = useQuery(api.admin.platformStats, {});
  const flags = useQuery(api.admin.flags, {});
  const errors = useQuery(api.admin.recentErrors, { limit: 8 });
  const setFlag = useMutation(api.admin.setFlag);
  const toast = useToast();

  const kpis = stats
    ? [
        { label: "Companies", value: stats.companies, icon: Building2, color: "accent" as const, pct: 1 },
        { label: "Spaces", value: stats.spaces, icon: Server, color: "cyan" as const, pct: 1 },
        { label: "Agents", value: stats.agents, unit: `${stats.onlineAgents} up`, icon: Boxes, color: "green" as const, pct: stats.agents ? stats.onlineAgents / stats.agents : 0.02 },
        { label: "Runs", value: stats.runs, unit: `${stats.runningRuns} live`, icon: Workflow, color: "accent" as const, pct: stats.successRate ?? 0.02 },
      ]
    : [];

  async function toggle(key: string, enabled: boolean, label: string) {
    try {
      await setFlag({ key, enabled });
      toast(`${label} ${enabled ? "engaged" : "released"}`, enabled ? "error" : "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Platform overview</h1>
        <p className="text-sm text-muted">
          Cross-tenant health across the entire deployment. Read-only by design;
          controls below are audited.
        </p>
      </div>

      <Stagger className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <StaggerItem key={k.label}>
            <Card className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm">
                  <k.icon className="h-4 w-4 text-muted" /> {k.label}
                </p>
                {"unit" in k && k.unit && (
                  <p className="mt-1 text-xs text-muted">{k.unit}</p>
                )}
              </div>
              <RingGauge value={k.value} color={k.color} pct={k.pct} size={84} />
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Fleet & reliability</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {stats &&
              [
                { label: "Online agents", value: stats.onlineAgents },
                { label: "Running workflows", value: stats.runningRuns },
                { label: "Failed runs", value: stats.failedRuns },
                { label: "Errors (24h)", value: stats.errors24h, warn: stats.errors24h > 0 },
                { label: "Open dead-letters", value: stats.openDeadLetters, warn: stats.openDeadLetters > 0 },
                { label: "Paused Spaces", value: stats.pausedSpaces },
              ].map((m) => (
                <div key={m.label} className="rounded-xl border border-border bg-surface-2/40 p-3">
                  <p className={`text-2xl font-semibold ${m.warn ? "text-red-400" : ""}`}>
                    {m.value}
                  </p>
                  <p className="text-xs text-muted">{m.label}</p>
                </div>
              ))}
          </div>
          {stats && (
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(stats.planCounts).map(([plan, count]) => (
                <Badge key={plan} tone={plan === "enterprise" ? "green" : plan === "team" ? "blue" : "default"}>
                  {plan}: {count as number}
                </Badge>
              ))}
              {stats.spacesCapped && <Badge tone="yellow">sampled (5k cap)</Badge>}
            </div>
          )}
        </Card>

        <Card className="border-red-500/25">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
            <AlertTriangle className="h-5 w-5 text-red-400" /> Platform controls
          </h2>
          <p className="mb-4 text-xs text-muted">
            Break-glass switches. Changes are written to the immutable admin
            audit trail with your identity.
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/5 p-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Pause className="h-4 w-4 text-red-400" /> Global autonomy pause
                </p>
                <p className="mt-1 text-xs text-muted">
                  Halts all new autonomous dispatch across every tenant.
                </p>
              </div>
              <Toggle
                checked={!!flags?.globalAutonomyPaused}
                onChange={(v) => toggle("global_autonomy_paused", v, "Global kill switch")}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border p-4">
              <div>
                <p className="text-sm font-medium">Maintenance mode</p>
                <p className="mt-1 text-xs text-muted">
                  Signals a maintenance window to clients.
                </p>
              </div>
              <Toggle
                checked={!!flags?.maintenanceMode}
                onChange={(v) => toggle("maintenance_mode", v, "Maintenance mode")}
              />
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 font-semibold">Cross-tenant error stream</h2>
        {(errors ?? []).length === 0 ? (
          <p className="text-sm text-muted">
            {errors === undefined ? "Loading…" : "No recent platform errors."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {(errors ?? []).map((e) => (
              <li key={e._id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">
                  {e.source}
                </span>
                <span className="min-w-0 flex-1 truncate">{e.message}</span>
                <span className="font-mono text-[10px] text-muted">{e.traceId}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
