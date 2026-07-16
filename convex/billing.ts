import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent } from "./lib/events";
import { PLAN_LIMITS, limitsOf, planOf } from "./lib/plans";

/** The current plan tier for a Space. */
export const plan = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const scope = await resolveScope(ctx, spaceId);
    return { plan: scope.space.plan ?? "free" };
  },
});

/**
 * Entitlements view for the Billing page: current plan, its limits, current
 * usage per limited resource, and the full plan matrix. Usage is what the
 * server actually enforces, so the UI can't drift from reality.
 */
export const entitlements = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const scope = await resolveScope(ctx, spaceId);
    const limits = limitsOf(scope);
    const count = async (
      table: "agents" | "workflows" | "bridges" | "apiKeys",
    ) =>
      (
        await ctx.db
          .query(table)
          .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
          .take(1000)
      ).length;
    return {
      plan: planOf(scope),
      limits,
      usage: {
        agents: await count("agents"),
        workflows: await count("workflows"),
        bridges: await count("bridges"),
        apiKeys: await count("apiKeys"),
      },
      matrix: PLAN_LIMITS,
    };
  },
});

/** Set the plan tier for a Space (admin only). Stripe metering is a later phase. */
export const setPlan = mutation({
  args: {
    spaceId: v.id("spaces"),
    plan: v.union(
      v.literal("free"),
      v.literal("team"),
      v.literal("enterprise"),
    ),
  },
  handler: async (ctx, { spaceId, plan }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    await ctx.db.patch(spaceId, { plan });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      category: "billing",
      action: "plan_changed",
      summary: `Plan -> ${plan}`,
    });
  },
});
