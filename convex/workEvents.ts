import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent } from "./lib/events";

/** The durable, queryable work record for a Space — "what got done". */
export const history = query({
  args: {
    spaceId: v.id("spaces"),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { spaceId, category, limit }) => {
    await resolveScope(ctx, spaceId);
    const rows = await ctx.db
      .query("workEvents")
      .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(limit ?? 200);
    return category ? rows.filter((e) => e.category === category) : rows;
  },
});

/** Manually record a note into the work record (operator+). */
export const note = mutation({
  args: { spaceId: v.id("spaces"), summary: v.string() },
  handler: async (ctx, { spaceId, summary }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      category: "note",
      action: "note",
      summary,
    });
  },
});
