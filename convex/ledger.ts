import { v } from "convex/values";
import { query, mutation, internalMutation, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent } from "./lib/events";

/** The action ledger for a Space — every action agents take or propose, newest first. */
export const list = query({
  args: { spaceId: v.id("spaces"), status: v.optional(v.string()) },
  handler: async (ctx, { spaceId, status }) => {
    await resolveScope(ctx, spaceId);
    if (status) {
      return await ctx.db
        .query("actionLedger")
        .withIndex("by_space_status", (q) =>
          q.eq("spaceId", spaceId).eq("status", status as never),
        )
        .order("desc")
        .take(300);
    }
    return await ctx.db
      .query("actionLedger")
      .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(300);
  },
});

/** Append an action to the ledger. Used by the execution engine. */
export const record = internalMutation({
  args: {
    companyId: v.string(),
    spaceId: v.id("spaces"),
    agentId: v.optional(v.id("agents")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    action: v.string(),
    target: v.optional(v.string()),
    status: v.union(
      v.literal("proposed"),
      v.literal("executed"),
      v.literal("reverted"),
      v.literal("blocked"),
    ),
    reversible: v.optional(v.boolean()),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("actionLedger", {
      companyId: args.companyId,
      spaceId: args.spaceId,
      agentId: args.agentId,
      workflowRunId: args.workflowRunId,
      action: args.action,
      target: args.target,
      status: args.status,
      reversible: args.reversible,
      payload: args.payload,
      createdAt: Date.now(),
    });
  },
});

/** Roll back an executed, reversible action (admin+). */
export const revert = mutation({
  args: { spaceId: v.id("spaces"), entryId: v.id("actionLedger") },
  handler: async (ctx, { spaceId, entryId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const entry = await ctx.db.get(entryId);
    if (!entry || entry.spaceId !== spaceId) throw new Error("Not found");
    if (entry.status !== "executed" || !entry.reversible) {
      throw new Error("Only executed, reversible actions can be reverted");
    }
    await ctx.db.patch(entryId, {
      status: "reverted",
      decidedAt: Date.now(),
    });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId: entry.agentId,
      workflowRunId: entry.workflowRunId,
      category: "governance",
      action: "action_reverted",
      summary: `Reverted action: ${entry.action}${entry.target ? ` → ${entry.target}` : ""}`,
    });
  },
});

/** Counts of ledger entries by status for a Space. */
export const stats = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const rows = await ctx.db
      .query("actionLedger")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    const counts = { proposed: 0, executed: 0, reverted: 0, blocked: 0 };
    for (const r of rows) {
      if (r.status in counts) counts[r.status as keyof typeof counts] += 1;
    }
    return counts;
  },
});

// =============================================================================
// Per-agent P&L (feature 18): usage cost + hosted-agent-hours attributed to
// each agent, against a manually attributed revenue figure
// (agents.attributedRevenueUsd). This is a financial ledger, distinct from
// the action ledger above (agent-action audit trail) — both live in this
// file per the team's file ownership; names are namespaced (`pnl*`) to avoid
// any confusion with `list`/`record`/`revert`/`stats` above.
// =============================================================================

const HOURLY_VM_COST_USD = 0.15; // rough Cloudflare Container per-hour estimate; tune to your plan

/**
 * Estimated hosted-agent-hours for the current month: if currently running,
 * time since the later of (this month's start, createdAt); 0 otherwise. This
 * is a lower-bound estimate — deploymentStatus transitions aren't
 * timestamped, so hours accrued before a stop/restart this month aren't
 * reconstructable without a dedicated event log.
 */
function hostedHoursThisMonth(
  agent: { vmProvider?: string; deploymentStatus?: string; createdAt: number },
  monthStart: number,
  now: number,
): number {
  if (!agent.vmProvider || agent.deploymentStatus !== "running") return 0;
  const since = Math.max(monthStart, agent.createdAt);
  return Math.max(0, (now - since) / (1000 * 60 * 60));
}

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
  inputTokens: number;
  outputTokens: number;
};

