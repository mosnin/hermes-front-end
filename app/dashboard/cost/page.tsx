"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { Activity, AlertTriangle, DollarSign, Radio, Zap } from "@/components/icons";

function usd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(5)}`;
}

function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return `${n}`;
}

export default function CostPage() {
  const { spaceId } = useActiveSpace();
  const est = useQuery(api.costs.estimate, spaceId ? { spaceId } : "skip");

  const stats = est
    ? [
        {
          label: "Always-on agents",
          value: `${est.alwaysOnAgents}/${est.totalAgents}`,
          icon: Radio,
          hint: "status online — these drive the poll loop",
        },
        {
          label: "Est. fn calls / month",
          value: compact(est.estTotalFnCalls),
          icon: Activity,
          hint: `${compact(est.estPollCallsPerMonth)} poll · ${compact(est.estEventCallsPerMonth)} event`,
        },
        {
          label: "Est. Convex $ / month",
          value: usd(est.estConvexCostUsd),
          icon: DollarSign,
          hint: "this Space, operator infra only",
        },
      ]
    : [];

  // Lever rows (cheapest transport for the same fleet of always-on agents).
  const lever = est?.lever;
  const base = lever?.poll2s.costUsd ?? 0;
  const leverRows = lever
    ? [
        { label: "2s poll (current loop)", proj: lever.poll2s, accent: false },
        { label: "10s poll", proj: lever.poll10s, accent: false },
        { label: "Event-push (no idle polling)", proj: lever.eventPush, accent: true },
      ]
    : [];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Cost (estimated)</h1>
        <p className="text-sm text-muted">
          An <span className="font-medium">estimate</span> of the operator&apos;s
          infrastructure cost (Convex function calls + writes) for this Space,
          modeled from observable activity. This is{" "}
          <span className="font-medium">not the real Convex bill</span> — it is
          tunable via the assumption constants in{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">
            convex/costs.ts
          </code>
          . Users&apos; own agent compute + LLM tokens are tracked separately
          under Ops &amp; Analytics.
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((st) => {
          const Icon = st.icon;
          return (
            <Card key={st.label}>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted">{st.label}</p>
                <Icon className="h-4 w-4 text-muted" />
              </div>
              <p className="mt-1 text-3xl font-semibold">{st.value}</p>
              <p className="mt-1 text-xs text-muted">{st.hint}</p>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Breakdown: poll vs event-driven, by category */}
        <Card>
          <h2 className="mb-3 font-semibold">Cost breakdown</h2>
          {est ? (
            <div className="space-y-2">
              {(
                [
                  ["Polling (idle loop)", est.byCategory.poll.fnCalls, est.byCategory.poll.costUsd, "calls"],
                  ["Heartbeats", est.byCategory.heartbeat.fnCalls, est.byCategory.heartbeat.costUsd, "calls"],
                  ["Event-driven fn calls", est.byCategory.events.fnCalls, est.byCategory.events.costUsd, "calls"],
                  ["Document writes", est.byCategory.writes.writes, est.byCategory.writes.costUsd, "writes"],
                ] as const
              ).map(([label, count, cost, unit]) => {
                const pct =
                  est.estConvexCostUsd > 0
                    ? (cost / est.estConvexCostUsd) * 100
                    : 0;
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted">{label}</span>
                      <span>
                        {compact(count)} {unit} · {usd(cost)}
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-surface-2">
                      <div
                        className="h-2 rounded-full bg-accent-2"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="mt-3 flex justify-between border-t border-border pt-2 text-sm font-medium">
                <span>Total (est.)</span>
                <span>{usd(est.estConvexCostUsd)} / month</span>
              </div>
              <p className="mt-2 text-xs text-muted">
                Month-to-date over {est.elapsedDays}d, projected to 30d.
                Observed: {est.observed.a2aMessages} A2A ·{" "}
                {est.observed.runSteps} steps · {est.observed.activity} activity
                · {est.observed.workEvents} work events ·{" "}
                {est.observed.usageRows} usage rows.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">Estimating…</p>
          )}
        </Card>

        {/* The lever: poll interval is the dominant cost driver */}
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-accent" />
            <h2 className="font-semibold">Lever: the poll loop</h2>
          </div>
          {est && lever ? (
            <>
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Always-on agents polling on a {est.assumptions.POLL_INTERVAL_SECONDS}s
                  loop are the dominant idle cost. Stretching the interval or
                  moving to event-push slashes the projected bill — same fleet,
                  same work done.
                </span>
              </div>
              <div className="space-y-2">
                {leverRows.map((row) => {
                  const savings = base > 0 ? 1 - row.proj.costUsd / base : 0;
                  return (
                    <div
                      key={row.label}
                      className={`flex items-center justify-between rounded-lg border p-3 text-sm ${
                        row.accent
                          ? "border-green-500/40 bg-green-500/10"
                          : "border-border"
                      }`}
                    >
                      <div>
                        <p className="font-medium">{row.label}</p>
                        <p className="text-xs text-muted">
                          {compact(row.proj.fnCalls)} fn calls / month
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          {usd(row.proj.costUsd)}
                          <span className="text-xs font-normal text-muted">
                            {" "}
                            / mo
                          </span>
                        </p>
                        {savings > 0.001 && (
                          <p className="text-xs text-green-400">
                            −{Math.round(savings * 100)}% vs 2s
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted">
                Event-driven calls and writes are held constant across scenarios;
                only the idle poll volume changes. Tune assumptions in{" "}
                <code className="rounded bg-surface-2 px-1 py-0.5">
                  convex/costs.ts
                </code>
                .
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">Estimating…</p>
          )}
        </Card>
      </div>
    </div>
  );
}
