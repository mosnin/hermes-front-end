"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Input, Toggle } from "@/components/ui";
import { EASE } from "@/components/site/motion";
import { useActiveSpace } from "@/components/active-space";
import { AlertTriangle, ArrowDown, ArrowUp, Power } from "@/components/icons";
import { PageHead, PillButton, Panel, StatTile, StatRow, ListRow, Dot, SectionLabel } from "@/components/dash/kit";

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
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="cost · estimated"
          title="Cost (estimated)"
          sub={
            <>
              An <span className="font-medium text-[var(--foreground)]">estimate</span> of the operator&apos;s
              infrastructure cost (Convex function calls + writes) for this Space, modeled from observable
              activity. This is <span className="font-medium text-[var(--foreground)]">not the real Convex bill</span>,
              it is tunable via the assumption constants in{" "}
              <code className="rounded bg-[var(--surface)] px-1 py-0.5 text-[12.5px]">convex/costs.ts</code>. Users&apos;
              own agent compute + LLM tokens are tracked separately under Ops &amp; Analytics.
            </>
          }
        />

        <StatRow>
          <StatTile
            value={est?.alwaysOnAgents ?? 0}
            label="Always-on agents"
            hint={est ? `of ${est.totalAgents} total, online` : undefined}
            tone="ink"
          />
          <StatTile
            value={est?.estTotalFnCalls ?? 0}
            label="Est. fn calls / month"
            hint={est ? `${compact(est.estPollCallsPerMonth)} poll · ${compact(est.estEventCallsPerMonth)} event` : undefined}
          />
          <StatTile
            value={est ? Math.round(est.estConvexCostUsd) : 0}
            prefix="$"
            label="Est. Convex $ / month"
            hint="this Space, operator infra only"
          />
        </StatRow>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Cost breakdown">
            {est ? (
              <div className="space-y-3">
                {(
                  [
                    ["Polling (idle loop)", est.byCategory.poll.fnCalls, est.byCategory.poll.costUsd, "calls"],
                    ["Heartbeats", est.byCategory.heartbeat.fnCalls, est.byCategory.heartbeat.costUsd, "calls"],
                    ["Event-driven fn calls", est.byCategory.events.fnCalls, est.byCategory.events.costUsd, "calls"],
                    ["Document writes", est.byCategory.writes.writes, est.byCategory.writes.costUsd, "writes"],
                  ] as const
                ).map(([label, count, cost, unit]) => {
                  const pct = est.estConvexCostUsd > 0 ? (cost / est.estConvexCostUsd) * 100 : 0;
                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-[var(--muted)]">{label}</span>
                        <span className="text-[var(--foreground)]">
                          {compact(count)} {unit} · {usd(cost)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--surface)]">
                        <motion.div
                          className="h-1.5 rounded-full bg-[var(--foreground)]"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="mt-4 flex justify-between border-t border-[var(--border)] pt-3 text-[13.5px] font-medium text-[var(--foreground)]">
                  <span>Total (est.)</span>
                  <span>{usd(est.estConvexCostUsd)} / month</span>
                </div>
                <p className="mt-1 text-[12px] text-[var(--muted)]">
                  Month-to-date over {est.elapsedDays}d, projected to 30d. Observed: {est.observed.a2aMessages} A2A ·{" "}
                  {est.observed.runSteps} steps · {est.observed.activity} activity · {est.observed.workEvents} work
                  events · {est.observed.usageRows} usage rows.
                </p>
              </div>
            ) : (
              <p className="text-[13.5px] text-[var(--muted)]">Estimating…</p>
            )}
          </Panel>

          <Panel title="Lever: the poll loop">
            {est && lever ? (
              <>
                <div className="mb-4 flex items-start gap-2.5 rounded-[14px] bg-[#fdf3e3] px-4 py-3 text-[13px] text-[#8a6116]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Always-on agents polling on a {est.assumptions.POLL_INTERVAL_SECONDS}s loop are the dominant idle
                    cost. Stretching the interval or moving to event-push slashes the projected bill, same fleet,
                    same work done.
                  </span>
                </div>
                <div>
                  {leverRows.map((row) => {
                    const savings = base > 0 ? 1 - row.proj.costUsd / base : 0;
                    return (
                      <ListRow
                        key={row.label}
                        leading={row.accent ? <Dot tone="online" /> : undefined}
                        title={row.label}
                        meta={`${compact(row.proj.fnCalls)} fn calls / month`}
                        trailing={
                          <div className="text-right">
                            <p className="font-medium text-[var(--foreground)]">
                              {usd(row.proj.costUsd)} <span className="font-normal text-[var(--muted)]">/ mo</span>
                            </p>
                            {savings > 0.001 && <p className="text-[11.5px] text-[#2a7a3b]">-{Math.round(savings * 100)}% vs 2s</p>}
                          </div>
                        }
                      />
                    );
                  })}
                </div>
                <p className="mt-4 text-[12px] text-[var(--muted)]">
                  Event-driven calls and writes are held constant across scenarios; only the idle poll volume
                  changes. Tune assumptions in{" "}
                  <code className="rounded bg-[var(--surface)] px-1 py-0.5">convex/costs.ts</code>.
                </p>
              </>
            ) : (
              <p className="text-[13.5px] text-[var(--muted)]">Estimating…</p>
            )}
          </Panel>
        </div>

        <SpendTrendSection />
        <CostControlsSection />
        <PnlSection />
      </div>
    </div>
  );
}

