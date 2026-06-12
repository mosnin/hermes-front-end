import { v } from "convex/values";
import { query } from "./_generated/server";
import { resolveScope } from "./lib/auth";
import { DEFAULT_GUARD_CONFIG } from "./schema";

/** Usage + spend for the current month, with budget context. */
export const summary = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const scope = await resolveScope(ctx, spaceId);
    const d = new Date();
    const since = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    const rows = await ctx.db
      .query("usage")
      .withIndex("by_space_time", (q) =>
        q.eq("spaceId", spaceId).gte("createdAt", since),
      )
      .collect();

    const byKind: Record<string, { count: number; cost: number }> = {};
    let totalCost = 0;
    for (const u of rows) {
      const k = u.kind;
      byKind[k] = byKind[k] ?? { count: 0, cost: 0 };
      byKind[k].count++;
      byKind[k].cost += u.costUsd ?? 0;
      totalCost += u.costUsd ?? 0;
    }

    const budget =
      scope.space.guardConfig?.monthlyBudgetUsd ??
      DEFAULT_GUARD_CONFIG.monthlyBudgetUsd;

    return {
      monthStart: since,
      events: rows.length,
      totalCost,
      byKind,
      budget,
      budgetUsedPct: budget > 0 ? Math.min(1, totalCost / budget) : 0,
      autonomyPaused: scope.space.autonomyPaused ?? false,
    };
  },
});
