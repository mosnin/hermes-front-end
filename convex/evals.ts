import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";

export const log = mutation({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.id("agents"),
    rating: v.number(),
    dimension: v.optional(v.string()),
    comment: v.optional(v.string()),
    threadId: v.optional(v.id("threads")),
  },
  handler: async (ctx, { spaceId, agentId, rating, dimension, comment, threadId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.spaceId !== spaceId) throw new Error("Not found");
    return await ctx.db.insert("evals", {
      companyId: scope.companyId,
      spaceId,
      agentId,
      threadId,
      rating,
      dimension,
      comment,
      source: "human",
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: {
    spaceId: v.id("spaces"),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, { spaceId, agentId }) => {
    await resolveScope(ctx, spaceId);
    if (agentId) {
      return await ctx.db
        .query("evals")
        .withIndex("by_agent", (q) => q.eq("agentId", agentId))
        .order("desc")
        .take(200);
    }
    return await ctx.db
      .query("evals")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .take(200);
  },
});

export const scorecards = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    const [agents, evals] = await Promise.all([
      ctx.db
        .query("agents")
        .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
        .collect(),
      ctx.db
        .query("evals")
        .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
        .collect(),
    ]);

    return agents
      .map((a) => {
        const mine = evals.filter((e) => e.agentId === a._id);
        const count = mine.length;
        const avg = count ? mine.reduce((s, e) => s + e.rating, 0) / count : 0;
        return { agentId: a._id, name: a.name, count, avg };
      })
      .sort((a, b) => b.avg - a.avg);
  },
});

export const remove = mutation({
  args: { spaceId: v.id("spaces"), evalId: v.id("evals") },
  handler: async (ctx, { spaceId, evalId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "operator");
    const row = await ctx.db.get(evalId);
    if (!row || row.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.delete(evalId);
  },
});