// --- Real spend trend (last 30 days) -----------------------------------------

type TrendDay = { date: string; costUsd: number; inputTokens: number; outputTokens: number; events: number };

function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  return `${sign}$${v.toFixed(2)}`;
}

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
    <div>
      <SectionLabel>real spend · last 30 days</SectionLabel>
      <Panel action={trend && <span className="text-[13px] text-[var(--muted)]">Total {money(total)}</span>}>
        {trend === undefined ? (
          <p className="text-[13.5px] text-[var(--muted)]">Loading…</p>
        ) : !hasAnySpend ? (
          <p className="text-[13.5px] text-[var(--muted)]">
            No recorded usage cost yet. This chart reflects real <code>usage.costUsd</code> rows, not the projection
            above.
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
                      d.costUsd > 0 ? "bg-[var(--foreground)]/70 group-hover:bg-[var(--foreground)]" : "bg-[var(--border)]"
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
          <div className="mt-2 flex justify-between text-[11px] text-[var(--muted)]">
            <span>{trend[0].date}</span>
            <span>{trend[trend.length - 1].date}</span>
          </div>
        )}
      </Panel>
    </div>
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

function idleTimeAgo(ts: number | null): string {
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
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Idle hibernation">
        <p className="mb-4 text-[12.5px] text-[var(--muted)]">
          Hosted agents idle past the threshold are marked idle, then hibernated (VM stopped) at 2x the threshold.
          Exempt agents are never touched.
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
            <span className="text-[13px] text-[var(--muted)]">minutes idle before marking idle</span>
            {canManage && (
              <PillButton
                variant="outline"
                onClick={() =>
                  spaceId &&
                  setPolicy({ spaceId, idleHibernateMinutes: Math.max(5, Number(idleMinutes) || 30) })
                }
              >
                Save
              </PillButton>
            )}
          </div>
          {!canManage && <p className="text-[12px] text-[var(--muted)]">Admin role required to change cost policy.</p>}
        </div>

        <div className="mt-5">
          <SectionLabel>hosted fleet idle status</SectionLabel>
          {fleet === undefined ? (
            <p className="text-[13.5px] text-[var(--muted)]">Loading…</p>
          ) : fleet.length === 0 ? (
            <p className="text-[13.5px] text-[var(--muted)]">No hosted agents in this Space.</p>
          ) : (
            <div>
              {fleet.map((a) => (
                <ListRow
                  key={a._id}
                  leading={
                    <Dot tone={a.idleState === "active" ? "online" : a.idleState === "idle" ? "paused" : "error"} />
                  }
                  title={a.name}
                  meta={`last work ${idleTimeAgo(a.lastWorkAt)}${a.hibernationExempt ? " · exempt" : ""}`}
                  trailing={
                    canOperate ? (
                      <div className="flex items-center gap-3">
                        {a.idleState !== "active" && (
                          <button
                            onClick={() => spaceId && wake({ spaceId, agentId: a._id })}
                            title="Wake"
                            className="grid h-7 w-7 place-items-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                          >
                            <Power className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => spaceId && setExempt({ spaceId, agentId: a._id, exempt: !a.hibernationExempt })}
                          className="text-[12px] text-[var(--muted)] hover:text-[var(--foreground)]"
                        >
                          {a.hibernationExempt ? "un-exempt" : "exempt"}
                        </button>
                      </div>
                    ) : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Hard spend cap">
        <p className="mb-4 text-[12.5px] text-[var(--muted)]">
          When month-to-date spend reaches the cap, autonomy is paused, and if set to "stop VMs", every hosted agent
          in this Space is stopped.
        </p>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[var(--muted)]">$</span>
            <Input
              type="number"
              min={0}
              value={hardCap || (policy?.hardCapUsd ? String(policy.hardCapUsd) : "")}
              onChange={(e) => setHardCap(e.target.value)}
              placeholder="0 = no cap"
              className="w-32"
              disabled={!canManage}
            />
            <span className="text-[13px] text-[var(--muted)]">/ month</span>
          </div>
          <div className="flex items-center gap-4 text-[13px]">
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
            <PillButton
              variant="outline"
              onClick={() => spaceId && setPolicy({ spaceId, hardCapUsd: Math.max(0, Number(hardCap) || 0) })}
            >
              Save cap
            </PillButton>
          )}
          <div className="flex items-start gap-2 rounded-[14px] bg-[#fdf3e3] px-3.5 py-2.5 text-[12px] text-[#8a6116]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              This is enforcement against tracked usage cost, separate from the Convex-cost estimate above. Raise the
              cap here (or in Space settings) to resume after a stop.
            </span>
          </div>
        </div>

        <div className="mt-5">
          <SectionLabel>per-agent spend caps</SectionLabel>
          {fleet === undefined ? (
            <p className="text-[13.5px] text-[var(--muted)]">Loading…</p>
          ) : fleet.length === 0 ? (
            <p className="text-[13.5px] text-[var(--muted)]">No hosted agents.</p>
          ) : (
            <div>
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
            </div>
          )}
        </div>
      </Panel>
    </div>
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
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-1 py-3 text-[13.5px] last:border-0">
      <span className="truncate text-[var(--foreground)]">{name}</span>
      <div className="flex shrink-0 items-center gap-1.5">
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
          <PillButton variant="outline" onClick={() => onSave(value ? Number(value) : undefined)}>
            Set
          </PillButton>
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
    <div>
      <SectionLabel>per-agent p&amp;l · month to date</SectionLabel>
      <Panel
        action={
          summary && (
            <div className="flex items-center gap-3 text-[13px]">
              <span className="text-[var(--muted)]">
                Cost {money(summary.totalCostUsd)} · Revenue {money(summary.totalRevenueUsd)}
              </span>
              <span
                className={`flex items-center gap-1 font-semibold ${
                  summary.totalPnlUsd >= 0 ? "text-[#2a7a3b]" : "text-[#b3261e]"
                }`}
              >
                {summary.totalPnlUsd >= 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                {money(summary.totalPnlUsd)}
              </span>
            </div>
          )
        }
      >
        {rows === undefined ? (
          <p className="text-[13.5px] text-[var(--muted)]">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-[13.5px] text-[var(--muted)]">No agents in this Space yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[11.5px] uppercase tracking-wide text-[var(--muted)]">
                  <th className="py-2.5 pr-3 font-medium">Agent</th>
                  <th className="py-2.5 pr-3 font-medium">Usage cost</th>
                  <th className="py-2.5 pr-3 font-medium">Hosted hrs</th>
                  <th className="py-2.5 pr-3 font-medium">Hosted cost</th>
                  <th className="py-2.5 pr-3 font-medium">Total cost</th>
                  <th className="py-2.5 pr-3 font-medium">Revenue</th>
                  <th className="py-2.5 pr-3 font-medium">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.agentId} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2.5 pr-3 text-[var(--foreground)]">{r.name}</td>
                    <td className="py-2.5 pr-3 text-[var(--muted)]">{money(r.usageCostUsd)}</td>
                    <td className="py-2.5 pr-3 text-[var(--muted)]">{r.hostedHours.toFixed(1)}</td>
                    <td className="py-2.5 pr-3 text-[var(--muted)]">{money(r.hostedCostUsd)}</td>
                    <td className="py-2.5 pr-3 text-[var(--foreground)]">{money(r.totalCostUsd)}</td>
                    <td className="py-2.5 pr-3">
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
                          <PillButton
                            variant="outline"
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
                          </PillButton>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            if (!canManage) return;
                            setEditingId(r.agentId);
                            setRevInput(String(r.revenueUsd));
                          }}
                          className={canManage ? "text-[var(--foreground)] underline decoration-dotted" : "text-[var(--foreground)]"}
                          disabled={!canManage}
                        >
                          {money(r.revenueUsd)}
                        </button>
                      )}
                    </td>
                    <td className={`py-2.5 pr-3 font-medium ${r.pnlUsd >= 0 ? "text-[#2a7a3b]" : "text-[#b3261e]"}`}>
                      {money(r.pnlUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
