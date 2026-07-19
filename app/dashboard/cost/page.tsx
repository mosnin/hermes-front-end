"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, Input, Toggle } from "@/components/ui";
import { EASE, Reveal, Stagger, StaggerItem } from "@/components/site/motion";
import { useActiveSpace } from "@/components/active-space";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  DollarSign,
  Power,
  Radio,
  Zap,
} from "@/components/icons";

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
  const reduce = useReducedMotion();
  const { spaceId } = useActiveSpace();
  const est = useQuery(api.costs.estimate, spaceId ? { spaceId } : "skip");

  const stats = est
    ? [
        {
          label: "Always-on agents",
          value: `${est.alwaysOnAgents}/${est.totalAgents}`,
          icon: Radio,
          hint: "status online, these drive the poll loop",
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
      <Reveal className="mb-6">
        <h1 className="text-2xl font-semibold">Cost (estimated)</h1>
        <p className="text-sm text-muted">
          An <span className="font-medium">estimate</span> of the operator&apos;s
          infrastructure cost (Convex function calls + writes) for this Space,
          modeled from observable activity. This is{" "}
          <span className="font-medium">not the real Convex bill</span>, it is
          tunable via the assumption constants in{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">
            convex/costs.ts
          </code>
          . Users&apos; own agent compute + LLM tokens are tracked separately
          under Ops &amp; Analytics.
        </p>
      </Reveal>

      <Stagger className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((st) => {
          const Icon = st.icon;
          return (
            <StaggerItem key={st.label}>
              <Card>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted">{st.label}</p>
                  <Icon className="h-4 w-4 text-muted" />
                </div>
                <p className="mt-1 text-3xl font-semibold">{st.value}</p>
                <p className="mt-1 text-xs text-muted">{st.hint}</p>
              </Card>
            </StaggerItem>
          );
        })}
      </Stagger>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Breakdown: poll vs event-driven, by category */}
        <Reveal x={-16} y={0}>
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
                        <motion.div
                          className="h-2 rounded-full bg-accent-2"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}
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
        </Reveal>

        {/* The lever: poll interval is the dominant cost driver */}
        <Reveal x={16} y={0}>
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-accent" />
              <h2 className="font-semibold">Lever: the poll loop</h2>
            </div>
            {est && lever ? (
              <>
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Always-on agents polling on a {est.assumptions.POLL_INTERVAL_SECONDS}s
                    loop are the dominant idle cost. Stretching the interval or
                    moving to event-push slashes the projected bill, same fleet,
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
                            ? "border-green-300 bg-green-50"
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
                            <p className="text-xs text-green-700">
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
        </Reveal>
      </div>

      <SpendTrendSection />
      <CostControlsSection />
      <PnlSection />
    </div>
  );
}

// --- Real spend trend (last 30 days) -----------------------------------------

type TrendDay = { date: string; costUsd: number; inputTokens: number; outputTokens: number; events: number };

