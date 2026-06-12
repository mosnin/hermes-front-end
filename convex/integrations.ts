import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";

export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("integrations")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .collect();
  },
});

export const connect = mutation({
  args: {
    spaceId: v.id("spaces"),
    type: v.string(),
    name: v.string(),
    config: v.optional(v.any()),
  },
  handler: async (ctx, { spaceId, type, name, config }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const now = Date.now();
    return await ctx.db.insert("integrations", {
      companyId: scope.companyId,
      spaceId,
      type,
      name,
      status: "connected",
      config,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setStatus = mutation({
  args: {
    spaceId: v.id("spaces"),
    integrationId: v.id("integrations"),
    status: v.union(
      v.literal("connected"),
      v.literal("disconnected"),
      v.literal("error"),
    ),
  },
  handler: async (ctx, { spaceId, integrationId, status }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const row = await ctx.db.get(integrationId);
    if (!row || row.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.patch(integrationId, { status, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { spaceId: v.id("spaces"), integrationId: v.id("integrations") },
  handler: async (ctx, { spaceId, integrationId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const row = await ctx.db.get(integrationId);
    if (!row || row.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.delete(integrationId);
  },
});
