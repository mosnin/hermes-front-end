import { v } from "convex/values";
import { query } from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";
import { assertFeature } from "./lib/plans";

/** Export the immutable work record for a Space (admin+) — JSON download. */
export const export_ = query({
  args: { spaceId: v.id("spaces"), sinceDays: v.optional(v.number()) },
  handler: async (ctx, { spaceId, sinceDays }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    assertFeature(scope, "audit_export"); // enterprise entitlement
    const since = Date.now() - (sinceDays ?? 30) * 86_400_000;
    const rows = await ctx.db
      .query("workEvents")
      .withIndex("by_space_time", (q) =>
        q.eq("spaceId", spaceId).gte("createdAt", since),
      )
      .order("desc")
      .take(5000);
    return rows.map((e) => ({
      at: new Date(e.createdAt).toISOString(),
      actorType: e.actorType,
      actorId: e.actorId ?? null,
      agentId: e.agentId ?? null,
      category: e.category,
      action: e.action,
      summary: e.summary,
    }));
  },
});

/** Browse the immutable work record for a Space (admin+). */
export const list = query({
  args: {
    spaceId: v.id("spaces"),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { spaceId, category, limit }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const rows = await ctx.db
      .query("workEvents")
      .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(limit ?? 500);
    return category ? rows.filter((e) => e.category === category) : rows;
  },
});