function SpendTrendSection() {
  const { spaceId } = useActiveSpace();
  const trend = useQuery(api.costs.spendTrend, spaceId ? { spaceId, days: 30 } : "skip") as
    | TrendDay[]
    | undefined;

  const total = trend ? trend.reduce((s, d) => s + d.costUsd, 0) : 0;
  const max = trend ? Math.max(0.0001, ...trend.map((d) => d.costUsd)) : 0.0001;
  const hasAnySpend = trend ? trend.some((d) => d.costUsd > 0) : false;

  const reduce = useReducedMotion();

  return (
    <Reveal>
      <Card className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted" />
            <h2 className="font-semibold">Real spend, last 30 days</h2>
          </div>
          {trend && <span className="text-sm text-muted">Total {money(total)}</span>}
        </div>
        {trend === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : !hasAnySpend ? (
          <p className="text-sm text-muted">
            No recorded usage cost yet. This chart reflects real <code>usage.costUsd</code> rows, not
            the projection above.
          </p>
        ) : (
          <div className="flex h-32 items-end gap-[2px]" role="img" aria-label="Daily spend, last 30 days">
            {trend.map((d, i) => {
              const pct = Math.max(2, (d.costUsd / max) * 100);
              return (
                <div
                  key={d.date}
                  className="group relative flex-1"
                  title={`${d.date}: ${money(d.costUsd)}${d.events ? ` (${d.events} usage events)` : ""}`}
                >
                  <motion.div
                    className={`w-full origin-bottom rounded-t-sm transition-colors ${
                      d.costUsd > 0 ? "bg-accent/70 group-hover:bg-accent" : "bg-border"
                    }`}
                    initial={{ scaleY: reduce ? 1 : 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: reduce ? 0 : 0.4, delay: reduce ? 0 : i * 0.012, ease: EASE }}
                    style={{ height: `${pct}%` }}
                  />
                </div>
              );
            })}
          </div>
        )}
        {trend && trend.length > 0 && (
          <div className="mt-1 flex justify-between text-[10px] text-muted">
            <span>{trend[0].date}</span>
            <span>{trend[trend.length - 1].date}</span>
          </div>
        )}
      </Card>
    </Reveal>
  );
}

// =============================================================================
// Cost controls to the metal (feature 18): idle-hibernation policy, hard
// spend caps, and per-agent P&L.
// =============================================================================

type CostPolicy = {
  hibernationEnabled?: boolean;
  idleHibernateMinutes?: number;
  hardCapUsd?: number;
  hardCapAction?: "pause" | "stop_vms";
} | null;

type IdleAgent = {
  _id: Id<"agents">;
  name: string;
  idleState: "active" | "idle" | "hibernated";
  lastWorkAt: number | null;
  hibernatedAt: number | null;
  hibernationExempt: boolean;
  spendCapUsd: number | null;
  deploymentStatus: string | null;
};

