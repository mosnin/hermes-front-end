import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { resolveScope, requireRole } from "./lib/auth";
import { recordWorkEvent } from "./lib/events";

/** List chat bridges for a Space (newest first). */
export const list = query({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, { spaceId }) => {
    await resolveScope(ctx, spaceId);
    return await ctx.db
      .query("bridges")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .order("desc")
      .collect();
  },
});

/** Connect a new chat bridge (Slack / Telegram / Discord). */
export const connect = mutation({
  args: {
    spaceId: v.id("spaces"),
    type: v.string(),
    name: v.string(),
    agentId: v.optional(v.id("agents")),
    config: v.optional(v.any()),
  },
  handler: async (ctx, { spaceId, type, name, agentId, config }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const now = Date.now();
    const bridgeId = await ctx.db.insert("bridges", {
      companyId: scope.companyId,
      spaceId,
      type,
      name,
      status: "connected",
      config,
      agentId,
      createdAt: now,
      updatedAt: now,
    });
    await recordWorkEvent(ctx, {
      companyId: scope.companyId,
      spaceId,
      actorType: "user",
      actorId: scope.userId,
      agentId,
      category: "integration",
      action: "bridge_connected",
      summary: `Connected ${type} bridge`,
    });
    return bridgeId;
  },
});

/** Route a bridge's incoming messages to an agent (or clear the routing). */
export const setAgent = mutation({
  args: {
    spaceId: v.id("spaces"),
    bridgeId: v.id("bridges"),
    agentId: v.union(v.id("agents"), v.null()),
  },
  handler: async (ctx, { spaceId, bridgeId, agentId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const row = await ctx.db.get(bridgeId);
    if (!row || row.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.patch(bridgeId, {
      agentId: agentId ?? undefined,
      updatedAt: Date.now(),
    });
  },
});

/** Remove a chat bridge. */
export const remove = mutation({
  args: { spaceId: v.id("spaces"), bridgeId: v.id("bridges") },
  handler: async (ctx, { spaceId, bridgeId }) => {
    const scope = await resolveScope(ctx, spaceId);
    requireRole(scope, "admin");
    const row = await ctx.db.get(bridgeId);
    if (!row || row.spaceId !== spaceId) throw new Error("Not found");
    await ctx.db.delete(bridgeId);
  },
});
