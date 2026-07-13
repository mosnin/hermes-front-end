import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { recordWorkEvent, recordNotification } from "./events";
import { bumpCounter, monthBucket } from "./counters";

// Rough per-event cost estimates (USD). Real token costs can be passed in
// explicitly via costUsd when known.
const COST: Record<string, number> = {
  message: 0.0005,
  step: 0.001,
  run: 0.002,
  tool: 0.001,
};

/** Start of the current UTC month (for monthly budget accounting). */
export function monthStartUtc(): number {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/**
 * Record a unit of usage and enforce the monthly budget: when a Space crosses
 * its budget, autonomy auto-pauses (kill switch) — no human needed.
 *
 * The month-to-date spend is kept in an O(1) running counter (see
 * lib/counters.ts) rather than scanning every usage row for the month on each
 * event. The detailed `usage` row is still written for analytics/history — a
 * single indexed insert — but budget enforcement never scans it.
 */
export async function recordUsage(
  ctx: MutationCtx,
  args: {
    companyId: string;
    spaceId: Id<"spaces">;
    agentId?: Id<"agents">;
    model?: string;
    kind: string;
    costUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
  },
): Promise<void> {
  const cost = args.costUsd ?? COST[args.kind] ?? 0;
  await ctx.db.insert("usage", {
    companyId: args.companyId,
    spaceId: args.spaceId,
    agentId: args.agentId,
    model: args.model,
    kind: args.kind,
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    costUsd: cost,
    createdAt: Date.now(),
  });

  // O(1): patch the month accumulator and read back the new total.
  const { valueUsd: total } = await bumpCounter(ctx, {
    companyId: args.companyId,
    spaceId: args.spaceId,
    scope: "usage",
    bucket: monthBucket(),
    count: 1,
    valueUsd: cost,
  });

  const space = await ctx.db.get(args.spaceId);
  const budget = space?.guardConfig?.monthlyBudgetUsd ?? 0;
  if (space && budget > 0 && !space.autonomyPaused && total >= budget) {
    await ctx.db.patch(args.spaceId, { autonomyPaused: true });
    await recordWorkEvent(ctx, {
      companyId: args.companyId,
      spaceId: args.spaceId,
      actorType: "system",
      category: "governance",
      action: "budget_exceeded",
      summary: `Monthly budget of $${budget} reached ($${total.toFixed(2)}) — autonomy paused`,
    });
    await recordNotification(ctx, {
      companyId: args.companyId,
      spaceId: args.spaceId,
      type: "system",
      title: "Budget reached — autonomy paused",
      body: `$${total.toFixed(2)} of $${budget} this month`,
      href: "/dashboard/ops",
    });
  }
}