function timeAgo(ts: number | null): string {
  if (!ts) return "never";
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function CostControlsSection() {
  const { spaceId, role } = useActiveSpace();
  const canManage = role === "admin" || role === "owner";
  const canOperate = role === "operator" || canManage;

  const policy = useQuery(api.costs.getCostPolicy, spaceId ? { spaceId } : "skip") as
    | CostPolicy
    | undefined;
  const fleet = useQuery(api.costs.fleetIdleStatus, spaceId ? { spaceId } : "skip") as
    | IdleAgent[]
    | undefined;

  const setPolicy = useMutation(api.costs.setCostPolicy);
  const wake = useMutation(api.costs.wakeAgent);
  const setExempt = useMutation(api.costs.setHibernationExempt);
  const setAgentCap = useMutation(api.costs.setAgentSpendCap);

  const [idleMinutes, setIdleMinutes] = useState("30");
  const [hardCap, setHardCap] = useState("");

  const hibernationEnabled = policy?.hibernationEnabled ?? false;
  const hardCapAction = policy?.hardCapAction ?? "pause";

  return (
    <Stagger className="mb-6 mt-6 grid gap-4 lg:grid-cols-2">
      <StaggerItem>
      <Card>
        <h2 className="mb-1 font-semibold">Idle hibernation</h2>
        <p className="mb-3 text-xs text-muted">
          Hosted agents idle past the threshold are marked idle, then hibernated (VM stopped) at
          2× the threshold. Exempt agents are never touched.
        </p>
        <div className="space-y-3">
          <Toggle
            checked={hibernationEnabled}
            onChange={(v) => spaceId && setPolicy({ spaceId, hibernationEnabled: v })}
            label="Enable idle hibernation"
          />
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={5}
              value={idleMinutes}
              onChange={(e) => setIdleMinutes(e.target.value)}
              className="w-24"
              disabled={!canManage}
            />
            <span className="text-sm text-muted">minutes idle before marking idle</span>
            {canManage && (
              <Button
                variant="outline"
                onClick={() =>
                  spaceId &&
                  setPolicy({ spaceId, idleHibernateMinutes: Math.max(5, Number(idleMinutes) || 30) })
                }
              >
                Save
              </Button>
            )}
          </div>
          {!canManage && (
            <p className="text-xs text-muted">Admin role required to change cost policy.</p>
          )}
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-sm font-medium">Hosted fleet idle status</p>
          {fleet === undefined ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : fleet.length === 0 ? (
            <p className="text-sm text-muted">No hosted agents in this Space.</p>
          ) : (
            <div className="space-y-2">
              {fleet.map((a) => (
                <div
                  key={a._id}
                  className="flex items-center justify-between rounded-lg border border-border p-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{a.name}</p>
                    <p className="text-xs text-muted">
                      last work {timeAgo(a.lastWorkAt)}
                      {a.hibernationExempt && " · exempt"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={a.idleState === "active" ? "green" : a.idleState === "idle" ? "yellow" : "red"}
                    >
                      {a.idleState}
                    </Badge>
                    {canOperate && a.idleState !== "active" && (
                      <button
                        onClick={() => spaceId && wake({ spaceId, agentId: a._id })}
                        className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
                        title="Wake"
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canOperate && (
                      <button
                        onClick={() =>
                          spaceId && setExempt({ spaceId, agentId: a._id, exempt: !a.hibernationExempt })
                        }
                        className="text-xs text-muted hover:text-foreground"
                      >
                        {a.hibernationExempt ? "un-exempt" : "exempt"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
      </StaggerItem>

      <StaggerItem>
      <Card>
        <h2 className="mb-1 font-semibold">Hard spend cap</h2>
        <p className="mb-3 text-xs text-muted">
          When month-to-date spend reaches the cap, autonomy is paused, and if set to "stop
          VMs", every hosted agent in this Space is stopped.
        </p>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">$</span>
            <Input
              type="number"
              min={0}
              value={hardCap || (policy?.hardCapUsd ? String(policy.hardCapUsd) : "")}
              onChange={(e) => setHardCap(e.target.value)}
              placeholder="0 = no cap"
              className="w-32"
              disabled={!canManage}
            />
            <span className="text-sm text-muted">/ month</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={hardCapAction === "pause"}
                disabled={!canManage}
                onChange={() => spaceId && setPolicy({ spaceId, hardCapAction: "pause" })}
              />
              Pause autonomy only
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={hardCapAction === "stop_vms"}
                disabled={!canManage}
                onChange={() => spaceId && setPolicy({ spaceId, hardCapAction: "stop_vms" })}
              />
              Pause + stop hosted VMs
            </label>
          </div>
          {canManage && (
            <Button
              variant="outline"
              onClick={() => spaceId && setPolicy({ spaceId, hardCapUsd: Math.max(0, Number(hardCap) || 0) })}
            >
              Save cap
            </Button>
          )}
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              This is enforcement against tracked usage cost, separate from the Convex-cost
              estimate above. Raise the cap here (or in Space settings) to resume after a stop.
            </span>
          </div>
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-sm font-medium">Per-agent spend caps</p>
          {fleet === undefined ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <div className="space-y-2">
              {fleet.map((a) => (
                <AgentCapRow
                  key={a._id}
                  agentId={a._id}
                  name={a.name}
                  spendCapUsd={a.spendCapUsd}
                  canManage={canOperate}
                  onSave={(v) => spaceId && setAgentCap({ spaceId, agentId: a._id, spendCapUsd: v })}
                />
              ))}
              {fleet.length === 0 && <p className="text-sm text-muted">No hosted agents.</p>}
            </div>
          )}
        </div>
      </Card>
      </StaggerItem>
    </Stagger>
  );
}

function AgentCapRow({
  name,
  spendCapUsd,
  canManage,
  onSave,
}: {
  agentId: Id<"agents">;
  name: string;
  spendCapUsd: number | null;
  canManage: boolean;
  onSave: (v: number | undefined) => void;
}) {
  const [value, setValue] = useState(spendCapUsd ? String(spendCapUsd) : "");
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="truncate">{name}</span>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="no cap"
          className="w-24"
          disabled={!canManage}
        />
        {canManage && (
          <Button variant="ghost" onClick={() => onSave(value ? Number(value) : undefined)}>
            Set
          </Button>
        )}
      </div>
    </div>
  );
}

// --- Per-agent P&L -----------------------------------------------------------

type PnlRow = {
  agentId: Id<"agents">;
  name: string;
  status: string;
  hosted: boolean;
  usageCostUsd: number;
  hostedHours: number;
  hostedCostUsd: number;
  totalCostUsd: number;
  revenueUsd: number;
  pnlUsd: number;
};

function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  return `${sign}$${v.toFixed(2)}`;
}

function PnlSection() {
  const { spaceId, role } = useActiveSpace();
  const canManage = role === "operator" || role === "admin" || role === "owner";
  const rows = useQuery(api.ledger.pnlByAgent, spaceId ? { spaceId } : "skip") as
    | PnlRow[]
    | undefined;
  const summary = useQuery(api.ledger.pnlSummary, spaceId ? { spaceId } : "skip") as
    | { totalCostUsd: number; totalRevenueUsd: number; totalPnlUsd: number; agentCount: number; profitableCount: number }
    | undefined;
  const setRevenue = useMutation(api.ledger.setAttributedRevenue);
  const [editingId, setEditingId] = useState<Id<"agents"> | null>(null);
  const [revInput, setRevInput] = useState("");

  return (
    <Reveal>
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Per-agent P&amp;L (month to date)</h2>
        {summary && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">
              Cost {money(summary.totalCostUsd)} · Revenue {money(summary.totalRevenueUsd)}
            </span>
            <span
              className={`flex items-center gap-1 font-semibold ${
                summary.totalPnlUsd >= 0 ? "text-green-700" : "text-red-600"
              }`}
            >
              {summary.totalPnlUsd >= 0 ? (
                <ArrowUp className="h-3.5 w-3.5" />
              ) : (
                <ArrowDown className="h-3.5 w-3.5" />
              )}
              {money(summary.totalPnlUsd)}
            </span>
          </div>
        )}
      </div>

      {rows === undefined ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">No agents in this Space yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Agent</th>
                <th className="py-2 pr-3 font-medium">Usage cost</th>
                <th className="py-2 pr-3 font-medium">Hosted hrs</th>
                <th className="py-2 pr-3 font-medium">Hosted cost</th>
                <th className="py-2 pr-3 font-medium">Total cost</th>
                <th className="py-2 pr-3 font-medium">Revenue</th>
                <th className="py-2 pr-3 font-medium">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.agentId} className="border-b border-border/50">
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 pr-3 text-muted">{money(r.usageCostUsd)}</td>
                  <td className="py-2 pr-3 text-muted">{r.hostedHours.toFixed(1)}</td>
                  <td className="py-2 pr-3 text-muted">{money(r.hostedCostUsd)}</td>
                  <td className="py-2 pr-3">{money(r.totalCostUsd)}</td>
                  <td className="py-2 pr-3">
                    {editingId === r.agentId ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={0}
                          autoFocus
                          value={revInput}
                          onChange={(e) => setRevInput(e.target.value)}
                          className="w-24"
                        />
                        <Button
                          variant="ghost"
                          onClick={() => {
                            if (spaceId) {
                              setRevenue({
                                spaceId,
                                agentId: r.agentId,
                                revenueUsd: Math.max(0, Number(revInput) || 0),
                              });
                            }
                            setEditingId(null);
                          }}
                        >
                          Save
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          if (!canManage) return;
                          setEditingId(r.agentId);
                          setRevInput(String(r.revenueUsd));
                        }}
                        className={canManage ? "underline decoration-dotted" : ""}
                        disabled={!canManage}
                      >
                        {money(r.revenueUsd)}
                      </button>
                    )}
                  </td>
                  <td
                    className={`py-2 pr-3 font-medium ${r.pnlUsd >= 0 ? "text-green-700" : "text-red-600"}`}
                  >
                    {money(r.pnlUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
    </Reveal>
  );
}