/**
 * Shared computation for both pnlByAgent and pnlSummary — kept as a plain
 * helper (not a nested ctx.runQuery) so query-to-query composition doesn't
 * depend on the runtime forwarding auth context across the hop.
 */
async function computePnlRows(ctx: QueryCtx, spaceId: Id<"spaces">): Promise<PnlRow[]> {
  const now = Date.now();
  const d = new Date(now);
  const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);

  const agents = await ctx.db
    .query("agents")
    .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
    .collect();

  const usageRows = await ctx.db
    .query("usage")
    .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId).gte("createdAt", monthStart))
    .take(5000);

  const usageCostByAgent = new Map<string, number>();
  const tokensByAgent = new Map<string, { input: number; output: number }>();
  for (const r of usageRows) {
    if (!r.agentId) continue;
    usageCostByAgent.set(r.agentId, (usageCostByAgent.get(r.agentId) ?? 0) + (r.costUsd ?? 0));
    const t = tokensByAgent.get(r.agentId) ?? { input: 0, output: 0 };
    t.input += r.inputTokens ?? 0;
    t.output += r.outputTokens ?? 0;
    tokensByAgent.set(r.agentId, t);
  }

  return agents
    .map((a) => {
      const usageCostUsd = usageCostByAgent.get(a._id) ?? 0;
      const hostedHours = hostedHoursThisMonth(a, monthStart, now);
      const hostedCostUsd = hostedHours * HOURLY_VM_COST_USD;
      const totalCostUsd = usageCostUsd + hostedCostUsd;
      const revenueUsd = a.attributedRevenueUsd ?? 0;
      const tokens = tokensByAgent.get(a._id) ?? { input: 0, output: 0 };
      return {
        agentId: a._id,
        name: a.name,
        status: a.status,
        hosted: !!a.vmProvider,
        usageCostUsd,
        hostedHours: Math.round(hostedHours * 100) / 100,
        hostedCostUsd: Math.round(hostedCostUsd * 10000) / 10000,
        totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
        revenueUsd,
        pnlUsd: Math.round((revenueUsd - totalCostUsd) * 10000) / 10000,
        inputTokens: tokens.input,
        outputTokens: tokens.output,
      };
    })
    .sort((a, b) => b.pnlUsd - a.pnlUsd);
}

/**
 * Per-agent P&L for a Space, month-to-date: usage cost (from `usage` rows,
 * bounded scan — same caveat as costs.ts: no by_agent index) + estimated
 * hosted-VM-hours cost, against attributedRevenueUsd.
 */
export const pnlByAgent = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    return await computePnlRows(ctx, spaceId);
  },
});

/** Space-wide P&L rollup for the month, derived from the same per-agent rows. */
export const pnlSummary = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }): Promise<{
    totalCostUsd: number;
    totalRevenueUsd: number;
    totalPnlUsd: number;
    agentCount: number;
    profitableCount: number;
  }> => {
    await resolveScope(ctx, spaceId);
    const rows = await computePnlRows(ctx, spaceId);
    const totalCostUsd = rows.reduce((s, r) => s + r.totalCostUsd, 0);
    const totalRevenueUsd = rows.reduce((s, r) => s + r.revenueUsd, 0);
    return {
      totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
      totalRevenueUsd: Math.round(totalRevenueUsd * 10000) / 10000,
      totalPnlUsd: Math.round((totalRevenueUsd - totalCostUsd) * 10000) / 10000,
      agentCount: rows.length,
      profitableCount: rows.filter((r) => r.pnlUsd > 0).length,
    };
  },
});

/** Manually set (or clear) revenue attributed to an agent, for P&L (operator+). */
export const setAttributedRevenue = mutation({
  args: { spaceId: v.id("spaces"), agentId: v.id("agents"), revenueUsd: v.number() },
  handler: async (ctx, { spaceId, agentId, revenueUsd }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    if (revenueUsd < 0) throw new Error("revenueUsd must be >= 0");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Agent not found");
    await ctx.db.patch(agentId, { attributedRevenueUsd: revenueUsd });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "governance",
      action: "revenue_attributed",
      summary: `Set attributed revenue for ${agent.name} to $${revenueUsd}`,
    });
  },
});
