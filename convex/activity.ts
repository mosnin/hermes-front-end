import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { getOwnerId } from "./lib/auth";

/** The live activity feed, newest first. Reactive: updates in real time. */
export const feed = query({
  args: {
    limit: v.optional(v.number()),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, { limit, agentId }) => {
    const ownerId = await getOwnerId(ctx);
    if (agentId) {
      return await ctx.db
        .query("activity")
        .withIndex("by_agent", (q) => q.eq("agentId", agentId))
        .order("desc")
        .take(limit ?? 100);
    }
    return await ctx.db
      .query("activity")
      .withIndex("by_owner_time", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(limit ?? 100);
  },
});

/** Append an activity event (used by the connector ingestion HTTP API). */
export const append = internalMutation({
  args: {
    ownerId: v.string(),
    agentId: v.optional(v.id("agents")),
    threadId: v.optional(v.id("threads")),
    type: v.string(),
    title: v.string(),
    detail: v.optional(v.string()),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("activity", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
