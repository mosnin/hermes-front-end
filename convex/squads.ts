import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";

export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("squads")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
  },
});

export const create = mutation({
  args: {
    spaceId: v.id("spaces"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { spaceId, name, description }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    return await ctx.db.insert("squads", {
      companyId: scope.companyId,
      spaceId,
      name,
      description,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { spaceId: v.id("spaces"), squadId: v.id("squads") },
  handler: async (ctx, { spaceId, squadId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const squad = await ctx.db.get(squadId);
    if (!squad || squad.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.delete(squadId);
  },
});
