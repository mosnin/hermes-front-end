import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent } from "./lib/events";

/** The current plan tier for a Space. */
export const plan = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    const scope = await resolveScope(ctx, spaceId);
    return { plan: scope.space.plan ?? "free" };
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
