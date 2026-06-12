import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { resolveScope } from "./lib/auth";

/** The live activity feed for a Space (reactive). */
export const feed = query({
  args: {
    spaceId: v.id("spaces"),
    limit: v.optional(v.number()),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, { spaceId, limit, agentId }) => {
    await resolveScope(ctx, spaceId);
    if (agentId) {
      const rows = await ctx.db
        .query("activity")
        .withIndex("by_agent", (q) => q.eq("agentId", agentId))
        .order("desc")
        .take(limit ?? 100);
      return rows.filter((r) => r.spaceId === spaceId);
    }
    return await ctx.db
      .query("activity")
      .withIndex("by_space_time", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(limit ?? 100);
  },
});

/** Append an activity event. Token-authenticated connector path. */
export const append = internalMutation({
  args: {
    companyId: v.string(),
    spaceId: v.id("spaces"),
    agentId: v.optional(v.id("agents")),
    threadId: v.optional(v.id("threads")),
    type: v.string(),
    title: v.string(),
    detail: v.optional(v.string()),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("activity", { ...args, createdAt: Date.now() });
  },
});
